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

/**
 * Quanto il testo firmato si discosta dalla bozza generata, 0-100.
 * 0 = identico (a meno di whitespace), 100 = riscritto integralmente.
 * Basato su LCS word-level: 1 − 2·LCS/(|A|+|B|).
 */
export function computeEditRatePercent(original: string, edited: string): number {
  const a = tokenizeWords(original);
  const b = tokenizeWords(edited);
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0 || b.length === 0) return 100;
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
