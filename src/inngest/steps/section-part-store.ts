/**
 * Store su Supabase Storage per i CONTENUTI di sezione generati dalla pipeline.
 *
 * PERCHÉ (affidabilità 2026-07-04): Inngest memoizza l'output di ogni step e
 * ritrasmette l'INTERO stato del run a ogni invocazione successiva. Le finestre
 * della doc-sanitaria ritornavano il testo completo → su un macrodanno lo stato
 * cresceva con la dimensione del fascicolo fino a rompere la finalizzazione
 * ("server reset the connection", 2026-06-29). Con questo store gli step
 * salvano il testo su Storage e ritornano solo un PUNTATORE (path) + metadati:
 * lo stato del run resta O(1) rispetto alla dimensione del caso → la pipeline
 * arriva in fondo a prescindere da quanti documenti/eventi ha il fascicolo.
 *
 * GDPR Art. 9: bucket PRIVATO nello stesso progetto Supabase EU dei documenti;
 * i contenuti sono transitori (il report finale vive nella tabella reports) —
 * cleanup best-effort a fine pipeline + cancellazione garantita con il caso
 * (delete-case-data). Path senza dati personali (solo caseId/sectionId/chiave).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export const SECTION_PARTS_BUCKET = 'section-parts';

/** Path deterministico di una parte (idempotente sui retry Inngest: upsert). */
export function sectionPartPath(caseId: string, sectionId: string, key: string): string {
  return `${caseId}/${sectionId}/${key}.md`;
}

let bucketEnsured = false;

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>): Promise<void> {
  if (bucketEnsured) return;
  // createBucket fallisce se esiste già: è il caso normale, non un errore.
  const { error } = await supabase.storage.createBucket(SECTION_PARTS_BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    // Errore REALE (non "esiste già"): NON marcare ensured — su un'istanza warm
    // il prossimo tentativo deve riprovare la creazione, non fallire a vuoto
    // su "Bucket not found" (review 2026-07-04).
    logger.warn('section-part-store', `createBucket: ${error.message} — riproverò al prossimo uso`);
    return;
  }
  bucketEnsured = true;
}

/**
 * Salva una parte di sezione. Upsert: il re-run di uno step Inngest (retry)
 * riscrive lo stesso path senza duplicare. Ritorna il path.
 */
export async function saveSectionPart(
  caseId: string,
  sectionId: string,
  key: string,
  content: string,
): Promise<string> {
  const supabase = createAdminClient();
  await ensureBucket(supabase);
  const path = sectionPartPath(caseId, sectionId, key);
  const { error } = await supabase.storage
    .from(SECTION_PARTS_BUCKET)
    .upload(path, Buffer.from(content, 'utf-8'), {
      upsert: true,
      contentType: 'text/markdown; charset=utf-8',
    });
  if (error) {
    throw new Error(`section-part-store: upload fallito per ${path}: ${error.message}`);
  }
  return path;
}

/** Carica una parte. Lancia se assente/illeggibile (lo step chiamante decide il fallback). */
export async function loadSectionPart(path: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(SECTION_PARTS_BUCKET).download(path);
  if (error || !data) {
    throw new Error(`section-part-store: download fallito per ${path}: ${error?.message ?? 'vuoto'}`);
  }
  return await data.text();
}

/**
 * Risolve il contenuto delle sezioni che portano un contentPath (testo su
 * Storage) al posto del content inline. Loader iniettabile → testabile puro.
 */
export async function resolveSectionContents<T extends { content: string; contentPath?: string }>(
  sections: T[],
  loader: (path: string) => Promise<string> = loadSectionPart,
): Promise<T[]> {
  return Promise.all(
    sections.map(async (section) => {
      if (!section.contentPath || section.content.length > 0) return section;
      return { ...section, content: await loader(section.contentPath) };
    }),
  );
}

/**
 * Cleanup di TUTTE le parti di un caso (fine pipeline / cancellazione caso).
 * Best-effort a fine pipeline (un residuo non rompe nulla e viene comunque
 * eliminato con il caso); DEVE essere invocata dalla cancellazione del caso
 * per la garanzia GDPR.
 */
export async function deleteCaseSectionParts(caseId: string): Promise<void> {
  const supabase = createAdminClient();
  try {
    // list è per-cartella: raccogli i file di ogni sezione del caso.
    // limit esplicito (default 100): la garanzia GDPR non deve rompersi in
    // silenzio se il numero di parti cresce (review 2026-07-04).
    const { data: sectionDirs } = await supabase.storage.from(SECTION_PARTS_BUCKET).list(caseId, { limit: 1000 });
    if (!sectionDirs || sectionDirs.length === 0) return;
    const paths: string[] = [];
    for (const dir of sectionDirs) {
      if (dir.name && dir.id === null) {
        // sottocartella (sectionId) → lista i file dentro
        const { data: files } = await supabase.storage
          .from(SECTION_PARTS_BUCKET)
          .list(`${caseId}/${dir.name}`, { limit: 1000 });
        for (const f of files ?? []) paths.push(`${caseId}/${dir.name}/${f.name}`);
      } else if (dir.name) {
        paths.push(`${caseId}/${dir.name}`);
      }
    }
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(SECTION_PARTS_BUCKET).remove(paths);
      if (error) logger.warn('section-part-store', `cleanup ${caseId}: ${error.message}`);
    }
  } catch (err) {
    logger.warn('section-part-store', `cleanup ${caseId} fallito: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
