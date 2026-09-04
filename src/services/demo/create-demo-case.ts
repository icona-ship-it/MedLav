/**
 * Crea il caso dimostrativo per un utente: caso cronistoria già "completato"
 * con documenti (PDF veri nello storage), pagine (testo OCR) ed eventi con
 * ambito temporale. Nessuna chiamata a Inngest/Mistral, nessun credito.
 * Idempotente: se l'utente ha già un caso DEMO-, restituisce quello.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logAccess } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { DEMO_DOCUMENTS, DEMO_CODE_PREFIX } from './demo-case-data';
import { buildDemoPdf } from './demo-pdf';
import {
  buildDemoCaseCode, buildDemoCaseRow, buildDemoDocumentRow, buildDemoEventRows, buildDemoPageRows,
  type DemoDocumentRef,
} from './demo-rows';

const STORAGE_BUCKET = 'documents';
const CODE_ATTEMPTS = 10;

export interface DemoCaseResult {
  caseId: string;
  code: string;
  existed: boolean;
}

type Admin = ReturnType<typeof createAdminClient>;

async function findExistingDemoCase(admin: Admin, userId: string): Promise<DemoCaseResult | null> {
  const { data } = await admin
    .from('cases')
    .select('id, code')
    .eq('user_id', userId)
    .like('code', `${DEMO_CODE_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = data?.[0];
  return row ? { caseId: row.id as string, code: row.code as string, existed: true } : null;
}

/** Codice DEMO-YYYY-NNN unico (il vincolo su cases.code è globale): riprova su collisione. */
async function insertDemoCase(admin: Admin, userId: string): Promise<{ caseId: string; code: string } | null> {
  const year = new Date().getFullYear();
  const { count } = await admin
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .like('code', `${DEMO_CODE_PREFIX}${year}-%`);
  let sequence = (count ?? 0) + 1;
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++, sequence++) {
    const code = buildDemoCaseCode(year, sequence);
    const { data, error } = await admin.from('cases').insert(buildDemoCaseRow({ userId, code })).select('id').single();
    if (!error && data) return { caseId: data.id as string, code };
    if (error?.code !== '23505') {
      logger.error('demo', 'Creazione caso demo fallita', { code: error?.code });
      return null;
    }
  }
  return null;
}

async function uploadDemoPdf(admin: Admin, storagePath: string, bytes: Uint8Array): Promise<boolean> {
  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) logger.warn('demo', 'Upload PDF demo fallito (il documento resta consultabile come testo)', { code: error.message });
  return !error;
}

async function insertDemoDocuments(admin: Admin, userId: string, caseId: string): Promise<DemoDocumentRef[] | null> {
  const refs: DemoDocumentRef[] = [];
  for (const doc of DEMO_DOCUMENTS) {
    const bytes = await buildDemoPdf(doc.pages);
    const storagePath = `${userId}/${caseId}/${crypto.randomUUID()}.pdf`;
    await uploadDemoPdf(admin, storagePath, bytes);
    const { data, error } = await admin
      .from('documents')
      .insert(buildDemoDocumentRow({ caseId, doc, storagePath, fileSize: bytes.byteLength }))
      .select('id')
      .single();
    if (error || !data) {
      logger.error('demo', 'Inserimento documento demo fallito', { code: error?.code });
      return null;
    }
    const documentId = data.id as string;
    const { error: pagesError } = await admin.from('pages').insert(buildDemoPageRows(documentId, doc));
    if (pagesError) {
      logger.error('demo', 'Inserimento pagine demo fallito', { code: pagesError.code });
      return null;
    }
    refs.push({ key: doc.key, id: documentId });
  }
  return refs;
}

/** Rollback best-effort: il caso cascade-cancella documenti/pagine/eventi. */
async function discardDemoCase(admin: Admin, caseId: string): Promise<void> {
  await admin.from('cases').delete().eq('id', caseId);
}

export async function createDemoCase(userId: string): Promise<DemoCaseResult | null> {
  const admin = createAdminClient();
  const existing = await findExistingDemoCase(admin, userId);
  if (existing) return existing;

  const created = await insertDemoCase(admin, userId);
  if (!created) return null;
  const { caseId, code } = created;

  const docs = await insertDemoDocuments(admin, userId, caseId);
  if (!docs) {
    await discardDemoCase(admin, caseId);
    return null;
  }
  const { error: eventsError } = await admin.from('events').insert(buildDemoEventRows(caseId, docs));
  if (eventsError) {
    logger.error('demo', 'Inserimento eventi demo fallito', { code: eventsError.code });
    await discardDemoCase(admin, caseId);
    return null;
  }

  logAccess({ userId, action: 'demo_case.created', entityType: 'case', entityId: caseId, metadata: { code } });
  return { caseId, code, existed: false };
}
