import { describe, it, expect } from 'vitest';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  filterMedicalImages,
  truncateOcrProportionally,
  formatDocumentsOcrForPrompt,
  formatDocumentSummariesForPrompt,
  buildChronologyUserPrompt,
  formatAnomaliesForPrompt,
  formatEventsForPrompt,
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

describe('synthesis-prompts', () => {
  describe('buildSynthesisSystemPrompt', () => {
    it('should contain ABSOLUTE_RULES with sentinel date rule', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('REGOLE ASSOLUTE');
      expect(prompt).toContain('Data non documentata');
      expect(prompt).toContain('NON usare date fittizie come 01/01/1900');
      expect(prompt).toContain('NON scrivere MAI la stringa letterale "Data non documentata"');
    });

    it('should contain objective tone for ctu role', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('OGGETTIVO');
      expect(prompt).toContain('FATTUALE');
      expect(prompt).toContain('CTU');
    });

    it('should contain objective tone for ctp role', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctp',
      });

      expect(prompt).toContain('OGGETTIVO');
      expect(prompt).toContain('FATTUALE');
      expect(prompt).toContain('CTP');
    });

    it('should contain objective tone for stragiudiziale role', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'stragiudiziale',
      });

      expect(prompt).toContain('stragiudiziale');
      expect(prompt).toContain('OGGETTIVO');
    });

    it('should contain mandatory section headings', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('DATI DELLA DOCUMENTAZIONE SANITARIA');
      expect(prompt).toContain('RIASSUNTO DEL CASO');
      expect(prompt).toContain('ELEMENTI PER LA VALUTAZIONE MEDICO-LEGALE');
      expect(prompt).toContain('Profili critici documentati');
      expect(prompt).toContain('SINTESI CONCLUSIVA');
    });

    it('should NOT contain ALLEGATI ICONOGRAFICI section', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).not.toMatch(/### ALLEGATI ICONOGRAFICI/);
    });

    it('should contain FORMATO CITAZIONE OBBLIGATORIO', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('FORMATO CITAZIONE OBBLIGATORIO');
      expect(prompt).toContain('**Tipo documento, autore/struttura, in data DD.MM.YYYY:**');
    });

    it('should require COMPLETE lab tables (TUTTI i valori)', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('TUTTI i valori riportati nel documento originale');
      expect(prompt).not.toContain('SOLO i valori clinicamente rilevanti');
    });

    it('should instruct images ESCLUSIVAMENTE INLINE', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('NON INVENTARE MAI riferimenti a immagini');
      expect(prompt).not.toContain('includile in DUE posizioni');
    });

    it('should contain OCR confidence handling instructions', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('BASSA AFFIDABILITÀ OCR');
      expect(prompt).toContain('Affidabilità OCR media');
      expect(prompt).toContain('bassa affidabilità come fatti certi');
    });

    it('should contain anti-hallucination rules', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('DIVIETO ASSOLUTO DI INVENZIONE');
      expect(prompt).toContain('ANTI-HALLUCINATION');
    });

    it('should instruct NOT to use [Ev.N] references', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).not.toContain('[Ev.N]');
      expect(prompt).toContain('NON usare riferimenti numerati');
    });

    it('should include perizia metadata structure when provided', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
        periziaMetadata: {
          tribunale: 'Tribunale di Milano',
          quesiti: ['Descrivere le lesioni'],
        },
      });

      expect(prompt).toContain('PREMESSE');
      expect(prompt).toContain('ELEMENTI PER LA RISPOSTA AI QUESITI');
    });
  });

  describe('buildSynthesisUserPrompt', () => {
    it('should include all events in the prompt', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', title: 'Prima visita' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-20', title: 'RM ginocchio' }),
        makeEvent({ orderNumber: 3, eventDate: '2024-03-05', title: 'Intervento' }),
      ];

      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: 'M.R.',
        caseRole: 'ctu',
        events,
        anomalies: [],
        missingDocuments: [],
      });

      expect(prompt).toContain('Prima visita');
      expect(prompt).toContain('RM ginocchio');
      expect(prompt).toContain('Intervento');
      expect(prompt).toContain('NUMERO EVENTI DOCUMENTATI: 3');
    });

    it('should format sentinel date as "Data non documentata"', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '1900-01-01', title: 'Evento senza data' }),
      ];

      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: null,
        caseRole: 'ctu',
        events,
        anomalies: [],
        missingDocuments: [],
      });

      // formatDate('1900-01-01') returns 'Data non documentata'
      expect(prompt).toContain('Data non documentata');
      expect(prompt).not.toContain('01/01/1900');
    });

    it('should include anomalies when present', () => {
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: 'M.R.',
        caseRole: 'ctu',
        events: [makeEvent()],
        anomalies: [{
          anomalyType: 'ritardo_diagnostico',
          severity: 'alta',
          description: 'Ritardo di 30 giorni nella diagnosi',
          involvedEvents: [{ eventId: null, date: '2024-01-10', title: 'Visita', orderNumber: 1 }],
          suggestion: 'Verificare tempistiche diagnostiche',
        }],
        missingDocuments: [],
      });

      expect(prompt).toContain('Ritardo di 30 giorni');
      expect(prompt).toContain('ANOMALIE RILEVATE');
    });

    it('should include calculations when provided', () => {
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: 'M.R.',
        caseRole: 'ctu',
        events: [makeEvent()],
        anomalies: [],
        missingDocuments: [],
        calculations: [{
          label: 'ITT stimata',
          value: '30 giorni',
          days: 30,
          startDate: '2024-01-15',
          endDate: '2024-02-14',
          notes: 'Basata su ricovero',
        }],
      });

      expect(prompt).toContain('ITT stimata');
      expect(prompt).toContain('30 giorni');
    });

    it('should show correct role label', () => {
      const ctpPrompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: null,
        caseRole: 'ctp',
        events: [makeEvent()],
        anomalies: [],
        missingDocuments: [],
      });

      expect(ctpPrompt).toContain('CTP - Consulente Tecnico di Parte');
    });

    it('should include low confidence qualifier for events below 50%', () => {
      const events = [
        makeEvent({ orderNumber: 1, confidence: 30, title: 'Evento incerto' }),
      ];
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: null,
        caseRole: 'ctu',
        events,
        anomalies: [],
        missingDocuments: [],
      });

      expect(prompt).toContain('BASSA AFFIDABILITÀ OCR');
      expect(prompt).toContain('verificare fonte');
    });

    it('should include medium confidence qualifier for events 50-69%', () => {
      const events = [
        makeEvent({ orderNumber: 1, confidence: 60, title: 'Evento medio' }),
      ];
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: null,
        caseRole: 'ctu',
        events,
        anomalies: [],
        missingDocuments: [],
      });

      expect(prompt).toContain('Affidabilità OCR media');
    });

    it('should not include confidence qualifier for events 70%+', () => {
      const events = [
        makeEvent({ orderNumber: 1, confidence: 85, title: 'Evento affidabile' }),
      ];
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: null,
        caseRole: 'ctu',
        events,
        anomalies: [],
        missingDocuments: [],
      });

      expect(prompt).not.toContain('BASSA AFFIDABILITÀ');
      expect(prompt).not.toContain('Affidabilità OCR media');
    });

    it('should handle empty events gracefully', () => {
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: null,
        caseRole: 'ctu',
        events: [],
        anomalies: [],
        missingDocuments: [],
      });

      expect(prompt).toContain('NUMERO EVENTI DOCUMENTATI: 0');
      expect(prompt).toContain('N/D'); // period is N/D
    });

    it('should include image analysis when provided', () => {
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: 'M.R.',
        caseRole: 'ctu',
        events: [makeEvent()],
        anomalies: [],
        missingDocuments: [],
        imageAnalysis: [{
          pageNumber: 5,
          imageType: 'RX',
          description: 'Frattura del femore distale',
          confidence: 85,
        }],
      });

      expect(prompt).toContain('IMMAGINI DIAGNOSTICHE DISPONIBILI');
      expect(prompt).toContain('Frattura del femore distale');
      expect(prompt).toContain('Pagina 5');
    });

    it('should exclude non-medical images from prompt', () => {
      const prompt = buildSynthesisUserPrompt({
        caseType: 'ortopedica',
        patientInitials: 'M.R.',
        caseRole: 'ctu',
        events: [makeEvent()],
        anomalies: [],
        missingDocuments: [],
        imageAnalysis: [
          { pageNumber: 1, imageType: 'altro', description: 'Logo ospedale', confidence: 90 },
          { pageNumber: 5, imageType: 'RX', description: 'Frattura femore', confidence: 85 },
        ],
      });

      expect(prompt).toContain('Frattura femore');
      expect(prompt).not.toContain('Logo ospedale');
    });
  });

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

  describe('buildChronologyUserPrompt with documentSummaries', () => {
    it('should use document summaries instead of OCR when both provided', () => {
      const summaries: DocumentSummary[] = [{
        documentId: 'doc-1',
        fileName: 'test.pdf',
        documentType: 'referto_controllo',
        summary: 'Summary content here',
        totalCharsOriginal: 5000,
      }];

      const result = buildChronologyUserPrompt({
        eventsFormatted: '1. [15/03/2024] visita',
        caseTypeLabel: 'Ortopedica',
        expertRole: 'CTU',
        documentSummaries: summaries,
        documentsOcrText: [{
          documentId: 'doc-1',
          fileName: 'test.pdf',
          documentType: 'referto_controllo',
          pages: [{ pageNumber: 1, ocrText: 'OCR text that should NOT appear' }],
          totalChars: 5000,
        }],
      });

      expect(result).toContain('RIASSUNTI AI');
      expect(result).toContain('Summary content here');
      expect(result).not.toContain('OCR text that should NOT appear');
      expect(result).toContain('riassunti');
    });

    it('should fall back to OCR when no summaries provided', () => {
      const result = buildChronologyUserPrompt({
        eventsFormatted: '1. [15/03/2024] visita',
        caseTypeLabel: 'Ortopedica',
        expertRole: 'CTU',
        documentsOcrText: [{
          documentId: 'doc-1',
          fileName: 'test.pdf',
          documentType: 'referto_controllo',
          pages: [{ pageNumber: 1, ocrText: 'OCR text present' }],
          totalChars: 100,
        }],
      });

      expect(result).toContain('TESTO OCR');
      expect(result).not.toContain('RIASSUNTI AI');
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

  describe('formatEventsForPrompt — relevance filter (Fase 3)', () => {
    it('renders a T3 routine event COMPACTLY (no full detail / verbatim quote)', () => {
      const out = formatEventsForPrompt([
        makeEvent({ eventType: 'esame', sourceType: 'esame_ematochimico', title: 'Emocromo', description: 'Hb 9.7' }),
      ]);
      expect(out).toContain('Emocromo');
      expect(out).not.toContain('DESCRIZIONE');
      expect(out).not.toContain('CITAZIONE TESTUALE');
    });

    it('renders a T1 event in FULL detail (description + diagnosis + verbatim quote)', () => {
      const out = formatEventsForPrompt([
        makeEvent({ eventType: 'diagnosi', title: 'Diagnosi', diagnosis: 'Frattura del radio', sourceText: 'Frattura del radio distale.' }),
      ]);
      expect(out).toContain('DESCRIZIONE');
      expect(out).toContain('Diagnosi: Frattura del radio');
      expect(out).toContain('CITAZIONE TESTUALE');
    });

    it('keeps EVERY event present (T3 compact, never hidden)', () => {
      const out = formatEventsForPrompt([
        makeEvent({ orderNumber: 1, eventType: 'esame', sourceType: 'esame_ematochimico', title: 'Glicemia' }),
        makeEvent({ orderNumber: 2, eventType: 'intervento', title: 'Osteosintesi' }),
      ]);
      expect(out).toContain('Glicemia');
      expect(out).toContain('Osteosintesi');
    });
  });
});
