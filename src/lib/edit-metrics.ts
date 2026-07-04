/**
 * Metriche del "fascicolo di generazione" (ricerca 2026-07-04):
 * - hash stabili di input/output → snapshot immutabile: la ri-generazione su
 *   API hosted NON è riproducibile nemmeno a temperature 0, quindi solo lo
 *   snapshot può provare cosa fu generato (difesa del perito).
 * - edit-rate bozza→firmato per sezione → il KPI di qualità più scalabile del
 *   settore (stile Minimally-Edited Note Rate) + rilevatore di rubber-stamping.
 *
 * Modulo puro (node:crypto soltanto), server-side.
 */

import { createHash } from 'node:crypto';
import { lcsWordLength } from './lcs';

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Oltre questo prodotto |A|·|B| la DP LCS bloccherebbe l'event-loop per
 * secondi (un macrodanno da 25K parole = ~600M celle): si passa al fallback
 * bag-of-words O(n). ~4M celle ≈ pochi ms. */
const LCS_CELL_BUDGET = 4_000_000;

/** Approssimazione O(n): 1 − similarità multinsieme delle parole. Ordina-insensibile
 * (sottostima gli spostamenti), ma su testi enormi è il compromesso giusto. */
function bagOfWordsEditRate(a: string[], b: string[]): number {
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of b) {
    const c = counts.get(w) ?? 0;
    if (c > 0) {
      common += 1;
      counts.set(w, c - 1);
    }
  }
  const similarity = (2 * common) / (a.length + b.length);
  return Math.round((1 - similarity) * 100);
}

/**
 * Quanto il testo firmato si discosta dalla bozza generata, 0-100.
 * 0 = identico (a meno di whitespace), 100 = riscritto integralmente.
 * Basato su LCS word-level: 1 − 2·LCS/(|A|+|B|); oltre il budget di celle
 * (testi enormi) degrada al bag-of-words O(n) — review 2026-07-04.
 */
export function computeEditRatePercent(original: string, edited: string): number {
  if (original === edited) return 0; // fast-path: salvataggio senza modifiche
  const a = tokenizeWords(original);
  const b = tokenizeWords(edited);
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0 || b.length === 0) return 100;
  if (a.length * b.length > LCS_CELL_BUDGET) return bagOfWordsEditRate(a, b);
  const lcs = lcsWordLength(a, b);
  const similarity = (2 * lcs) / (a.length + b.length);
  return Math.round((1 - similarity) * 100);
}

interface FingerprintableEvent {
  orderNumber: number;
  eventDate: string | null;
  eventType: string;
  title: string;
  description: string;
  sourceText?: string | null;
}

/**
 * Impronta stabile degli eventi consolidati (l'input effettivo della sintesi):
 * sha256 del JSON dei soli campi load-bearing, ordinati per orderNumber.
 * Se gli eventi cambiano dopo la generazione, l'impronta non combacia più —
 * il report è dimostrabilmente riferito a QUELLO stato del fascicolo.
 */
export function stableEventsFingerprint(events: FingerprintableEvent[]): string {
  const stable = [...events]
    .sort((x, y) => x.orderNumber - y.orderNumber)
    .map((e) => ({
      orderNumber: e.orderNumber,
      eventDate: e.eventDate ?? null,
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      sourceText: e.sourceText ?? null,
    }));
  return sha256Hex(JSON.stringify(stable));
}
