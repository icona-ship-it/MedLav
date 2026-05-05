import { logger } from '@/lib/logger';

export interface ParsedSection {
  id: string;
  title: string;
  content: string;
  startIndex: number;
  endIndex: number;
}

// Canonical section ID mapping from heading text keywords
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
    logger.warn('section-parser', `Section not found, appending at end`, { sectionId });
    return synthesis + '\n\n' + newContent;
  }

  const before = synthesis.slice(0, target.startIndex);
  const after = synthesis.slice(target.endIndex);
  const heading = `## ${target.title}`;

  return `${before}${heading}\n\n${newContent.trim()}\n\n${after}`.replace(/\n{3,}/g, '\n\n').trim();
}
