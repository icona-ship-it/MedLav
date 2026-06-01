/**
 * Client-safe section parser for splitting report markdown into sections.
 * Based on the same logic as services/synthesis/section-parser.ts but
 * without server-only dependencies.
 *
 * This module is the CANONICAL home of the section-ID mapping
 * (`SECTION_ID_MAP` / `identifySectionId`). The server parser
 * (`services/synthesis/section-parser.ts`) re-exports them so client and
 * server always derive the SAME stable `canonicalId` for a given heading.
 * Per-section state (auto/edited/locked) is keyed by `canonicalId`, never by
 * the title-derived `id` slug (which changes if the heading text changes).
 */

export interface ClientSection {
  /** Title-derived slug, deduped with _2/_3 — used by replaceSectionContent. */
  id: string;
  /** Stable canonical id (SECTION_ID_MAP) — used as the per-section state key. */
  canonicalId: string;
  title: string;
  content: string;
}

// Canonical section ID mapping from heading text keywords.
// IMPORTANT: this is the single source of truth, shared with the server parser.
const SECTION_ID_MAP: Array<{ pattern: RegExp; id: string }> = [
  // Sectional generation universal sections
  { pattern: /premesse\s+e\s+profilo\s+metodologico|profilo\s+metodologico/i, id: 'intestazione' },
  { pattern: /dati\s+della\s+documentazione\s+in\s+atti|documentazione\s+in\s+atti/i, id: 'documentazione_atti' },
  { pattern: /premesse(?!\s+e\s+profilo)/i, id: 'premesse' },
  { pattern: /dati\s+della\s+documentazione\s+sanitaria|documentazione\s+sanitaria|documentazione\s+medica\s+prodotta/i, id: 'documentazione_sanitaria' },
  { pattern: /spese\s+mediche/i, id: 'spese_mediche' },
  { pattern: /precedenti\s+pareri\s+tecnici|pareri\s+tecnici/i, id: 'pareri_tecnici' },
  { pattern: /incontro\s+con\s+le\s+parti|operazioni\s+peritali/i, id: 'operazioni_peritali' },
  { pattern: /considerazioni\s+medico-?\s*legali/i, id: 'considerazioni_ml' },
  { pattern: /il\s+fatto\s+e\s+la\s+storia\s+clinica/i, id: 'il_fatto_e_storia_clinica' },
  { pattern: /epicrisi/i, id: 'epicrisi' },
  { pattern: /bibliografia/i, id: 'bibliografia' },
  { pattern: /osservazioni\s+(alla\s+)?bozza/i, id: 'osservazioni_bozza' },
  // Legacy aliases kept for backward compat with already-saved reports
  { pattern: /sintesi\s+conclusiva|^conclusioni$/i, id: 'conclusioni' },
  // Legacy/domain-knowledge sections
  { pattern: /riassunto\s+(del\s+)?caso/i, id: 'riassunto' },
  { pattern: /cronologia\s+medico/i, id: 'cronologia' },
  { pattern: /analisi\s+dell.intervento/i, id: 'analisi_intervento' },
  { pattern: /complicanze/i, id: 'complicanze' },
  { pattern: /danno\s+biologico/i, id: 'danno_biologico' },
  { pattern: /nesso\s+causale/i, id: 'nesso_causale' },
  { pattern: /timeline\s+diagnostica/i, id: 'timeline_diagnostica' },
  { pattern: /analisi\s+del\s+ritardo/i, id: 'analisi_ritardo' },
  { pattern: /perdita\s+di\s+chance|loss\s+of\s+chance/i, id: 'loss_of_chance' },
  { pattern: /analisi\s+del\s+travaglio/i, id: 'analisi_travaglio' },
  { pattern: /tracciato\s+cardiotocografico|ctg/i, id: 'ctg_analisi' },
  { pattern: /esiti\s+neonatali/i, id: 'esiti_neonatali' },
  { pattern: /valutazione\s+preoperatoria/i, id: 'valutazione_preoperatoria' },
  { pattern: /gestione\s+anestesiologica/i, id: 'gestione_anestesiologica' },
  { pattern: /analisi\s+dell.infezione/i, id: 'analisi_infettiva' },
  { pattern: /gestione\s+terapeutica/i, id: 'gestione_terapeutica' },
  { pattern: /percorso\s+diagnostico/i, id: 'percorso_diagnostico' },
  { pattern: /analisi\s+dell.errore/i, id: 'analisi_errore' },
  { pattern: /elementi\s+(di\s+rilievo|per\s+la\s+valutazione)/i, id: 'elementi_rilievo' },
  { pattern: /profili\s+di\s+responsabilit/i, id: 'profili_responsabilita' },
  { pattern: /valutazione\s+di\s+merito/i, id: 'valutazione_merito' },
];

/**
 * Identify a canonical section ID from heading text.
 * Falls back to a Unicode-aware slug when no mapping matches.
 */
export function identifySectionId(headingText: string): string {
  for (const mapping of SECTION_ID_MAP) {
    if (mapping.pattern.test(headingText)) {
      return mapping.id;
    }
  }
  // Fallback: slugify the heading (same transform as slugifyHeading).
  return slugifyHeading(headingText);
}

/**
 * Parse a markdown synthesis into sections using ## headings.
 * Deduplicates slugs by appending _2, _3, etc. to collisions.
 */
export function parseSections(markdown: string): ClientSection[] {
  if (!markdown || typeof markdown !== 'string' || !markdown.trim()) return [];

  const sections: ClientSection[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(markdown)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  if (matches.length === 0) {
    // No sections found — return entire content as single section
    return [{ id: 'full_report', canonicalId: 'full_report', title: 'Report', content: markdown.trim() }];
  }

  // Content before the first heading (preamble)
  const preamble = markdown.slice(0, matches[0].index).trim();
  if (preamble) {
    sections.push({ id: 'preamble', canonicalId: 'preamble', title: 'Intestazione', content: preamble });
  }

  const slugCounts = new Map<string, number>();

  for (let i = 0; i < matches.length; i++) {
    const startIndex = matches[i].index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : markdown.length;
    const fullContent = markdown.slice(startIndex, endIndex).trim();
    const headingEndIndex = fullContent.indexOf('\n');
    const content = headingEndIndex >= 0 ? fullContent.slice(headingEndIndex + 1).trim() : '';

    const baseSlug = slugifyHeading(matches[i].title);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const id = count > 1 ? `${baseSlug}_${count}` : baseSlug;

    sections.push({ id, canonicalId: identifySectionId(matches[i].title), title: matches[i].title, content });
  }

  return sections;
}

/**
 * Replace the content of a specific section in the full markdown,
 * preserving the heading and all other sections unchanged.
 * Uses the same dedup logic as parseSections to match section IDs.
 */
export function replaceSectionContent(
  markdown: string,
  sectionId: string,
  newContent: string,
): string {
  if (!markdown || typeof markdown !== 'string' || !sectionId) return markdown ?? '';

  const headingRegex = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(markdown)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  // Handle preamble
  if (sectionId === 'preamble' && matches.length > 0) {
    return newContent.trim() + '\n\n' + markdown.slice(matches[0].index);
  }

  // Handle full_report (no headings)
  if (sectionId === 'full_report' && matches.length === 0) {
    return newContent.trim();
  }

  // Find the target section by slug (with dedup logic matching parseSections)
  const slugCounts = new Map<string, number>();

  for (let i = 0; i < matches.length; i++) {
    const baseSlug = slugifyHeading(matches[i].title);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const id = count > 1 ? `${baseSlug}_${count}` : baseSlug;

    if (id !== sectionId) continue;

    const headingLine = `## ${matches[i].title}`;
    const sectionStart = matches[i].index;
    const sectionEnd = i < matches.length - 1 ? matches[i + 1].index : markdown.length;

    const before = markdown.slice(0, sectionStart);
    const after = markdown.slice(sectionEnd);

    return before + headingLine + '\n\n' + newContent.trim() + '\n\n' + after;
  }

  // Section not found — return unchanged
  return markdown;
}

function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}
