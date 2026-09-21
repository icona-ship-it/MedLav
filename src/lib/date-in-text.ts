/**
 * Una data ISO (anche parziale) compare nel testo di un documento? Serve a non
 * dare a una voce (spesa, evento) una data pescata da un altro documento
 * (feedback beta tester 2026-08-19: consulenza datata 28.04 presa dal contesto;
 * la ricevuta era di ottobre). Restituisce null se la data non è valutabile.
 */
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS_ABBR = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Alternative testuali con cui la data può comparire in un documento italiano. */
export function dateTextVariants(isoDate: string): string[] {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec((isoDate ?? '').trim());
  if (!m) return [];
  const [, yyyy, mm, dd] = m;
  const yy = yyyy.slice(2);
  if (!mm) return [yyyy];
  const mi = Number(mm) - 1;
  if (mi < 0 || mi > 11) return [];
  const month = MONTHS[mi];
  const abbr = MONTHS_ABBR[mi];
  const m1 = String(Number(mm));
  if (!dd) {
    return [`${mm}/${yyyy}`, `${mm}.${yyyy}`, `${mm}-${yyyy}`, `${m1}/${yyyy}`, `${month} ${yyyy}`, `${abbr} ${yyyy}`, `${abbr}. ${yyyy}`, `${yyyy}-${mm}`];
  }
  const d1 = String(Number(dd));
  const out: string[] = [];
  for (const sep of ['/', '.', '-']) {
    out.push(`${dd}${sep}${mm}${sep}${yyyy}`, `${d1}${sep}${m1}${sep}${yyyy}`, `${dd}${sep}${mm}${sep}${yy}`, `${d1}${sep}${m1}${sep}${yy}`, `${dd}${sep}${m1}${sep}${yyyy}`, `${d1}${sep}${mm}${sep}${yyyy}`);
  }
  out.push(`${yyyy}-${mm}-${dd}`, `${dd} ${month} ${yyyy}`, `${d1} ${month} ${yyyy}`, `${dd} ${abbr} ${yyyy}`, `${d1} ${abbr} ${yyyy}`, `${dd} ${abbr}. ${yyyy}`, `${d1} ${abbr}. ${yyyy}`, `${dd}${month}${yyyy}`);
  return [...new Set(out)];
}

/** true = compare; false = non compare; null = data vuota o non valutabile. */
export function dateAppearsInText(isoDate: string | null | undefined, text: string | null | undefined): boolean | null {
  const variants = dateTextVariants(isoDate ?? '');
  if (variants.length === 0) return null;
  const hay = (text ?? '').toLowerCase().replace(/\s+/g, ' ');
  if (!hay.trim()) return null;
  for (const v of variants) {
    const re = new RegExp(`(?<![\\d])${esc(v.toLowerCase()).replace(/ /g, '\\s*')}(?![\\d])`);
    if (re.test(hay)) return true;
  }
  return false;
}

/** Il testo contiene almeno una data completa (gg/mm/aaaa o simili)? */
export function textHasAnyFullDate(text: string | null | undefined): boolean {
  const t = text ?? '';
  return /(?<!\d)\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?!\d)|\d{4}-\d{2}-\d{2}|\b\d{1,2}\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4}/i.test(t);
}
