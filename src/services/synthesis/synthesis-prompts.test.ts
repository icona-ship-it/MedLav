import { describe, it, expect } from 'vitest';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
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

    it('should contain CTU role directive for ctu role', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('NEUTRALE');
      expect(prompt).toContain('IMPARZIALE');
      expect(prompt).toContain('TESI');
      expect(prompt).toContain('ANTITESI');
    });

    it('should contain CTP role directive for ctp role', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctp',
      });

      expect(prompt).toContain('consulente tecnico di PARTE');
      expect(prompt).toContain('OGGETTIVAMENTE');
    });

    it('should contain stragiudiziale role directive', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'stragiudiziale',
      });

      expect(prompt).toContain('STRAGIUDIZIALE');
      expect(prompt).toContain('OGGETTIVA');
    });

    it('should contain mandatory section headings', () => {
      const prompt = buildSynthesisSystemPrompt({
        caseType: 'ortopedica',
        caseRole: 'ctu',
      });

      expect(prompt).toContain('DATI DELLA DOCUMENTAZIONE SANITARIA');
      expect(prompt).toContain('RIASSUNTO DEL CASO');
      expect(prompt).toContain('PARERE MEDICO-LEGALE');
      expect(prompt).toContain('Considerazioni medico-legali');
      expect(prompt).toContain('CONCLUSIONI');
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
      expect(prompt).toContain('RISPOSTA AI QUESITI');
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
  });
});
