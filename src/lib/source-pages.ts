/**
 * Pagine di origine di un evento (source_pages: array o stringa JSON dal DB) →
 * etichetta per gli export ("pag. 3", "pagg. 3-4", "pagg. 2, 5"). Verifica
 * 2026-09-06: il link evento→pagina esisteva solo nell'app; negli export il
 * medico non aveva la pagina da cui viene ogni riga. Puro.
 */

export function parseSourcePageNumbers(value: unknown): number[] {
  const raw: unknown = typeof value === 'string' ? safeJson(value) : value;
  if (!Array.isArray(raw)) return [];
  const nums = raw.map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN))
    .filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export function formatSourcePagesLabel(value: unknown): string | null {
  const pages = parseSourcePageNumbers(value);
  if (pages.length === 0) return null;
  if (pages.length === 1) return `pag. ${pages[0]}`;
  const contiguous = pages.every((p, i) => i === 0 || p === pages[i - 1]! + 1);
  return contiguous ? `pagg. ${pages[0]}-${pages[pages.length - 1]}` : `pagg. ${pages.join(', ')}`;
}
