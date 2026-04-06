import { describe, it, expect } from 'vitest';
import { resolveSectionPlan, evaluateCondition, getAllSectionIds, CTU_SECTIONS, CTP_SECTIONS, STRAGIUDIZIALE_SECTIONS } from './section-catalog';
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

const CTU_PARAMS = {
  caseType: 'ortopedica' as CaseType,
  caseRole: 'ctu' as const,
  events: [makeEvent()],
  documentTypes: ['cartella_clinica'],
};

const STRAGIUDIZIALE_PARAMS = {
  ...CTU_PARAMS,
  caseRole: 'stragiudiziale' as const,
};

const CTP_PARAMS = {
  ...CTU_PARAMS,
  caseRole: 'ctp' as const,
};

describe('section-catalog', () => {
  // ── evaluateCondition ─────────────────────────────────────────────

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

    it('should return true for has-quesiti when quesiti present', () => {
      const result = evaluateCondition('has-quesiti', {
        events: [],
        documentTypes: [],
        periziaMetadata: { quesiti: ['Descrivano le lesioni...'] },
      });
      expect(result).toBe(true);
    });

    it('should return false for has-quesiti when empty array', () => {
      const result = evaluateCondition('has-quesiti', {
        events: [],
        documentTypes: [],
        periziaMetadata: { quesiti: [] },
      });
      expect(result).toBe(false);
    });

    it('should return false for has-quesiti when undefined', () => {
      const result = evaluateCondition('has-quesiti', {
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

  // ── Role-specific section arrays ──────────────────────────────────

  describe('role-specific section arrays', () => {
    it('should have 15 CTU sections', () => {
      expect(CTU_SECTIONS).toHaveLength(15);
    });

    it('should have 14 CTP sections (CTU without osservazioni_bozza)', () => {
      expect(CTP_SECTIONS).toHaveLength(14);
      expect(CTP_SECTIONS.map((s) => s.id)).not.toContain('osservazioni_bozza');
    });

    it('should have 8 stragiudiziale sections', () => {
      expect(STRAGIUDIZIALE_SECTIONS).toHaveLength(8);
    });

    it('should have placeholder sections with isPlaceholder=true and maxTokens=0', () => {
      const placeholders = CTU_SECTIONS.filter((s) => s.isPlaceholder);
      expect(placeholders.length).toBeGreaterThanOrEqual(4);
      for (const p of placeholders) {
        expect(p.maxTokens).toBe(0);
        expect(p.placeholderText).toBeTruthy();
        expect(p.dataSources).toEqual([]);
      }
    });

    it('should have bibliografia section with pubmed-references data source and fallback placeholder text', () => {
      const biblio = CTU_SECTIONS.find((s) => s.id === 'bibliografia');
      expect(biblio).toBeDefined();
      expect(biblio!.dataSources).toContain('pubmed-references');
      expect(biblio!.placeholderText).toBeTruthy();
      expect(biblio!.promptDirective).toBeTruthy();
    });

    it('should not contain specialty sections (analisi_intervento, complicanze, etc.)', () => {
      const allIds = [
        ...CTU_SECTIONS.map((s) => s.id),
        ...CTP_SECTIONS.map((s) => s.id),
        ...STRAGIUDIZIALE_SECTIONS.map((s) => s.id),
      ];
      expect(allIds).not.toContain('analisi_intervento');
      expect(allIds).not.toContain('complicanze');
      expect(allIds).not.toContain('danno_biologico');
      expect(allIds).not.toContain('nesso_causale');
      expect(allIds).not.toContain('timeline_diagnostica');
    });

    it('should not contain elementi_rilievo or riassunto (old section names)', () => {
      const allIds = [
        ...CTU_SECTIONS.map((s) => s.id),
        ...STRAGIUDIZIALE_SECTIONS.map((s) => s.id),
      ];
      expect(allIds).not.toContain('elementi_rilievo');
      expect(allIds).not.toContain('riassunto');
    });

    it('should contain epicrisi in all role arrays', () => {
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('epicrisi');
      expect(CTP_SECTIONS.map((s) => s.id)).toContain('epicrisi');
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).toContain('epicrisi');
    });

    it('should not have [Ev.N] references in any promptDirective', () => {
      const allSections = [...CTU_SECTIONS, ...CTP_SECTIONS, ...STRAGIUDIZIALE_SECTIONS];
      for (const s of allSections) {
        expect(s.promptDirective).not.toMatch(/\[Ev\.N\]/);
        expect(s.promptDirective).not.toMatch(/\[Ev\.\d+\]/);
      }
    });
  });

  // ── resolveSectionPlan ────────────────────────────────────────────

  describe('resolveSectionPlan', () => {
    it('should return CTU sections for ctu role', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('epicrisi');
      expect(ids).toContain('profilo_metodologico');
    });

    it('should return stragiudiziale sections for stragiudiziale role', () => {
      const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('intestazione_stragiudiziale');
      expect(ids).toContain('anamnesi');
      expect(ids).toContain('fatto_storia_clinica');
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('epicrisi');
      expect(ids).toContain('conclusioni');
      // Should NOT have CTU-specific sections
      expect(ids).not.toContain('profilo_metodologico');
      expect(ids).not.toContain('quesiti');
      expect(ids).not.toContain('conclusioni_quesiti');
    });

    it('should return CTP sections for ctp role', () => {
      const plan = resolveSectionPlan(CTP_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('epicrisi');
      expect(ids).not.toContain('osservazioni_bozza');
    });

    it('should not include intestazione without perizia metadata (CTU)', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).not.toContain('intestazione');
    });

    it('should include intestazione with perizia metadata (CTU)', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { tribunale: 'Tribunale di Brescia' },
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('intestazione');
    });

    it('should include quesiti section when quesiti present (CTU)', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { quesiti: ['Descrivano le lesioni...'] },
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('quesiti');
      expect(ids).toContain('conclusioni_quesiti');
    });

    it('should not include quesiti section without quesiti (CTU)', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).not.toContain('quesiti');
      expect(ids).not.toContain('conclusioni_quesiti');
    });

    it('should include spese_mediche when expense events exist', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        events: [makeEvent({ eventType: 'spesa_medica' })],
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('spese_mediche');
    });

    it('should not include spese_mediche without expense events', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).not.toContain('spese_mediche');
    });

    it('should include all conditional sections when all conditions are met (CTU)', () => {
      const periziaMetadata: PeriziaMetadata = {
        tribunale: 'Tribunale di Brescia',
        quesiti: ['Quesito 1'],
      };
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata,
        events: [
          makeEvent({ eventType: 'spesa_medica' }),
          makeEvent({ eventType: 'certificato' }),
        ],
        documentTypes: ['cartella_clinica', 'memoria_difensiva', 'perizia_ctp'],
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('intestazione');
      expect(ids).toContain('quesiti');
      expect(ids).toContain('documentazione_atti');
      expect(ids).toContain('premesse');
      expect(ids).toContain('spese_mediche');
      expect(ids).toContain('pareri_tecnici');
      expect(ids).toContain('conclusioni_quesiti');
    });

    it('should have needsOcr=true for documentazione_sanitaria', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const docSan = plan.find((s) => s.id === 'documentazione_sanitaria');
      expect(docSan?.needsOcr).toBe(true);
    });

    it('should have needsOcr=false for epicrisi', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const epicrisi = plan.find((s) => s.id === 'epicrisi');
      expect(epicrisi?.needsOcr).toBe(false);
    });

    it('should handle all case types for all roles without errors', () => {
      const caseTypes: CaseType[] = [
        'ortopedica', 'oncologica', 'ostetrica', 'anestesiologica',
        'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto',
        'previdenziale', 'infortuni', 'perizia_assicurativa',
        'analisi_spese_mediche', 'opinione_prognostica', 'generica',
      ];
      const roles = ['ctu', 'ctp', 'stragiudiziale'] as const;

      for (const role of roles) {
        for (const ct of caseTypes) {
          const plan = resolveSectionPlan({
            ...CTU_PARAMS,
            caseType: ct,
            caseRole: role,
          });
          expect(plan.length).toBeGreaterThanOrEqual(3);
          expect(plan.map((s) => s.id)).toContain('documentazione_sanitaria');
          expect(plan.map((s) => s.id)).toContain('epicrisi');
        }
      }
    });

    it('should place documentazione_sanitaria before epicrisi (CTU)', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids.indexOf('documentazione_sanitaria')).toBeLessThan(ids.indexOf('epicrisi'));
    });

    it('should include placeholder sections in CTU plan', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const placeholders = plan.filter((s) => s.isPlaceholder);
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
      expect(placeholders.map((s) => s.id)).toContain('verbale_operazioni_peritali');
      expect(placeholders.map((s) => s.id)).toContain('visita_periziando');
      expect(placeholders.map((s) => s.id)).toContain('considerazioni_ml');
    });

    it('should include bibliografia section in CTU plan', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const biblio = plan.find((s) => s.id === 'bibliografia');
      expect(biblio).toBeDefined();
      expect(biblio!.dataSources).toContain('pubmed-references');
    });

    it('should include visita_clinica placeholder in stragiudiziale plan', () => {
      const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
      const visita = plan.find((s) => s.id === 'visita_clinica');
      expect(visita).toBeDefined();
      expect(visita?.isPlaceholder).toBe(true);
    });
  });

  // ── getAllSectionIds ──────────────────────────────────────────────

  describe('getAllSectionIds', () => {
    it('should return CTU section IDs for ctu role', () => {
      const ids = getAllSectionIds('ctu');
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('epicrisi');
      expect(ids).toContain('conclusioni_quesiti');
      expect(ids).toContain('osservazioni_bozza');
    });

    it('should return stragiudiziale section IDs', () => {
      const ids = getAllSectionIds('stragiudiziale');
      expect(ids).toContain('intestazione_stragiudiziale');
      expect(ids).toContain('anamnesi');
      expect(ids).toContain('fatto_storia_clinica');
      expect(ids).not.toContain('quesiti');
      expect(ids).not.toContain('conclusioni_quesiti');
    });

    it('should not return CTP osservazioni_bozza', () => {
      const ids = getAllSectionIds('ctp');
      expect(ids).not.toContain('osservazioni_bozza');
    });
  });
});
