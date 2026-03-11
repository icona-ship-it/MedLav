import { describe, it, expect } from 'vitest';
import { checkCompleteness } from './completeness-checker';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

function makeEvent(overrides: Partial<ConsolidatedEvent> = {}): ConsolidatedEvent {
  return {
    orderNumber: 1,
    documentId: 'doc-1',
    eventDate: '2024-01-01',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Visita generica',
    description: 'Descrizione generica',
    sourceType: 'cartella_clinica',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 0.9,
    requiresVerification: false,
    reliabilityNotes: null,
    discrepancyNote: null,
    sourceText: '',
    sourcePages: [],
    ...overrides,
  };
}

describe('completeness-checker', () => {
  describe('checkCompleteness', () => {
    it('should return 100% when all requirements are met for oncologica', () => {
      const events: ConsolidatedEvent[] = [
        makeEvent({ eventType: 'diagnosi', title: 'Staging TNM T2N1M0', description: 'Stadiazione tumorale' }),
        makeEvent({ eventType: 'diagnosi', title: 'Esame istologico', description: 'Biopsia positiva' }),
        makeEvent({ eventType: 'esame', title: 'TAC total body', description: 'Imaging staging' }),
        makeEvent({ eventType: 'esame', title: 'Markers tumorali', description: 'CEA elevato' }),
        makeEvent({ eventType: 'terapia', title: 'Piano terapeutico chemioterapia', description: 'Protocollo terapeutico' }),
      ];

      const result = checkCompleteness({ events, caseType: 'oncologica' });
      expect(result.completenessPercent).toBe(100);
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should detect missing staging TNM for oncologica', () => {
      const events: ConsolidatedEvent[] = [
        makeEvent({ eventType: 'diagnosi', title: 'Biopsia', description: 'Esame istologico positivo' }),
        makeEvent({ eventType: 'terapia', title: 'Chemioterapia', description: 'Piano terapeutico' }),
      ];

      const result = checkCompleteness({ events, caseType: 'oncologica' });
      expect(result.completenessPercent).toBeLessThan(100);
      expect(result.missingRequired.some((r) => r.name === 'Staging TNM')).toBe(true);
    });

    it('should return empty missing for generica with consent and discharge', () => {
      const events: ConsolidatedEvent[] = [
        makeEvent({ eventType: 'consenso', title: 'Consenso informato' }),
        makeEvent({ title: 'Lettera di dimissione', description: 'Dimissione del paziente' }),
      ];

      const result = checkCompleteness({ events, caseType: 'generica' });
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should combine requirements for multi-type cases', () => {
      const events: ConsolidatedEvent[] = [
        makeEvent({ eventType: 'visita', title: 'Visita', description: 'Prima visita' }),
      ];

      const singleResult = checkCompleteness({ events, caseType: 'ortopedica' });
      const multiResult = checkCompleteness({
        events,
        caseType: 'ortopedica',
        caseTypes: ['ortopedica', 'anestesiologica'],
      });

      expect(multiResult.missingRequired.length).toBeGreaterThanOrEqual(
        singleResult.missingRequired.length,
      );
    });

    it('should detect CTG and APGAR missing for ostetrica', () => {
      const events: ConsolidatedEvent[] = [
        makeEvent({ title: 'Partogramma', description: 'Partogramma compilato' }),
        makeEvent({ title: 'Nascita', description: 'Età gestazionale 38 settimane, peso neonatale 3200g' }),
      ];

      const result = checkCompleteness({ events, caseType: 'ostetrica' });
      expect(result.missingRequired.some((r) => r.name === 'Tracciato CTG')).toBe(true);
      expect(result.missingRequired.some((r) => r.name === 'Punteggio APGAR')).toBe(true);
    });

    it('should handle empty events', () => {
      const result = checkCompleteness({ events: [], caseType: 'oncologica' });
      expect(result.completenessPercent).toBe(0);
      expect(result.missingRequired.length).toBeGreaterThan(0);
    });
  });
});
