/**
 * Merge multi-file → documento logico (feedback medici 2026-08-19, Mail 2):
 * un referto di 3 pagine fotografato con lo smartphone arrivava come 3
 * documenti indipendenti — classificati in isolamento (la pagina "storia
 * clinica" diventava una cartella clinica a sé) e resi come 3 blocchi con
 * intestazioni incoerenti nella cronistoria.
 *
 * Modello: i file SECONDARI puntano al PRIMARIO via merged_into_document_id
 * (+ merge_order = ordine pagina). In pipeline l'OCR del gruppo scrive tutte
 * le pagine sotto il primario; classificazione/estrazione/export vedono UN
 * documento. Il merge è sempre PROPOSTO e confermato dall'utente, mai
 * silenzioso.
 *
 * Questo modulo è puro (niente I/O): partizione dei gruppi per la pipeline e
 * euristica di proposta per la UI.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface MergeableDocument {
  id: string;
  fileName: string;
  mergedIntoDocumentId?: string | null;
  mergeOrder?: number | null;
}

export interface MergeGroup<T extends MergeableDocument> {
  primary: T;
  /** Ordinati per mergeOrder (pagine successive alla prima). */
  secondaries: T[];
}

export interface MergePartition<T extends MergeableDocument> {
  standalone: T[];
  groups: Array<MergeGroup<T>>;
}

// ── Partition (pipeline) ───────────────────────────────────────────────

/**
 * Divide i documenti in standalone e gruppi merge. FAIL-SAFE: un secondario
 * il cui primario non è nel set (o è a sua volta merged — catena non
 * supportata) torna standalone: mai perdere un documento dall'elaborazione.
 */
export function partitionMergeGroups<T extends MergeableDocument>(docs: T[]): MergePartition<T> {
  const primaries = new Map<string, T>();
  for (const d of docs) {
    if (!d.mergedIntoDocumentId) primaries.set(d.id, d);
  }

  const standalone: T[] = [];
  const secondariesByPrimary = new Map<string, T[]>();

  for (const d of docs) {
    if (!d.mergedIntoDocumentId) continue;
    const primary = primaries.get(d.mergedIntoDocumentId);
    if (!primary) {
      standalone.push(d); // primario assente o a sua volta merged
      continue;
    }
    const arr = secondariesByPrimary.get(primary.id);
    if (arr) arr.push(d);
    else secondariesByPrimary.set(primary.id, [d]);
  }

  const groups: Array<MergeGroup<T>> = [];
  for (const p of primaries.values()) {
    const secondaries = secondariesByPrimary.get(p.id);
    if (secondaries && secondaries.length > 0) {
      secondaries.sort((a, b) =>
        (a.mergeOrder ?? Number.MAX_SAFE_INTEGER) - (b.mergeOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.fileName.localeCompare(b.fileName));
      groups.push({ primary: p, secondaries });
    } else {
      standalone.push(p);
    }
  }

  return { standalone, groups };
}

// ── Suggestion heuristic (UI) ──────────────────────────────────────────

export interface MergeSuggestion {
  /** Ordinati per pagina presunta (il primo è il primario proposto). */
  documentIds: string[];
  reason: string;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|heic|heif|webp|tiff?)$/i;

/** "20260818_180312", "IMG_20260818_180312", "PXL_20260818_180312123" → epoch s. */
const TIMESTAMP_NAME_RE = /^(?:IMG[_-]|PXL[_-])?(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/i;

/** "IMG_4021" (iPhone/camera progressivi, senza data). */
const SEQUENTIAL_NAME_RE = /^(IMG|DSC|DSCN|P|PHOTO)[_-]?(\d{3,6})\.\w+$/i;

/** Scatti della stessa "raffica" di pagine: gap massimo fra foto consecutive. */
const MAX_GAP_SECONDS = 180;

interface SuggestInput {
  id: string;
  fileName: string;
  mergedIntoDocumentId?: string | null;
}

function timestampFromName(fileName: string): number | null {
  const m = TIMESTAMP_NAME_RE.exec(fileName);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isFinite(t) ? t / 1000 : null;
}

function sequenceFromName(fileName: string): number | null {
  const m = SEQUENTIAL_NAME_RE.exec(fileName);
  return m ? Number(m[2]) : null;
}

/** Raggruppa una lista ordinata in run consecutivi secondo `isAdjacent`. */
function groupRuns<T>(sorted: T[], isAdjacent: (a: T, b: T) => boolean): T[][] {
  const runs: T[][] = [];
  for (const item of sorted) {
    const current = runs[runs.length - 1];
    if (current && isAdjacent(current[current.length - 1], item)) current.push(item);
    else runs.push([item]);
  }
  return runs.filter((r) => r.length >= 2);
}

/**
 * Propone gruppi di file che sembrano PAGINE dello stesso documento: immagini
 * con timestamp nel nome scattate a pochi secondi l'una dall'altra (foto di un
 * referto multi-pagina), o nomi progressivi consecutivi (IMG_4021/22/23).
 * Solo una PROPOSTA: la conferma resta all'utente.
 */
export function suggestDocumentMergeGroups(files: SuggestInput[]): MergeSuggestion[] {
  const candidates = files.filter((f) => IMAGE_EXT_RE.test(f.fileName) && !f.mergedIntoDocumentId);
  if (candidates.length < 2) return [];

  const suggestions: MergeSuggestion[] = [];
  const used = new Set<string>();

  // 1) Timestamp nel nome (Android/Samsung/Pixel): raffiche entro MAX_GAP.
  const timestamped = candidates
    .map((f) => ({ ...f, ts: timestampFromName(f.fileName) }))
    .filter((f): f is typeof f & { ts: number } => f.ts !== null)
    .sort((a, b) => a.ts - b.ts);
  for (const run of groupRuns(timestamped, (a, b) => b.ts - a.ts <= MAX_GAP_SECONDS)) {
    suggestions.push({
      documentIds: run.map((f) => f.id),
      reason: `${run.length} foto scattate a pochi secondi di distanza`,
    });
    run.forEach((f) => used.add(f.id));
  }

  // 2) Progressivi consecutivi (IMG_4021/22/23) fra i file rimasti.
  const sequential = candidates
    .filter((f) => !used.has(f.id))
    .map((f) => ({ ...f, seq: sequenceFromName(f.fileName) }))
    .filter((f): f is typeof f & { seq: number } => f.seq !== null)
    .sort((a, b) => a.seq - b.seq);
  for (const run of groupRuns(sequential, (a, b) => b.seq - a.seq === 1)) {
    suggestions.push({
      documentIds: run.map((f) => f.id),
      reason: `${run.length} immagini con numerazione consecutiva`,
    });
  }

  return suggestions;
}
