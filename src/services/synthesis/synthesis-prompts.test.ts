import { describe, it, expect } from 'vitest';
import {
  filterMedicalImages,
  truncateOcrProportionally,
  formatDocumentsOcrForPrompt,
  formatDocumentSummariesForPrompt,
  formatAnomaliesForPrompt,
  formatEventsForPrompt,
  formatEventsByDocumentForPrompt,
} from './synthesis-prompts';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DocumentSummary } from './document-summarizer';
import type { DetectedAnomaly } from '../validation/anomaly-detector';

function makeEvent(overrides?: Partial<ConsolidatedEvent>): ConsolidatedEvent {
  return {
    orderNumber: 1,
    documentId: 'doc-1',
    eventDate: '2024-03-15',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Visita ortopedica',
    description: 'Paziente visitato per dolore al ginocchio.',
    sourceType: 'referto_controllo',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 90,
    requiresVerification: false,
    reliabilityNotes: null,
    sourceText: 'Visita del 15/03/2024',
    sourcePages: [1],
    discrepancyNote: null,
    ...overrides,
  };
}

describe('formatEventsByDocumentForPrompt — un atto = un blocco', () => {
  it('raggruppa per documentId: 4 eventi su 2 documenti → 2 blocchi DOCUMENTO, non 4', () => {
    const out = formatEventsByDocumentForPrompt([
      makeEvent({ documentId: 'doc-A', eventDate: '2024-03-10', title: 'Accesso', sourceText: 'PS 10/03' }),
      makeEvent({ documentId: 'doc-A', eventDate: '2024-03-10', title: 'Diagnosi', sourceText: 'frattura femore' }),
      makeEvent({ documentId: 'doc-A', eventDate: '2024-03-10', title: 'Dimissione', sourceText: 'dimesso' }),
      makeEvent({ documentId: 'doc-B', eventDate: '2024-04-01', title: 'Controllo', sourceText: 'controllo ok' }),
    ]);
    const blocks = out.match(/DOCUMENTO \d+/g) ?? [];
    expect(blocks).toHaveLength(2); // 2 documenti, non 4 eventi
    // i 3 reperti del doc-A stanno nello STESSO blocco
    expect(out).toMatch(/frattura femore/);
    expect(out).toMatch(/controllo ok/);
  });

  it('ordina i blocchi-documento per data più antica', () => {
    const out = formatEventsByDocumentForPrompt([
      makeEvent({ documentId: 'tardo', eventDate: '2024-06-01', title: 'Tardo', sourceText: 'reperto-tardo' }),
      makeEvent({ documentId: 'presto', eventDate: '2024-01-01', title: 'Presto', sourceText: 'reperto-presto' }),
    ]);
    // il documento più antico (presto) viene prima del più recente (tardo)
    expect(out.indexOf('reperto-presto')).toBeLessThan(out.indexOf('reperto-tardo'));
  });

  // Fix Bigon: il codice classificatore A-/B-/C-/D- (SOURCE_TYPE_LABELS) NON deve
  // finire nell'intestazione del blocco-documento (l'LLM la copiava nel titolo
  // grassetto → "**B - Referto...:**"). Lo togliamo alla radice, qui.
  it('usa etichette gold sentence-case, senza codice classificatore A-/B-/C-/D-', () => {
    const out = formatEventsByDocumentForPrompt([
      makeEvent({ documentId: 'doc-B', sourceType: 'referto_controllo', title: 'Controllo', sourceText: 'controllo' }),
      makeEvent({ documentId: 'doc-A', sourceType: 'cartella_clinica', title: 'Cartella', sourceText: 'cartella' }),
    ]);
    // Intestazioni gold: singolari, sentence-case, senza codice né categoria maiuscola plurale.
    expect(out).toContain('Referto di controllo medico');
    expect(out).toContain('Cartella clinica');
    expect(out).not.toContain('REFERTI CONTROLLI MEDICI');
    expect(out).not.toContain('B - ');
    expect(out).not.toContain('A - ');
  });

  // Fix Bigon: una menzione "solo anno" (datePrecision='anno') NON deve mostrare un
  // giorno/mese fabbricato ("01.01.2002") nell'intestazione del blocco.
  it('datePrecision "anno" → mostra solo l\'anno, mai il giorno fabbricato', () => {
    const out = formatEventsByDocumentForPrompt([
      makeEvent({ documentId: 'doc-2002', eventDate: '2002-01-01', datePrecision: 'anno', title: 'Colecistectomia', sourceText: 'colecistectomia' }),
    ]);
    expect(out).toContain('data 2002');
    expect(out).not.toContain('01.01.2002');
  });

  // Feedback beta 2026-07-20 (CASO-2026-027): uno storico appuntamenti multi-data
  // era intestato "Referto di controllo medico, in data 15.05.2026" — data del primo
  // appuntamento spacciata per data-documento. Un documento con più date-evento deve
  // dichiarare l'INTERVALLO, non fingere una data unica.
  it('documento con più date-evento → intestazione "dal X al Y", mai una data unica inventata', () => {
    const out = formatEventsByDocumentForPrompt([
      makeEvent({ documentId: 'storico', eventDate: '2026-05-15', title: 'Seduta FKT', sourceText: 'seduta del 15/05' }),
      makeEvent({ documentId: 'storico', eventDate: '2026-05-19', title: 'Seduta FKT', sourceText: 'seduta del 19/05' }),
      makeEvent({ documentId: 'storico', eventDate: '2026-06-05', title: 'Seduta FKT', sourceText: 'seduta del 05/06' }),
    ]);
    expect(out).toContain('dal 15.05.2026 al 05.06.2026');
    expect(out).not.toContain('in data 15.05.2026');
  });

  it('documento con una sola data → resta "in data X" (invariato)', () => {
    const out = formatEventsByDocumentForPrompt([
      makeEvent({ documentId: 'doc-1', eventDate: '2024-03-15', title: 'Visita', sourceText: 'visita' }),
    ]);
    expect(out).toContain('in data 15.03.2024');
  });

  it('nessuna data valida (sentinella) → "s.d." senza "in data"', () => {
    const out = formatEventsByDocumentForPrompt([
      makeEvent({ documentId: 'doc-nd', eventDate: '1900-01-01', title: 'Documento senza data', sourceText: 'testo' }),
    ]);
    expect(out).toContain(', s.d.:');
    expect(out).not.toContain('in data s.d.');
  });

  // Il TIPO DOCUMENTO classificato (documents.document_type) è più affidabile del
  // sourceType del singolo evento estratto: quando è informativo (≠ altro) vince.
  it('label dal documentType classificato quando informativo (vince sul sourceType evento)', () => {
    const out = formatEventsByDocumentForPrompt(
      [makeEvent({ documentId: 'doc-cert', sourceType: 'referto_controllo', title: 'Certificato', sourceText: 'prognosi 40 giorni' })],
      [{ documentId: 'doc-cert', documentType: 'certificato' }],
    );
    expect(out).toContain('Certificato medico');
    expect(out).not.toContain('Referto di controllo medico');
  });

  it('documentType "altro" + eventi concordi → fallback al label del sourceType (invariato)', () => {
    const out = formatEventsByDocumentForPrompt(
      [makeEvent({ documentId: 'doc-x', sourceType: 'referto_controllo', title: 'Controllo', sourceText: 'controllo' })],
      [{ documentId: 'doc-x', documentType: 'altro' }],
    );
    expect(out).toContain('Referto di controllo medico');
  });

  it('documentType "altro" + eventi con sourceType DISCORDI → etichetta neutra "Documento sanitario"', () => {
    const out = formatEventsByDocumentForPrompt(
      [
        makeEvent({ documentId: 'doc-mix', sourceType: 'referto_controllo', title: 'Controllo', sourceText: 'controllo' }),
        makeEvent({ documentId: 'doc-mix', sourceType: 'esame_strumentale', title: 'RX', sourceText: 'rx' }),
      ],
      [{ documentId: 'doc-mix', documentType: 'altro' }],
    );
    expect(out).toContain('Documento sanitario');
    expect(out).not.toContain('Referto di controllo medico');
  });
});

describe('synthesis-prompts', () => {
  describe('truncateOcrProportionally', () => {
    it('should return docs unchanged when under budget', () => {
      const docs = [
        { documentId: 'd1', fileName: 'doc1.pdf', documentType: 'cartella_clinica', pages: [{ pageNumber: 1, ocrText: 'abc' }], totalChars: 3 },
      ];
      const result = truncateOcrProportionally(docs, 1000);
      expect(result).toEqual(docs);
    });

    it('should truncate proportionally across documents', () => {
      const docs = [
        { documentId: 'd1', fileName: 'doc1.pdf', documentType: 'cartella_clinica', pages: [{ pageNumber: 1, ocrText: 'a'.repeat(600) }], totalChars: 600 },
        { documentId: 'd2', fileName: 'doc2.pdf', documentType: 'referto_controllo', pages: [{ pageNumber: 1, ocrText: 'b'.repeat(400) }], totalChars: 400 },
      ];
      const result = truncateOcrProportionally(docs, 500);
      // d1 gets 60% of 500 = 300, d2 gets 40% of 500 = 200
      const d1Chars = result[0].pages.reduce((s, p) => s + p.ocrText.length, 0);
      const d2Chars = result[1].pages.reduce((s, p) => s + p.ocrText.length, 0);
      expect(d1Chars).toBeLessThanOrEqual(400); // truncated text + "[... troncato...]" marker
      expect(d2Chars).toBeLessThanOrEqual(300);
    });

    it('should add truncation markers', () => {
      const docs = [
        { documentId: 'd1', fileName: 'doc1.pdf', documentType: 'cartella_clinica', pages: [{ pageNumber: 1, ocrText: 'x'.repeat(1000) }], totalChars: 1000 },
      ];
      const result = truncateOcrProportionally(docs, 500);
      const pageText = result[0].pages[0].ocrText;
      expect(pageText).toContain('troncato');
      expect(pageText).toContain('1000 chars originali');
    });

    it('should omit later pages and add omission notice', () => {
      const docs = [
        {
          documentId: 'd1', fileName: 'doc1.pdf', documentType: 'cartella_clinica',
          pages: [
            { pageNumber: 1, ocrText: 'a'.repeat(300) },
            { pageNumber: 2, ocrText: 'b'.repeat(300) },
            { pageNumber: 3, ocrText: 'c'.repeat(400) },
          ],
          totalChars: 1000,
        },
      ];
      const result = truncateOcrProportionally(docs, 500);
      // Budget is 500. Page 1 (300) fits, page 2 (300) partially, page 3 omitted
      expect(result[0].pages.length).toBeLessThanOrEqual(4); // at most pages + omission notice
      const lastPage = result[0].pages[result[0].pages.length - 1];
      expect(lastPage.ocrText).toContain('pagine omesse');
    });
  });

  describe('formatDocumentsOcrForPrompt', () => {
    it('should return empty string for no docs', () => {
      expect(formatDocumentsOcrForPrompt(undefined)).toBe('');
      expect(formatDocumentsOcrForPrompt([])).toBe('');
    });

    it('should include truncation notice when over budget', () => {
      const largeDocs = [
        {
          documentId: 'd1', fileName: 'big.pdf', documentType: 'cartella_clinica',
          pages: [{ pageNumber: 1, ocrText: 'x'.repeat(400_000) }],
          totalChars: 400_000,
        },
      ];
      const result = formatDocumentsOcrForPrompt(largeDocs);
      expect(result).toContain('troncato proporzionalmente');
      expect(result).toContain('400000');
    });

    it('should not truncate when under budget', () => {
      const docs = [
        {
          documentId: 'd1', fileName: 'small.pdf', documentType: 'cartella_clinica',
          pages: [{ pageNumber: 1, ocrText: 'some text' }],
          totalChars: 9,
        },
      ];
      const result = formatDocumentsOcrForPrompt(docs);
      expect(result).not.toContain('troncato proporzionalmente');
      expect(result).toContain('some text');
    });
  });

  describe('filterMedicalImages', () => {
    it('should include medical image types', () => {
      const images = [
        { imageType: 'radiografia', description: 'RX ginocchio destro AP' },
        { imageType: 'tac', description: 'TAC cranio senza mdc' },
        { imageType: 'risonanza', description: 'RM colonna lombare' },
        { imageType: 'ecografia', description: 'Ecografia addome' },
      ];
      expect(filterMedicalImages(images)).toHaveLength(4);
    });

    it('should exclude "altro" image type', () => {
      const images = [
        { imageType: 'altro', description: 'Immagine non classificata' },
        { imageType: 'radiografia', description: 'RX torace' },
      ];
      const result = filterMedicalImages(images);
      expect(result).toHaveLength(1);
      expect(result[0].imageType).toBe('radiografia');
    });

    it('should exclude images with admin keywords in description', () => {
      const images = [
        { imageType: 'radiografia', description: 'Logo intestazione ospedale' },
        { imageType: 'tac', description: 'Timbro e firma del medico' },
        { imageType: 'risonanza', description: 'Header della pagina' },
        { imageType: 'radiografia', description: 'RX ginocchio destro' },
      ];
      const result = filterMedicalImages(images);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('RX ginocchio destro');
    });

    it('should return empty array for empty input', () => {
      expect(filterMedicalImages([])).toEqual([]);
    });

    it('should handle mixed medical and non-medical images', () => {
      const images = [
        { imageType: 'radiografia', description: 'RX femore destro' },
        { imageType: 'altro', description: 'Documento scansionato' },
        { imageType: 'tac', description: 'Watermark pagina referti' },
        { imageType: 'ecografia', description: 'Ecografia muscolo-tendinea' },
        { imageType: 'risonanza', description: 'Stemma della ASL' },
      ];
      const result = filterMedicalImages(images);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.imageType)).toEqual(['radiografia', 'ecografia']);
    });
  });

  describe('formatDocumentSummariesForPrompt', () => {
    it('should return empty string for undefined summaries', () => {
      expect(formatDocumentSummariesForPrompt(undefined)).toBe('');
    });

    it('should return empty string for empty array', () => {
      expect(formatDocumentSummariesForPrompt([])).toBe('');
    });

    it('should format summaries with header and document details', () => {
      const summaries: DocumentSummary[] = [
        {
          documentId: 'doc-1',
          fileName: 'referto.pdf',
          documentType: 'referto_controllo',
          summary: 'Visita ortopedica con diagnosi frattura femore.',
          totalCharsOriginal: 5000,
        },
        {
          documentId: 'doc-2',
          fileName: 'cartella.pdf',
          documentType: 'cartella_clinica',
          summary: 'Ricovero ospedaliero per intervento chirurgico.',
          totalCharsOriginal: 12000,
        },
      ];

      const result = formatDocumentSummariesForPrompt(summaries);
      expect(result).toContain('RIASSUNTI AI DEI DOCUMENTI ORIGINALI');
      expect(result).toContain('2 documenti');
      expect(result).toContain('17000 caratteri originali');
      expect(result).toContain('referto.pdf');
      expect(result).toContain('cartella.pdf');
      expect(result).toContain('Visita ortopedica');
      expect(result).toContain('Ricovero ospedaliero');
    });
  });

  describe('formatAnomaliesForPrompt', () => {
    function makeAnomaly(overrides?: Partial<DetectedAnomaly>): DetectedAnomaly {
      return {
        anomalyType: 'complicanza_non_gestita',
        severity: 'alta',
        description: 'Complicanza senza trattamento documentato',
        involvedEvents: [{ eventId: 'e1', orderNumber: 1, date: '2025-06-05', title: 'Difficoltà motorie' }],
        suggestion: 'Verificare se la complicanza è stata trattata',
        ...overrides,
      };
    }

    it('should return placeholder when no anomalies', () => {
      expect(formatAnomaliesForPrompt([])).toBe('Nessuna anomalia rilevata.');
    });

    it('should format anomaly without resolutionNote (no NOTA DEL PERITO line)', () => {
      const result = formatAnomaliesForPrompt([makeAnomaly()]);
      expect(result).toContain('[ALTA] complicanza_non_gestita');
      expect(result).toContain('Complicanza senza trattamento documentato');
      expect(result).not.toContain('NOTA DEL PERITO');
    });

    it('should include perito note when resolutionNote is present (bug A fix)', () => {
      const result = formatAnomaliesForPrompt([
        makeAnomaly({ resolutionNote: 'Il trattamento risulta documentato in relazione successiva' }),
      ]);
      expect(result).toContain('NOTA DEL PERITO (vincolante — integra nel testo del report)');
      expect(result).toContain('"Il trattamento risulta documentato in relazione successiva"');
    });

    it('should skip empty resolutionNote', () => {
      const r1 = formatAnomaliesForPrompt([makeAnomaly({ resolutionNote: '' })]);
      const r2 = formatAnomaliesForPrompt([makeAnomaly({ resolutionNote: '   ' })]);
      const r3 = formatAnomaliesForPrompt([makeAnomaly({ resolutionNote: null })]);
      expect(r1).not.toContain('NOTA DEL PERITO');
      expect(r2).not.toContain('NOTA DEL PERITO');
      expect(r3).not.toContain('NOTA DEL PERITO');
    });

    it('should preserve order and include perito notes for multiple anomalies', () => {
      const result = formatAnomaliesForPrompt([
        makeAnomaly({ description: 'First', resolutionNote: 'note A' }),
        makeAnomaly({ description: 'Second' }),
        makeAnomaly({ description: 'Third', resolutionNote: 'note C' }),
      ]);
      expect(result.indexOf('First')).toBeLessThan(result.indexOf('Second'));
      expect(result.indexOf('Second')).toBeLessThan(result.indexOf('Third'));
      expect(result).toContain('"note A"');
      expect(result).toContain('"note C"');
      // Second has no note, so only 2 NOTA DEL PERITO occurrences total
      const noteCount = (result.match(/NOTA DEL PERITO/g) ?? []).length;
      expect(noteCount).toBe(2);
    });
  });
});

describe('formatEventsForPrompt — sicurezza data sentinella', () => {
  it('rende la sentinella 1900-01-01 come "s.d." (mai i pattern bloccati dal validator)', () => {
    const out = formatEventsForPrompt([makeEvent({ eventDate: '1900-01-01', eventType: 'spesa_medica' })]);
    expect(out).toContain('s.d.');
    expect(out).not.toContain('Data non documentata');
    expect(out).not.toMatch(/01[./]01[./]1900/);
  });

  it('rende normalmente una data reale (DD.MM.YYYY)', () => {
    const out = formatEventsForPrompt([makeEvent({ eventDate: '2024-03-15' })]);
    expect(out).toContain('15.03.2024');
  });
});
