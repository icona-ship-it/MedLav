import { describe, it, expect } from 'vitest';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  filterMedicalImages,
} from './synthesis-prompts';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

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
      expect(prompt).toContain('ALLEGATI ICONOGRAFICI');
    });

    it('should contain anti-hallucination rules', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('DIVIETO ASSOLUTO DI INVENZIONE');
      expect(prompt).toContain('ANTI-HALLUCINATION');
    });

    it('should contain event reference rule [Ev.N]', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('[Ev.N]');
      expect(prompt).toContain('tracciabilità');
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
});
