/**
 * Download ALL files from the given Supabase Storage buckets to a local
 * directory, preserving the bucket/path structure. Used by the weekly
 * off-site backup workflow (scripts/backup-storage.sh) which then tars,
 * encrypts (gpg symmetric) and uploads the result to Cloudflare R2.
 *
 * Required env vars:
 *   SUPABASE_URL               — https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (buckets are private)
 *   BACKUP_DIR                 — local output directory (created if missing)
 * Optional:
 *   BACKUP_BUCKETS             — comma-separated bucket list (default: "documents,signatures")
 *
 * Fail-loud: ANY file that cannot be listed or downloaded after retries
 * aborts the process with exit code 1 — a silently incomplete backup is
 * worse than a failed one.
 *
 * GDPR note: file paths may contain personal data (original file names).
 * This script NEVER logs file names/paths — only counts and byte totals.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const LIST_PAGE_SIZE = 1000;
const MAX_RETRIES = 3;
const DOWNLOAD_CONCURRENCY = 5;

interface StorageEntry {
  name: string;
  /** Supabase returns id === null for "folder" placeholders */
  id: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delayMs = attempt * 2000;
      console.warn(`WARN: ${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed after ${MAX_RETRIES} attempts`);
}

/** Recursively list all file paths in a bucket (folders have id === null). */
async function listAllFiles(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;

  for (;;) {
    const page = await withRetries(`list ${bucket} (offset ${offset})`, async () => {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`list failed: ${error.message}`);
      return (data ?? []) as StorageEntry[];
    });

    for (const entry of page) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // Folder placeholder — recurse
        files.push(...(await listAllFiles(supabase, bucket, fullPath)));
      } else {
        files.push(fullPath);
      }
    }

    if (page.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return files;
}

async function downloadFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  outDir: string,
): Promise<number> {
  const blob = await withRetries(`download from ${bucket}`, async () => {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) throw new Error(`download failed: ${error?.message ?? 'no data'}`);
    return data;
  });

  const buffer = Buffer.from(await blob.arrayBuffer());
  const target = join(outDir, bucket, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return buffer.byteLength;
}

/** Simple promise pool — at most `size` downloads in flight. */
async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(lanes);
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const backupDir = requireEnv('BACKUP_DIR');
  const buckets = (process.env.BACKUP_BUCKETS ?? 'documents,signatures')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let totalFiles = 0;
  let totalBytes = 0;

  for (const bucket of buckets) {
    console.log(`Listing bucket "${bucket}"...`);
    const files = await listAllFiles(supabase, bucket, '');
    console.log(`Bucket "${bucket}": ${files.length} file(s) to download`);

    let bucketBytes = 0;
    await runPool(files, DOWNLOAD_CONCURRENCY, async (path) => {
      bucketBytes += await downloadFile(supabase, bucket, path, backupDir);
    });

    totalFiles += files.length;
    totalBytes += bucketBytes;
    console.log(`Bucket "${bucket}": done (${(bucketBytes / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log(`Storage download complete: ${totalFiles} file(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error(`ERROR: storage backup failed: ${message}`);
  process.exit(1);
});
