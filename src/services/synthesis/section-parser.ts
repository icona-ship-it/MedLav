export interface ParsedSection {
  id: string;
  title: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

// Canonical section ID mapping from heading text keywords
const SECTION_ID_MAP: Array<{ pattern: RegExp; id: string }> = [
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
  { pattern: /elementi\s+di\s+rilievo/i, id: 'elementi_rilievo' },
  { pattern: /profili\s+di\s+responsabilit/i, id: 'profili_responsabilita' },
  { pattern: /valutazione\s+di\s+merito/i, id: 'valutazione_merito' },
];

/**
 * Identify a canonical section ID from heading text.
 */
export function identifySectionId(headingText: string): string {
  for (const mapping of SECTION_ID_MAP) {
    if (mapping.pattern.test(headingText)) {
      return mapping.id;
    }
  }
  // Fallback: slugify the heading
  return headingText
    .toLowerCase()
    .replace(/[^a-zà-ú0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

/**
 * Parse a synthesis markdown text into individual sections.
 * Uses ## headings as section boundaries.
 */
export function parseSynthesisSections(synthesis: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  const matches: Array<{ title: string; index: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(synthesis)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const startIndex = matches[i].index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : synthesis.length;
    const fullContent = synthesis.slice(startIndex, endIndex).trim();
    // Content without the heading line
    const headingEndIndex = fullContent.indexOf('\n');
    const content = headingEndIndex >= 0 ? fullContent.slice(headingEndIndex + 1).trim() : '';

    sections.push({
      id: identifySectionId(matches[i].title),
      title: matches[i].title,
      content,
      startIndex,
      endIndex,
    });
  }

  return sections;
}

/**
 * Replace a single section's content in the synthesis text.
 * Returns a new string (immutable). The heading is preserved.
 */
export function replaceSectionContent(
  synthesis: string,
  sectionId: string,
  newContent: string,
): string {
  const sections = parseSynthesisSections(synthesis);
  const target = sections.find((s) => s.id === sectionId);

  if (!target) {
    console.warn(`[section-parser] Section "${sectionId}" not found, appending at end`);
    return synthesis + '\n\n' + newContent;
  }

  const before = synthesis.slice(0, target.startIndex);
  const after = synthesis.slice(target.endIndex);
  const heading = `## ${target.title}`;

  return `${before}${heading}\n\n${newContent.trim()}\n\n${after}`.replace(/\n{3,}/g, '\n\n').trim();
}
