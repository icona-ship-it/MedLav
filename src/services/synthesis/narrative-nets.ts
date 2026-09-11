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

const DATE_RE = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
// Date in lettere («7 gennaio 2025»): il modello le scrive spesso così e la rete
// non le vedeva (audit 2026-09-10, I11).
const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DATE_TEXT_RE = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS_IT.join('|')})\\s+(\\d{4})\\b`, 'gi');
const PLACEHOLDER_RE = /\[[^\]]*\]/g;

interface FoundDate { d: number; m: number; y: number; key: string }

/** Tutte le date del testo, numeriche e in lettere, con chiave GG.MM.AAAA. */
function extractDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    out.push({ d: Number(m[1]), m: Number(m[2]), y: Number(m[3]), key: `${m[1]!.padStart(2, '0')}.${m[2]!.padStart(2, '0')}.${m[3]}` });
  }
  for (const m of text.matchAll(DATE_TEXT_RE)) {
    const month = MONTHS_IT.indexOf(m[2]!.toLowerCase()) + 1;
    out.push({ d: Number(m[1]), m: month, y: Number(m[3]), key: `${m[1]!.padStart(2, '0')}.${String(month).padStart(2, '0')}.${m[3]}` });
  }
  return out;
}

/** Numero del giorno; null se la data non esiste nel calendario (mese 13, 31 febbraio, giorno 0). */
function dayNumber(d: number, m: number, y: number): number | null {
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(t / 86_400_000);
}

/** Date DD.MM.AAAA / DD/MM/AAAA del testo NON presenti fra i giorni attestati (dedup, in ordine). */
export function findUnattestedDates(text: string, attestedDays: ReadonlySet<number>): string[] {
  if (!text || attestedDays.size === 0) return [];
  const clean = text.replace(PLACEHOLDER_RE, ' ');
  const out: string[] = []; const seen = new Set<string>();
  for (const f of extractDates(clean)) {
    const n = dayNumber(f.d, f.m, f.y);
    // Una data impossibile (mese 13, 31 febbraio) non è «attestata»: va segnalata,
    // mai saltata in silenzio (I11).
    if (n !== null && attestedDays.has(n)) continue;
    if (!seen.has(f.key)) { seen.add(f.key); out.push(f.key); }
  }
  return out;
}

/** Epicrisi: le «...» diventano testo piano (il contenuto resta, sparisce la pretesa di citazione). */
export function unwrapGuillemets(text: string): string {
  return text.replace(/«\s*([^«»]*?)\s*»/g, '$1');
}

const PAST_LINE_RE = /^(\s*(?:[-*•]\s*)?(?:\*\*)?(?:In passato|Patologie pregresse|Anamnesi (?:patologica )?remota|Pregressi|A\.?P\.?R\.?)\s*:?\s*(?:\*\*)?\s*:?)(.*)$/im;

function hasCurrentDate(part: string, currentDays: ReadonlySet<number>): boolean {
  for (const f of extractDates(part)) {
    const n = dayNumber(f.d, f.m, f.y);
    if (n !== null && currentDays.has(n)) return true;
  }
  return false;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Lesioni/diagnosi dell'evento indice (eventi correnti), come frasi normalizzate ≥ 3 parole. */
export function collectCurrentLesions(events: ReadonlyArray<{ diagnosis?: string | null; title?: string | null; temporalScope?: string | null }>): string[] {
  const out = new Set<string>();
  for (const e of events) {
    if (e.temporalScope === 'retrospettivo' || e.temporalScope === 'programmato') continue;
    for (const raw of [e.diagnosis, e.title]) {
      const f = raw ? fold(raw) : '';
      if (f.split(' ').length >= 3 && f.length >= 15) out.add(f);
    }
  }
  return [...out];
}

function mentionsCurrentLesion(part: string, lesions: ReadonlyArray<string>): boolean {
  const f = fold(part);
  if (!f) return false;
  return lesions.some((l) => f.includes(l) || (l.length >= 25 && l.includes(f) && f.split(' ').length >= 3));
}

/** Anamnesi: nella riga "In passato:" le voci con una data dell'evento indice
 * (eventi correnti) vengono tolte; le altre pregresse restano. Se non resta
 * nulla: "nulla di rilevante documentato". */
/** Clausola di FONTE ("come da cartella clinica del 16.07.2023", "riferita in anamnesi
 * … del …"): porta la data del documento, non quella del fatto pregresso. Va tolta
 * prima di decidere se la voce è dell'evento indice (panel giri 9-11, casi B e C:
 * comorbilità citate «come da cartella del giorno del sinistro» sparivano tutte e
 * restava «nulla di rilevante documentato» sopra l'elenco stesso). */
const SOURCE_CLAUSE_RE = /,?\s*(?:come (?:da|riferit[oa] (?:in|nel|nella))|riferit[oa] in anamnesi|secondo|documentat[oa] (?:in|nella|dal))\b[^,;]*/gi;

function stripSourceClauses(part: string): string {
  return part.replace(SOURCE_CLAUSE_RE, '').trim();
}

export function sanitizeAnamnesiPast(text: string, currentDays: ReadonlySet<number>, currentLesions: ReadonlyArray<string> = []): { text: string; replaced: boolean } {
  const m = PAST_LINE_RE.exec(text);
  if (!m) return { text, replaced: false };
  const body = (m[2] ?? '').trim();
  const isIndex = (part: string): boolean => {
    const bare = stripSourceClauses(part);
    return hasCurrentDate(bare, currentDays) || mentionsCurrentLesion(bare, currentLesions);
  };
  if (!isIndex(body)) return { text, replaced: false };
  const kept = body.replace(/\.$/, '').split(/\s*[;,]\s+(?=[^)]*(?:\(|$))/).map((p) => p.trim()).filter((p) => p && !isIndex(p));
  const label = (m[1] ?? '').trimEnd();
  const head = /[:*]$/.test(label) ? label : `${label}:`;
  // Se sotto la riga segue un elenco puntato (le voci pregresse scritte a parte),
  // la riga resta un'etichetta: mai «nulla di rilevante» sopra un elenco.
  const after = text.slice((m.index ?? 0) + m[0].length);
  const bulletsFollow = /^\s*\n\s*[-*•]\s+\S/.test(after);
  const newBody = kept.length > 0 ? `${kept.join(', ')}.` : bulletsFollow ? '' : 'nulla di rilevante documentato.';
  return { text: text.replace(PAST_LINE_RE, `${head}${newBody ? ` ${newBody}` : ''}`), replaced: true };
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
