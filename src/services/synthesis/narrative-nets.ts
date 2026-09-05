/**
 * Reti deterministiche sulle sezioni NARRATIVE (Fatto, Anamnesi, Epicrisi),
 * 2026-09-05 — dopo il gate gold: i difetti residui erano tutti lì (RX del
 * 07.01.2025 inesistente, lesioni dell'evento indice elencate come pregresse,
 * referti ricitati in Epicrisi). Nessuna di queste reti richiede il medico:
 *  - date nel testo non attestate dagli eventi/metadati → elenco per il pannello
 *    "Da controllare" (mai cancellate: il perito decide);
 *  - Epicrisi senza «...» (il gold non cita: gli esiti in una parola);
 *  - "In passato" dell'Anamnesi mai con le date dell'evento indice.
 * Pure e idempotenti.
 */

const DATE_RE = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g;
const PLACEHOLDER_RE = /\[[^\]]*\]/g;

function dayNumber(d: number, m: number, y: number): number | null {
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Date DD.MM.AAAA / DD/MM/AAAA del testo NON presenti fra i giorni attestati (dedup, in ordine). */
export function findUnattestedDates(text: string, attestedDays: ReadonlySet<number>): string[] {
  if (!text || attestedDays.size === 0) return [];
  const clean = text.replace(PLACEHOLDER_RE, ' ');
  const out: string[] = []; const seen = new Set<string>();
  for (const m of clean.matchAll(DATE_RE)) {
    const n = dayNumber(Number(m[1]), Number(m[2]), Number(m[3]));
    if (n === null || attestedDays.has(n)) continue;
    const key = `${m[1]!.padStart(2, '0')}.${m[2]!.padStart(2, '0')}.${m[3]}`;
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

/** Epicrisi: le «...» diventano testo piano (il contenuto resta, sparisce la pretesa di citazione). */
export function unwrapGuillemets(text: string): string {
  return text.replace(/«\s*([^«»]*?)\s*»/g, '$1');
}

const PAST_LINE_RE = /^(\s*(?:[-*•]\s*)?(?:\*\*)?In passato\s*:?\s*(?:\*\*)?\s*:?)(.*)$/im;

function hasCurrentDate(part: string, currentDays: ReadonlySet<number>): boolean {
  for (const d of part.matchAll(DATE_RE)) {
    const n = dayNumber(Number(d[1]), Number(d[2]), Number(d[3]));
    if (n !== null && currentDays.has(n)) return true;
  }
  return false;
}

/** Anamnesi: nella riga "In passato:" le voci con una data dell'evento indice
 * (eventi correnti) vengono tolte; le altre pregresse restano. Se non resta
 * nulla: "nulla di rilevante documentato". */
export function sanitizeAnamnesiPast(text: string, currentDays: ReadonlySet<number>): { text: string; replaced: boolean } {
  const m = PAST_LINE_RE.exec(text);
  if (!m) return { text, replaced: false };
  const body = (m[2] ?? '').trim();
  if (!hasCurrentDate(body, currentDays)) return { text, replaced: false };
  const kept = body.replace(/\.$/, '').split(/\s*[;,]\s+(?=[^)]*(?:\(|$))/).map((p) => p.trim()).filter((p) => p && !hasCurrentDate(p, currentDays));
  const label = (m[1] ?? '').trimEnd();
  const head = /[:*]$/.test(label) ? label : `${label}:`;
  const newBody = kept.length > 0 ? `${kept.join(', ')}.` : 'nulla di rilevante documentato.';
  return { text: text.replace(PAST_LINE_RE, `${head} ${newBody}`), replaced: true };
}

/** Giorni (numero) degli eventi CORRENTI: le date dell'evento indice e del decorso. */
export function collectCurrentDays(events: ReadonlyArray<{ eventDate?: string | null; temporalScope?: string | null }>): Set<number> {
  const days = new Set<number>();
  for (const e of events) {
    if (!e.eventDate || e.eventDate.startsWith('1900-01-01')) continue;
    if (e.temporalScope === 'retrospettivo' || e.temporalScope === 'programmato') continue;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.eventDate);
    if (!iso) continue;
    const n = dayNumber(Number(iso[3]), Number(iso[2]), Number(iso[1]));
    if (n !== null) days.add(n);
  }
  return days;
}
