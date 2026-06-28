/**
 * Sentry context helpers — add filterable tags to errors without exposing PII.
 *
 * Why hashed: caseId/userId in plain are identifiers but reasonably non-sensitive
 * in our domain (UUIDs not derivable to person without DB access). Hashing
 * provides an extra layer so Sentry data alone never re-identifies anyone, while
 * still allowing "show me all errors for this case" filtering.
 */

import * as Sentry from '@sentry/nextjs';

/**
 * 8-char prefix of SHA-256(value) — enough to filter, short enough to read.
 * Pure deterministic: same input always same hash for filter join.
 */
async function shortHash(value: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(value);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 8);
}

interface SentryFilterTags {
  caseId?: string;
  userId?: string;
  /** Pipeline mode currently running (full/extraction_only/...). */
  pipelineMode?: string;
  /** Inngest step name when applicable. */
  step?: string;
  /** Module identifier (synthesis/extraction/ocr/...) */
  module?: string;
}

/**
 * Wrap an operation with Sentry tags so any captured errors are filterable.
 * The tags are scoped to this call — they don't leak globally.
 *
 * Usage:
 *   await withSentryTags({ caseId, userId, module: 'synthesis' }, async () => {
 *     // ... code that may throw ...
 *   });
 */
export async function withSentryTags<T>(
  tags: SentryFilterTags,
  fn: () => Promise<T>,
): Promise<T> {
  const hashedTags: Record<string, string> = {};
  if (tags.caseId) hashedTags['case_hash'] = await shortHash(tags.caseId);
  if (tags.userId) hashedTags['user_hash'] = await shortHash(tags.userId);
  if (tags.pipelineMode) hashedTags['pipeline_mode'] = tags.pipelineMode;
  if (tags.step) hashedTags['step'] = tags.step;
  if (tags.module) hashedTags['module'] = tags.module;

  return Sentry.withScope(async (scope) => {
    for (const [key, value] of Object.entries(hashedTags)) {
      scope.setTag(key, value);
    }
    return fn();
  });
}
