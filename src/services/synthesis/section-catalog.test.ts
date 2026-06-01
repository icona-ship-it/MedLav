import { describe, it, expect } from 'vitest';
import { resolveSectionPlan, evaluateCondition, getAllSectionIds, getSelectableSections, MANDATORY_SECTION_IDS, CTU_SECTIONS, CTP_SECTIONS, STRAGIUDIZIALE_SECTIONS, PARERE_PRO_VERITATE_SECTIONS, PARERE_SCOPO_RISERVA_SECTIONS } from './section-catalog';
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
    it('should have 13 CTU sections (benchmark scuola veronese + conciliazione 696-bis)', () => {
      expect(CTU_SECTIONS).toHaveLength(13);
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('conciliazione_ante_bozza');
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('conciliazione_post_bozza');
    });

    it('should have 12 CTP sections (CTU without osservazioni_bozza)', () => {
      expect(CTP_SECTIONS).toHaveLength(12);
      expect(CTP_SECTIONS.map((s) => s.id)).not.toContain('osservazioni_bozza');
    });

    it('should have 7 stragiudiziale sections (allineato benchmark Antoniazzi)', () => {
      expect(STRAGIUDIZIALE_SECTIONS).toHaveLength(7);
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).toContain('il_fatto_e_storia_clinica');
    });

    it('should have placeholder sections with isPlaceholder=true and maxTokens=0', () => {
      const placeholders = CTU_SECTIONS.filter((s) => s.isPlaceholder);
      // After benchmark alignment: operazioni_peritali, considerazioni_ml, osservazioni_bozza
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
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

    it('should contain epicrisi only in stragiudiziale (CTU/CTP merge it into considerazioni_ml placeholder)', () => {
      expect(CTU_SECTIONS.map((s) => s.id)).not.toContain('epicrisi');
      expect(CTP_SECTIONS.map((s) => s.id)).not.toContain('epicrisi');
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).toContain('epicrisi');
    });

    it('should not contain removed sections after benchmark alignment', () => {
      const allCtuCtp = [...CTU_SECTIONS.map((s) => s.id), ...CTP_SECTIONS.map((s) => s.id)];
      expect(allCtuCtp).not.toContain('profilo_metodologico');
      expect(allCtuCtp).not.toContain('verbale_operazioni_peritali');
      expect(allCtuCtp).not.toContain('visita_periziando');
      expect(allCtuCtp).not.toContain('conclusioni_quesiti');
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).not.toContain('il_fatto');
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).not.toContain('fatto_storia_clinica');
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).not.toContain('conclusioni');
    });

    it('should not have [Ev.N] references in any promptDirective', () => {
      const allSections = [...CTU_SECTIONS, ...CTP_SECTIONS, ...STRAGIUDIZIALE_SECTIONS];
      for (const s of allSections) {
        expect(s.promptDirective).not.toMatch(/\[Ev\.N\]/);
        expect(s.promptDirective).not.toMatch(/\[Ev\.\d+\]/);
      }
    });

    it('documentazione_sanitaria must instruct VERBATIM reproduction (no synthesis of source content)', () => {
      // Regression: benchmark scuola veronese (Lavini 2026-06-01) → la documentazione
      // va TRASCRITTA fedelmente, non riassunta. Vietato re-introdurre la sintesi del
      // contenuto-fonte (verbali operatori, lettere di dimissione).
      const docSan = [
        ...CTU_SECTIONS,
        ...STRAGIUDIZIALE_SECTIONS,
        ...PARERE_PRO_VERITATE_SECTIONS,
        ...PARERE_SCOPO_RISERVA_SECTIONS,
      ].filter((s) => s.id === 'documentazione_sanitaria');
      expect(docSan.length).toBeGreaterThanOrEqual(4);
      for (const s of docSan) {
        expect(s.promptDirective).toMatch(/VERBATIM/);
        expect(s.promptDirective).toMatch(/INTEGRALMENTE/);
        expect(s.maxChars).toBe(60_000);
        // must NOT re-introduce synthesis of source content
        expect(s.promptDirective).not.toMatch(/Sintetizza le sezioni narrative accessorie/i);
        expect(s.promptDirective).not.toMatch(/diagnosi pre\/post \+ tecnica \+ complicanze \+ esito/i);
      }
    });

    it('intestazione sections must have anti-fabrication rule and access to events', () => {
      // Regression: case Regnoto → report invented "Mario Bianchi", "Dott. Marco Rossi",
      // wrong fracture, wrong hospital, fake CF. Root cause: the prompt did not forbid
      // fabrication and the section had no access to events to read the real patient name.
      const intestazioneCtu = CTU_SECTIONS.find((s) => s.id === 'intestazione');
      const intestazioneStr = STRAGIUDIZIALE_SECTIONS.find((s) => s.id === 'intestazione_stragiudiziale');

      for (const spec of [intestazioneCtu, intestazioneStr]) {
        expect(spec).toBeDefined();
        if (!spec) continue;

        // Must include explicit anti-fabrication rule
        expect(spec.promptDirective).toMatch(/VIETATO INVENTARE/i);
        expect(spec.promptDirective).toContain('[da compilare dal perito]');

        // Must have access to events so it can read the real patient name from documents
        expect(spec.dataSources).toContain('events-medical');
      }
    });

    it('documentazione_sanitaria must forbid the FATTO/STANDARD/ELEMENTI A SUPPORTO/CONTRARI pattern', () => {
      // Regression: this interpretive pattern leaked into the chronology and produced
      // a biased narrative. It must be confined to dedicated anomaly/considerazioni sections.
      const docSan = [
        ...CTU_SECTIONS,
        ...STRAGIUDIZIALE_SECTIONS,
      ].filter((s) => s.id === 'documentazione_sanitaria');

      expect(docSan.length).toBeGreaterThan(0);
      for (const spec of docSan) {
        expect(spec.promptDirective).toMatch(/VIETATO il pattern/i);
        expect(spec.promptDirective).toMatch(/FATTO DOCUMENTATO.*STANDARD DI RIFERIMENTO/i);
      }
    });
  });

  // ── resolveSectionPlan ────────────────────────────────────────────

  describe('resolveSectionPlan', () => {
    it('should return CTU sections for ctu role', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('considerazioni_ml');
      expect(ids).toContain('operazioni_peritali');
    });

    it('should return stragiudiziale sections for stragiudiziale role', () => {
      const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('intestazione_stragiudiziale');
      expect(ids).toContain('anamnesi');
      expect(ids).toContain('il_fatto_e_storia_clinica');
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('epicrisi');
      // Should NOT have CTU-specific sections nor removed sections
      expect(ids).not.toContain('profilo_metodologico');
      expect(ids).not.toContain('quesiti');
      expect(ids).not.toContain('conclusioni_quesiti');
      expect(ids).not.toContain('conclusioni');
    });

    it('should return CTP sections for ctp role', () => {
      const plan = resolveSectionPlan(CTP_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('considerazioni_ml');
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
    });

    it('should not include quesiti section without quesiti (CTU)', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).not.toContain('quesiti');
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

    it('spese_mediche is a DETERMINISTIC placeholder (sentinel, no LLM) so every expense is included by construction', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        events: [makeEvent({ eventType: 'spesa_medica' })],
      });
      const spese = plan.find((s) => s.id === 'spese_mediche');
      expect(spese?.isPlaceholder).toBe(true);
      expect(spese?.placeholderText).toContain('<!--MEDLAV:SPESE-->');
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
    });

    it('should have needsOcr=true for documentazione_sanitaria', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const docSan = plan.find((s) => s.id === 'documentazione_sanitaria');
      expect(docSan?.needsOcr).toBe(true);
    });

    it('includes conciliazione sections only for ATP ex art. 696-bis procedures', () => {
      const withConciliazione = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { tipoProcedimento: 'Accertamento tecnico preventivo (ex art. 696 bis c.p.c.)' },
      }).map((s) => s.id);
      expect(withConciliazione).toContain('conciliazione_ante_bozza');
      expect(withConciliazione).toContain('conciliazione_post_bozza');

      const ordinario = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { tipoProcedimento: 'Consulenza Tecnica d\'Ufficio' },
      }).map((s) => s.id);
      expect(ordinario).not.toContain('conciliazione_ante_bozza');
      expect(ordinario).not.toContain('conciliazione_post_bozza');
    });

    it('should have needsOcr=false for epicrisi (stragiudiziale)', () => {
      const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
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
        }
      }
    });

    it('should place documentazione_sanitaria before considerazioni_ml (CTU)', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids.indexOf('documentazione_sanitaria')).toBeLessThan(ids.indexOf('considerazioni_ml'));
    });

    it('should include placeholder sections in CTU plan', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const placeholders = plan.filter((s) => s.isPlaceholder);
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
      expect(placeholders.map((s) => s.id)).toContain('operazioni_peritali');
      expect(placeholders.map((s) => s.id)).toContain('considerazioni_ml');
      expect(placeholders.map((s) => s.id)).toContain('osservazioni_bozza');
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

  // ── RC medico-legale: anamnesi/il_fatto compilati dal perito ──────

  describe('resolveSectionPlan — RC perito-filled anamnesi/il_fatto', () => {
    const RC_MODULE = 'perizia_ml_rc_civile';

    it('turns anamnesi into a deterministic placeholder when perito filled the fields (RC)', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        moduleId: RC_MODULE,
        periziaMetadata: { anamnesiFamiliare: 'Negativa.', pesoKg: 70, altezzaCm: 175 },
      });
      const anamnesi = plan.find((s) => s.id === 'anamnesi');
      expect(anamnesi?.isPlaceholder).toBe(true);
      expect(anamnesi?.maxTokens).toBe(0);
      expect(anamnesi?.placeholderText).toContain('Anamnesi familiare');
      expect(anamnesi?.placeholderText).toContain('BMI 22,9 (normopeso)');
    });

    it('turns il_fatto_e_storia_clinica into a placeholder with the perito text (RC)', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        moduleId: RC_MODULE,
        periziaMetadata: { ilFattoEStoriaClinica: 'In data X la paziente cadeva...' },
      });
      const fatto = plan.find((s) => s.id === 'il_fatto_e_storia_clinica');
      expect(fatto?.isPlaceholder).toBe(true);
      expect(fatto?.placeholderText).toBe('In data X la paziente cadeva...');
    });

    it('leaves anamnesi/il_fatto as LLM sections for RC when perito left them empty', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        moduleId: RC_MODULE,
        periziaMetadata: { tribunale: 'irrilevante' },
      });
      expect(plan.find((s) => s.id === 'anamnesi')?.isPlaceholder).toBeFalsy();
      expect(plan.find((s) => s.id === 'il_fatto_e_storia_clinica')?.isPlaceholder).toBeFalsy();
    });

    it('does NOT touch anamnesi/il_fatto for non-RC stragiudiziale even with the same metadata', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        periziaMetadata: { anamnesiFamiliare: 'Negativa.', ilFattoEStoriaClinica: 'testo' },
      });
      expect(plan.find((s) => s.id === 'anamnesi')?.isPlaceholder).toBeFalsy();
      expect(plan.find((s) => s.id === 'il_fatto_e_storia_clinica')?.isPlaceholder).toBeFalsy();
    });
  });

  // ── getAllSectionIds ──────────────────────────────────────────────

  describe('getAllSectionIds', () => {
    it('should return CTU section IDs for ctu role', () => {
      const ids = getAllSectionIds('ctu');
      expect(ids).toContain('documentazione_sanitaria');
      expect(ids).toContain('considerazioni_ml');
      expect(ids).toContain('operazioni_peritali');
      expect(ids).toContain('osservazioni_bozza');
    });

    it('should return stragiudiziale section IDs', () => {
      const ids = getAllSectionIds('stragiudiziale');
      expect(ids).toContain('intestazione_stragiudiziale');
      expect(ids).toContain('anamnesi');
      expect(ids).toContain('il_fatto_e_storia_clinica');
      expect(ids).toContain('epicrisi');
      expect(ids).not.toContain('quesiti');
      expect(ids).not.toContain('conclusioni_quesiti');
      expect(ids).not.toContain('conclusioni');
    });

    it('should not return CTP osservazioni_bozza', () => {
      const ids = getAllSectionIds('ctp');
      expect(ids).not.toContain('osservazioni_bozza');
    });
  });

  // ── Post-audit invariants for A2/A3 ──

  describe('A3 — placeholder sections are never empty', () => {
    const ALL = [
      ...CTU_SECTIONS,
      ...CTP_SECTIONS,
      ...STRAGIUDIZIALE_SECTIONS,
      ...PARERE_PRO_VERITATE_SECTIONS,
      ...PARERE_SCOPO_RISERVA_SECTIONS,
    ];
    it('every placeholder has >=5 words so the empty-section check never false-blocks', () => {
      for (const s of ALL.filter((x) => x.isPlaceholder)) {
        const words = (s.placeholderText ?? '').split(/\s+/).filter((w) => w.length > 0).length;
        expect(words, `placeholder "${s.id}" too short`).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('A2 — ITT/ITP table injected exactly once per role', () => {
    const llmCalcSections = (sections: typeof CTU_SECTIONS): string[] =>
      sections.filter((s) => !s.isPlaceholder && s.dataSources.includes('calculations')).map((s) => s.id);

    it('CTU/CTP: no LLM section carries calculations (table comes from considerazioni_ml placeholder)', () => {
      expect(llmCalcSections(CTU_SECTIONS)).toHaveLength(0);
      expect(llmCalcSections(CTP_SECTIONS)).toHaveLength(0);
      expect(CTU_SECTIONS.some((s) => s.id === 'considerazioni_ml' && s.isPlaceholder)).toBe(true);
    });

    it('parere_scopo_riserva: exactly one LLM section carries calculations (no double table)', () => {
      expect(llmCalcSections(PARERE_SCOPO_RISERVA_SECTIONS)).toEqual(['conclusioni_parere']);
    });

    it('parere_pro_veritate: exactly one LLM section carries calculations', () => {
      expect(llmCalcSections(PARERE_PRO_VERITATE_SECTIONS)).toEqual(['conclusioni_parere']);
    });
  });

  // ── Selettore "Sezioni del report" ──────────────────────────────────

  describe('getSelectableSections', () => {
    it('flags intestazione + considerazioni_ml as mandatory, documentazione optional (CTU)', () => {
      const ctu = getSelectableSections('ctu');
      expect(ctu.find((s) => s.id === 'intestazione')?.mandatory).toBe(true);
      expect(ctu.find((s) => s.id === 'considerazioni_ml')?.mandatory).toBe(true);
      expect(ctu.find((s) => s.id === 'documentazione_sanitaria')?.mandatory).toBe(false);
    });
    it('flags epicrisi mandatory for stragiudiziale', () => {
      expect(getSelectableSections('stragiudiziale').find((s) => s.id === 'epicrisi')?.mandatory).toBe(true);
    });
    it('every section title is non-empty', () => {
      for (const s of getSelectableSections('ctu')) expect(s.title.length).toBeGreaterThan(0);
    });
  });

  describe('resolveSectionPlan — excludedReportSections (selettore)', () => {
    it('removes an optional section the perito excluded', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { excludedReportSections: ['documentazione_sanitaria'] },
      });
      expect(plan.find((s) => s.id === 'documentazione_sanitaria')).toBeUndefined();
    });

    it('NEVER removes a mandatory section even if listed in the exclusion', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        // tribunale → soddisfa has-perizia-metadata così intestazione è nel piano
        periziaMetadata: { tribunale: 'Tribunale di X', excludedReportSections: ['intestazione', 'considerazioni_ml'] },
      });
      expect(plan.find((s) => s.id === 'intestazione')).toBeDefined();
      expect(plan.find((s) => s.id === 'considerazioni_ml')).toBeDefined();
    });

    it('keeps all sections when the exclusion list is empty (backward compatible)', () => {
      const withEmpty = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: { excludedReportSections: [] } });
      const without = resolveSectionPlan(CTU_PARAMS);
      expect(withEmpty.map((s) => s.id)).toEqual(without.map((s) => s.id));
    });

    it('every mandatory id is a real section id somewhere in the catalog', () => {
      const allIds = new Set([
        ...getAllSectionIds('ctu'),
        ...getAllSectionIds('stragiudiziale'),
        ...getAllSectionIds('ctu', 'parere_pro_veritate'),
      ]);
      for (const id of MANDATORY_SECTION_IDS) {
        if (id.startsWith('intestazione')) continue; // intestazione varia per ruolo/modulo
        expect(allIds.has(id)).toBe(true);
      }
    });
  });
});
