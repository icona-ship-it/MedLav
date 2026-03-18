import { describe, it, expect } from 'vitest';
import { resolveSectionPlan, evaluateCondition, getAllSectionIds } from './section-catalog';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { CaseType, PeriziaMetadata } from '@/types';

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

const BASE_PARAMS = {
  caseType: 'ortopedica' as CaseType,
  caseRole: 'ctu' as const,
  events: [makeEvent()],
  documentTypes: ['cartella_clinica'],
};

describe('section-catalog', () => {
  describe('evaluateCondition', () => {
    it('should return true for has-perizia-metadata when tribunale is set', () => {
      const result = evaluateCondition('has-perizia-metadata', {
        events: [],
        documentTypes: [],
        periziaMetadata: { tribunale: 'Tribunale di Brescia' },
      });
      expect(result).toBe(true);
    });

    it('should return true for has-perizia-metadata when quesiti is set', () => {
      const result = evaluateCondition('has-perizia-metadata', {
        events: [],
        documentTypes: [],
        periziaMetadata: { quesiti: ['Quesito 1'] },
      });
      expect(result).toBe(true);
    });

    it('should return false for has-perizia-metadata when empty', () => {
      const result = evaluateCondition('has-perizia-metadata', {
        events: [],
        documentTypes: [],
        periziaMetadata: {},
      });
      expect(result).toBe(false);
    });

    it('should return false for has-perizia-metadata when undefined', () => {
      const result = evaluateCondition('has-perizia-metadata', {
        events: [],
        documentTypes: [],
      });
      expect(result).toBe(false);
    });

    it('should return true for has-non-medical-docs with memoria_difensiva', () => {
      const result = evaluateCondition('has-non-medical-docs', {
        events: [],
        documentTypes: ['memoria_difensiva'],
      });
      expect(result).toBe(true);
    });

    it('should return true for has-non-medical-docs with certificato events', () => {
      const result = evaluateCondition('has-non-medical-docs', {
        events: [makeEvent({ eventType: 'certificato' })],
        documentTypes: [],
      });
      expect(result).toBe(true);
    });

    it('should return false for has-non-medical-docs with only medical docs', () => {
      const result = evaluateCondition('has-non-medical-docs', {
        events: [makeEvent()],
        documentTypes: ['cartella_clinica'],
      });
      expect(result).toBe(false);
    });

    it('should return true for has-expense-events with spesa_medica events', () => {
      const result = evaluateCondition('has-expense-events', {
        events: [makeEvent({ eventType: 'spesa_medica' })],
        documentTypes: [],
      });
      expect(result).toBe(true);
    });

    it('should return false for has-expense-events without expense events', () => {
      const result = evaluateCondition('has-expense-events', {
        events: [makeEvent()],
        documentTypes: [],
      });
      expect(result).toBe(false);
    });

    it('should return true for has-perizie-docs with perizia_ctp', () => {
      const result = evaluateCondition('has-perizie-docs', {
        events: [],
        documentTypes: ['perizia_ctp'],
      });
      expect(result).toBe(true);
    });

    it('should return true for has-legal-docs with memoria_difensiva', () => {
      const result = evaluateCondition('has-legal-docs', {
        events: [],
        documentTypes: ['memoria_difensiva'],
      });
      expect(result).toBe(true);
    });
  });

  describe('resolveSectionPlan', () => {
    it('should always include documentazione_sanitaria', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('documentazione_sanitaria');
    });

    it('should always include riassunto', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('riassunto');
    });

    it('should always include elementi_rilievo', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('elementi_rilievo');
    });

    it('should always include conclusioni', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('conclusioni');
    });

    it('should not include intestazione without perizia metadata', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).not.toContain('intestazione');
    });

    it('should include intestazione with perizia metadata', () => {
      const plan = resolveSectionPlan({
        ...BASE_PARAMS,
        periziaMetadata: { tribunale: 'Tribunale di Brescia' },
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('intestazione');
    });

    it('should include spese_mediche when expense events exist', () => {
      const plan = resolveSectionPlan({
        ...BASE_PARAMS,
        events: [makeEvent({ eventType: 'spesa_medica' })],
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('spese_mediche');
    });

    it('should not include spese_mediche without expense events', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).not.toContain('spese_mediche');
    });

    it('should include specialty sections for ortopedica', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('analisi_intervento');
      expect(ids).toContain('complicanze');
      expect(ids).toContain('danno_biologico');
      expect(ids).toContain('nesso_causale');
    });

    it('should include specialty sections for oncologica', () => {
      const plan = resolveSectionPlan({
        ...BASE_PARAMS,
        caseType: 'oncologica',
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('timeline_diagnostica');
      expect(ids).toContain('analisi_ritardo');
      expect(ids).toContain('loss_of_chance');
    });

    it('should include specialty sections for ostetrica', () => {
      const plan = resolveSectionPlan({
        ...BASE_PARAMS,
        caseType: 'ostetrica',
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('analisi_travaglio');
      expect(ids).toContain('ctg_analisi');
      expect(ids).toContain('esiti_neonatali');
    });

    it('should place specialty sections after riassunto and before elementi_rilievo', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      const riassuntoIdx = ids.indexOf('riassunto');
      const elementiIdx = ids.indexOf('elementi_rilievo');
      const specialtyIdx = ids.indexOf('analisi_intervento');

      expect(specialtyIdx).toBeGreaterThan(riassuntoIdx);
      expect(specialtyIdx).toBeLessThan(elementiIdx);
    });

    it('should place conclusioni last', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids[ids.length - 1]).toBe('conclusioni');
    });

    it('should place documentazione_sanitaria before riassunto', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const ids = plan.map((s) => s.id);
      const docIdx = ids.indexOf('documentazione_sanitaria');
      const riassuntoIdx = ids.indexOf('riassunto');
      expect(docIdx).toBeLessThan(riassuntoIdx);
    });

    it('should handle all 13 case types without errors', () => {
      const caseTypes: CaseType[] = [
        'ortopedica', 'oncologica', 'ostetrica', 'anestesiologica',
        'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto',
        'previdenziale', 'infortuni', 'perizia_assicurativa',
        'analisi_spese_mediche', 'opinione_prognostica', 'generica',
      ];

      for (const ct of caseTypes) {
        const plan = resolveSectionPlan({
          ...BASE_PARAMS,
          caseType: ct,
        });
        expect(plan.length).toBeGreaterThanOrEqual(4); // at minimum: doc_sanitaria, riassunto, elementi, conclusioni
        expect(plan.map((s) => s.id)).toContain('documentazione_sanitaria');
        expect(plan.map((s) => s.id)).toContain('riassunto');
        expect(plan.map((s) => s.id)).toContain('conclusioni');
      }
    });

    it('should handle multi-type cases', () => {
      const plan = resolveSectionPlan({
        ...BASE_PARAMS,
        caseType: 'ortopedica',
        caseTypes: ['ortopedica', 'oncologica'],
      });
      const ids = plan.map((s) => s.id);
      // Should have sections from both types
      expect(ids).toContain('analisi_intervento'); // ortopedica
      expect(ids).toContain('timeline_diagnostica'); // oncologica
    });

    it('should include all conditional sections when all conditions are met', () => {
      const periziaMetadata: PeriziaMetadata = {
        tribunale: 'Tribunale di Brescia',
        quesiti: ['Quesito 1'],
      };
      const plan = resolveSectionPlan({
        ...BASE_PARAMS,
        periziaMetadata,
        events: [
          makeEvent({ eventType: 'spesa_medica' }),
          makeEvent({ eventType: 'certificato' }),
        ],
        documentTypes: ['cartella_clinica', 'memoria_difensiva', 'perizia_ctp'],
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('intestazione');
      expect(ids).toContain('documentazione_atti');
      expect(ids).toContain('premesse');
      expect(ids).toContain('spese_mediche');
      expect(ids).toContain('pareri_tecnici');
    });

    it('should have needsOcr=true for documentazione_sanitaria', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const docSan = plan.find((s) => s.id === 'documentazione_sanitaria');
      expect(docSan?.needsOcr).toBe(true);
    });

    it('should have needsOcr=false for riassunto', () => {
      const plan = resolveSectionPlan(BASE_PARAMS);
      const riassunto = plan.find((s) => s.id === 'riassunto');
      expect(riassunto?.needsOcr).toBe(false);
    });
  });

  describe('getAllSectionIds', () => {
    it('should return universal and specialty section IDs', () => {
      const ids = getAllSectionIds('ortopedica');
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('riassunto');
      expect(ids).toContain('elementi_rilievo');
      expect(ids).toContain('conclusioni');
      expect(ids).toContain('analisi_intervento');
    });

    it('should handle array of case types', () => {
      const ids = getAllSectionIds(['ortopedica', 'oncologica']);
      expect(ids).toContain('analisi_intervento');
      expect(ids).toContain('timeline_diagnostica');
    });
  });
});
