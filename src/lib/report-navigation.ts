/**
 * Navigazione dentro il report renderizzato (pannello "Da controllare" → punto
 * esatto nel testo). Robusto ai mismatch di id: cerca prima l'ancora DOM
 * `section-{id}`, poi in fallback l'intestazione per testo. Nessuna dipendenza:
 * gira solo lato client (guardie su document/window).
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Scroll + flash a una sezione del report, per id canonico, titolo, o marker
 * di testo nel corpo (es. "SEZIONE NON GENERATA"). Prova in quest'ordine. */
export function scrollToReportSection(opts: { canonicalId?: string; title?: string; bodyText?: string }): boolean {
  if (typeof document === 'undefined') return false;

  // 1. Ancora diretta section-{id}.
  if (opts.canonicalId) {
    const el = document.getElementById(`section-${opts.canonicalId}`);
    if (el) return flashAndScroll(el);
  }

  // 2. Intestazione (h1-h3) il cui testo combacia col titolo.
  if (opts.title) {
    const target = normalize(opts.title);
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    const match = headings.find((h) => normalize(h.textContent ?? '').includes(target) || target.includes(normalize(h.textContent ?? '')));
    if (match) {
      const section = match.closest('[id^="section-"]') ?? match;
      return flashAndScroll(section as HTMLElement);
    }
  }

  // 3. Marker di testo nel corpo (la sezione col fallback "[SEZIONE NON GENERATA]").
  if (opts.bodyText) {
    const needle = normalize(opts.bodyText);
    const sections = Array.from(document.querySelectorAll('[id^="section-"]'));
    const match = sections.find((s) => normalize(s.textContent ?? '').includes(needle));
    if (match) return flashAndScroll(match as HTMLElement);
  }
  return false;
}

function flashAndScroll(el: HTMLElement): boolean {
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Riusa l'animazione già esistente (globals.css .animate-highlight-flash).
  el.classList.add('animate-highlight-flash');
  window.setTimeout(() => el.classList.remove('animate-highlight-flash'), 2200);
  return true;
}
