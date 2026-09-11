/**
 * Lateralità nel testo clinico (dx/sx/bilaterale), condivisa da consolidamento,
 * verificatore evento↔fonte e snapper delle citazioni (audit 2026-09-10,
 * invarianti I2, I3, I12): invertire o perdere un lato in una perizia è
 * l'errore silenzioso più grave. Pura, nessuna dipendenza.
 *
 * Riconosce le forme abbreviate (dx, ds, dex, sx, sn, sin) e per esteso
 * (destro/a/i/e, sinistro/a/i/e), «bilaterale». NON le lettere singole D/S
 * (troppo ambigue in testo libero). «sin» è un lato solo se non è la
 * preposizione «sin da/dal…».
 */

export type Side = 'dx' | 'sx' | 'bilat';

const DX_RE = /\b(?:dx|ds|dex|dext|destr[oaie])\b\.?/giu;
const SX_RE = /\b(?:sx|sn|sinistr[oaie])\b\.?|\bsin\b\.?(?!\s+(?:da|dal|dall|dalla|dalle|dai|dagli|d')\b)/giu;
const BILAT_RE = /\bbilateral(?:e|i|mente)\b|\bbilat\b\.?/giu;

export function detectSides(text: string | null | undefined): Set<Side> {
  const out = new Set<Side>();
  if (!text) return out;
  if (DX_RE.test(text)) out.add('dx');
  DX_RE.lastIndex = 0;
  if (SX_RE.test(text)) out.add('sx');
  SX_RE.lastIndex = 0;
  if (BILAT_RE.test(text)) out.add('bilat');
  BILAT_RE.lastIndex = 0;
  return out;
}

/** Un solo lato, non bilaterale: 'dx' | 'sx' | null. */
export function uniqueSide(text: string | null | undefined): 'dx' | 'sx' | null {
  const s = detectSides(text);
  if (s.has('bilat')) return null;
  if (s.has('dx') && !s.has('sx')) return 'dx';
  if (s.has('sx') && !s.has('dx')) return 'sx';
  return null;
}

/** Vero quando i due testi indicano lati OPPOSTI in modo univoco (dx vs sx). */
export function haveOppositeSides(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = uniqueSide(a);
  const sb = uniqueSide(b);
  return sa !== null && sb !== null && sa !== sb;
}

/** Vero se, tra più testi, compaiono sia un lato destro sia un lato sinistro univoci. */
export function mixOppositeSides(texts: ReadonlyArray<string | null | undefined>): boolean {
  let dx = false;
  let sx = false;
  for (const t of texts) {
    const u = uniqueSide(t);
    if (u === 'dx') dx = true;
    else if (u === 'sx') sx = true;
    if (dx && sx) return true;
  }
  return false;
}
