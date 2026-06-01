import { describe, it, expect } from 'vitest';
import { parseSections, identifySectionId } from './section-parser-client';
import { parseSynthesisSections } from '@/services/synthesis/section-parser';

/**
 * A0 guard: the per-section state is keyed by `canonicalId`. Client
 * (`parseSections`) and server (`parseSynthesisSections`) MUST derive the
 * SAME canonical id for any heading, otherwise state written on one side is
 * invisible to the other. They now share `identifySectionId` — this test
 * locks that invariant in place.
 */

// Representative headings: mapped (via SECTION_ID_MAP) + unmapped (fallback slug).
const HEADINGS: Array<[string, string]> = [
  ['Premesse e profilo metodologico', 'intestazione'],
  ['Dati della documentazione sanitaria', 'documentazione_sanitaria'],
  ['Spese mediche', 'spese_mediche'],
  ['Considerazioni medico-legali', 'considerazioni_ml'],
  ['Il fatto e la storia clinica', 'il_fatto_e_storia_clinica'],
  ['Epicrisi', 'epicrisi'],
  ['Operazioni peritali', 'operazioni_peritali'],
  ['Osservazioni alla bozza', 'osservazioni_bozza'],
  ['Bibliografia', 'bibliografia'],
  ['Nesso causale', 'nesso_causale'],
  // Unmapped → fallback slug (still must agree client/server)
  ['Sezione Personalizzata Del Perito', 'sezione_personalizzata_del_perito'],
];

describe('canonicalId — client/server consistency (A0 invariant)', () => {
  it.each(HEADINGS)('"%s" → canonical id agrees everywhere', (title, expectedId) => {
    expect(identifySectionId(title)).toBe(expectedId);

    const clientSection = parseSections(`## ${title}\n\nContenuto.`)[0];
    expect(clientSection.canonicalId).toBe(expectedId);

    const serverSection = parseSynthesisSections(`## ${title}\n\nContenuto.`)[0];
    expect(serverSection.id).toBe(expectedId);

    // The whole point: the two sides match.
    expect(clientSection.canonicalId).toBe(serverSection.id);
  });

  it('preamble and full_report keep stable canonical ids', () => {
    const withPreamble = parseSections('Testo introduttivo\n\n## Epicrisi\n\nx');
    expect(withPreamble[0].canonicalId).toBe('preamble');

    const noHeadings = parseSections('Solo testo, nessun heading');
    expect(noHeadings[0].canonicalId).toBe('full_report');
  });

  it('canonicalId is STABLE while the slug id changes with the title', () => {
    // Same canonical section, two different phrasings of the heading.
    const a = parseSections('## Documentazione sanitaria\n\nx')[0];
    const b = parseSections('## Dati della documentazione sanitaria\n\nx')[0];
    expect(a.id).not.toBe(b.id); // slugs differ
    expect(a.canonicalId).toBe(b.canonicalId); // canonical id is stable
    expect(a.canonicalId).toBe('documentazione_sanitaria');
  });
});
