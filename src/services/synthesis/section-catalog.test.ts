import { describe, it, expect } from 'vitest';
import { resolveSectionPlan, evaluateCondition, getAllSectionIds, getSelectableSections, MANDATORY_SECTION_IDS, CTU_SECTIONS, CTP_SECTIONS, STRAGIUDIZIALE_SECTIONS, PARERE_PRO_VERITATE_SECTIONS, PARERE_SCOPO_RISERVA_SECTIONS, getSectionSpecById, buildDocSanitariaLlmSpec, buildDocSanitariaSelectiveSpec } from './section-catalog';
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

    it('should return FALSE for has-expense-events when the only spese are notifiche-costo SSR (non risarcibili) — sezione Spese OMESSA, non "Nessuna spesa"', () => {
      const result = evaluateCondition('has-expense-events', {
        events: [makeEvent({ eventType: 'spesa_medica', title: 'Il SSR ha impiegato euro 1.038,80 per il ricovero' })],
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
    it('should have 16 CTU sections (benchmark gold 2026-06-10: + profilo metodologico, accertamento ausiliario, preventivi CTP)', () => {
      expect(CTU_SECTIONS).toHaveLength(16);
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('conciliazione_ante_bozza');
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('conciliazione_post_bozza');
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('profilo_metodologico');
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('accertamento_ausiliario');
      expect(CTU_SECTIONS.map((s) => s.id)).toContain('preventivi_spese_ml');
    });

    it('should have 15 CTP sections (CTU without osservazioni_bozza)', () => {
      expect(CTP_SECTIONS).toHaveLength(15);
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
      // profilo_metodologico: rimosso nel 2026-05, REINTRODOTTO il 2026-06-10
      // come placeholder deterministico (gold Del Porto, righe 91-115).
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
        // DETERMINISTIC by default: verbatim OCR reproduction via the sentinel
        // (the guarantee is now by construction, not via the prompt).
        expect(s.isPlaceholder).toBe(true);
        expect(s.placeholderText).toContain('MEDLAV:DOC_SANITARIA');
        // The dormant LLM directive (on-demand "elaborated" variant) still instructs verbatim.
        expect(s.promptDirective).toMatch(/VERBATIM/);
        expect(s.promptDirective).toMatch(/INTEGRALMENTE/);
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

    it('should degrade quesiti to a guided placeholder when the form has none (CTU) — QA 2026-06-11', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const quesiti = plan.find((s) => s.id === 'quesiti');
      // I gold CTU hanno i quesiti in 6 casi su 6: la sezione non sparisce mai.
      expect(quesiti).toBeDefined();
      expect(quesiti!.isPlaceholder).toBe(true);
      expect(quesiti!.placeholderText).toContain('quesiti formulati dal Giudice');
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
      // Benchmark gold 2026-06-10: premesse e documentazione_atti sono mutuamente
      // esclusive (5/6 gold riproducono gli atti UNA sola volta) — vince doc_atti.
      expect(ids).not.toContain('premesse');
      expect(ids).toContain('spese_mediche');
      expect(ids).toContain('pareri_tecnici');
    });

    it('documentazione_sanitaria: default SELETTIVA (decisione medici 2026-06-12) — narrativa con citazioni verbatim verificate', () => {
      const plan = resolveSectionPlan(CTU_PARAMS);
      const docSan = plan.find((s) => s.id === 'documentazione_sanitaria');
      expect(docSan?.isPlaceholder).toBe(false);
      expect(docSan?.needsOcr).toBe(true);
      expect(docSan?.promptDirective).toBeTruthy();
    });

    it('documentazione_sanitaria: docSanitariaMode integrale → placeholder deterministico verbatim', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { docSanitariaMode: 'integrale' },
      });
      const docSan = plan.find((s) => s.id === 'documentazione_sanitaria');
      expect(docSan?.isPlaceholder).toBe(true);
      expect(docSan?.needsOcr).toBe(false);
      expect(docSan?.placeholderText).toContain('MEDLAV:DOC_SANITARIA');
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

    it('ambito penale: swaps considerazioni_ml → considerazioni_penale e droppa spese_mediche', () => {
      const ids = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { ambitoPenale: true },
        events: [makeEvent({ eventType: 'spesa_medica' }), makeEvent()],
      }).map((s) => s.id);
      expect(ids).toContain('considerazioni_penale');
      expect(ids).not.toContain('considerazioni_ml');
      expect(ids).not.toContain('spese_mediche');
    });

    it('ambito penale: il placeholder NON cita ITT/ITP/SIMLA (civilistici)', () => {
      const pen = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: { ambitoPenale: true } })
        .find((s) => s.id === 'considerazioni_penale');
      expect(pen?.isPlaceholder).toBe(true);
      // Non deve ISTRUIRE la valutazione del danno biologico (civilistica)
      expect(pen?.placeholderText).not.toMatch(/Valutazione del danno biologico/i);
      expect(pen?.placeholderText).not.toMatch(/tabelle SIMLA per la valutazione/i);
      expect(pen?.placeholderText).toMatch(/colpa|nesso|ragionevole dubbio/i);
    });

    it('civile (default): mantiene considerazioni_ml, niente penale', () => {
      const ids = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: {} }).map((s) => s.id);
      expect(ids).toContain('considerazioni_ml');
      expect(ids).not.toContain('considerazioni_penale');
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

    it('a campi VUOTI genera la bozza AI dai documenti (spec LLM, non placeholder) per RC', () => {
      // Decisione utente 2026-06-29: meglio una bozza editabile dai doc (stile benchmark)
      // che uno scaffold bianco. Il testo del perito, se presente, vince comunque (test sopra).
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        moduleId: RC_MODULE,
        periziaMetadata: { tribunale: 'irrilevante' },
      });
      const anamnesi = plan.find((s) => s.id === 'anamnesi');
      const ilFatto = plan.find((s) => s.id === 'il_fatto_e_storia_clinica');
      expect(anamnesi?.isPlaceholder).toBeFalsy();
      expect(anamnesi?.maxTokens).toBeGreaterThan(0);
      expect(anamnesi?.dataSources).toContain('events-medical');
      expect(ilFatto?.isPlaceholder).toBeFalsy();
      expect(ilFatto?.maxTokens).toBeGreaterThan(0);
      expect(ilFatto?.promptDirective).toMatch(/Antoniazzi/);
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
    it('penale-aware: mostra considerazioni_penale e nasconde spese_mediche', () => {
      const civile = getSelectableSections('ctu').map((s) => s.id);
      expect(civile).toContain('considerazioni_ml');
      expect(civile).toContain('spese_mediche');

      const penale = getSelectableSections('ctu', undefined, true).map((s) => s.id);
      expect(penale).toContain('considerazioni_penale');
      expect(penale).not.toContain('considerazioni_ml');
      expect(penale).not.toContain('spese_mediche');
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

  describe('buildDocSanitariaSelectiveSpec', () => {
    const baseSpec = getSectionSpecById('documentazione_sanitaria', 'ctu');

    it('the default doc-sanitaria spec is a deterministic placeholder', () => {
      expect(baseSpec).toBeDefined();
      expect(baseSpec?.isPlaceholder).toBe(true);
    });

    it('enables the LLM and swaps in the selective directive', () => {
      const selective = buildDocSanitariaSelectiveSpec(baseSpec!);
      expect(selective.isPlaceholder).toBe(false);
      expect(selective.needsOcr).toBe(true);
      expect(selective.maxTokens).toBeGreaterThan(0);
      // Selective directive: verbatim quotes for significant findings only.
      expect(selective.promptDirective).toContain('SELETTIVA');
      expect(selective.promptDirective).toContain('«...»');
      expect(selective.promptDirective).toContain('PARAFRASI');
    });

    it('produces a DIFFERENT directive than the integral LLM variant', () => {
      const integral = buildDocSanitariaLlmSpec(baseSpec!);
      const selective = buildDocSanitariaSelectiveSpec(baseSpec!);
      expect(selective.promptDirective).not.toBe(integral.promptDirective);
    });

    it('is a no-op for non-placeholder / non-doc-sanitaria specs', () => {
      const intestazione = getSectionSpecById('intestazione', 'ctu');
      expect(intestazione).toBeDefined();
      expect(buildDocSanitariaSelectiveSpec(intestazione!)).toBe(intestazione);
    });

    it('RC stragiudiziale: directive DEDICATO verbatim, senza inventario né parafrasi; CTU invariato (con inventario)', () => {
      // CTU: direttiva selettiva → elenco analitico (inventario) + parafrasi del routine.
      const ctuSelective = buildDocSanitariaSelectiveSpec(baseSpec!);
      expect(ctuSelective.promptDirective).toContain('ELENCO ANALITICO');
      expect(ctuSelective.promptDirective).toContain('PARAFRASI');
      expect(ctuSelective.promptDirective).not.toContain('RIPRODUZIONE FEDELE');

      // Stragiudiziale RC: directive dedicato → niente inventario, verbatim-first, no parafrasi.
      const stragBase = getSectionSpecById('documentazione_sanitaria', 'stragiudiziale');
      expect(stragBase?.excludeLabTests).toBe(true);
      const stragSelective = buildDocSanitariaSelectiveSpec(stragBase!);
      expect(stragSelective.promptDirective).toContain('RIPRODUZIONE FEDELE');
      expect(stragSelective.promptDirective).toContain('NIENTE ELENCO'); // no inventario...
      expect(stragSelective.promptDirective).not.toContain('ELENCO ANALITICO'); // ...l'inventario CTU non c'è
      expect(stragSelective.promptDirective).toMatch(/NON parafrasare/); // verbatim, no parafrasi
      expect(stragSelective.promptDirective).toContain('SOLO la DIAGNOSI'); // PS condensato
      expect(stragSelective.promptDirective).toContain('NON riprodurli'); // lab esclusi
      expect(stragSelective.promptDirective).toContain('«...»'); // grounding/verifica
      expect(stragSelective.excludeLabTests).toBe(true);
    });
  });

  // ── Benchmark gold 2026-06-10 — P0 alignment ──────────────────────

  describe('benchmark gold 2026-06-10 — P0 alignment', () => {
    const ATTI_DOC_TYPES = ['cartella_clinica', 'memoria_difensiva'];

    it('premesse soppressa quando documentazione_atti è nel piano (atti riprodotti una volta sola)', () => {
      const ids = resolveSectionPlan({
        ...CTU_PARAMS,
        documentTypes: ATTI_DOC_TYPES,
        periziaMetadata: { tribunale: 'Tribunale di Verona' },
      }).map((s) => s.id);
      expect(ids).toContain('documentazione_atti');
      expect(ids).not.toContain('premesse');
    });

    it('premesse attiva quando il perito esclude documentazione_atti dal selettore', () => {
      const ids = resolveSectionPlan({
        ...CTU_PARAMS,
        documentTypes: ATTI_DOC_TYPES,
        periziaMetadata: {
          tribunale: 'Tribunale di Verona',
          excludedReportSections: ['documentazione_atti'],
        },
      }).map((s) => s.id);
      expect(ids).toContain('premesse');
      expect(ids).not.toContain('documentazione_atti');
    });

    it('premesse STANDALONE (doc_atti esclusa): la directive copre anche gli stragiudiziali, niente rinvio a sezione assente', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        documentTypes: ATTI_DOC_TYPES,
        periziaMetadata: {
          tribunale: 'Tribunale di Verona',
          excludedReportSections: ['documentazione_atti'],
        },
      });
      const premesse = plan.find((s) => s.id === 'premesse');
      expect(premesse?.promptDirective).toContain('anche i documenti stragiudiziali');
      expect(premesse?.promptDirective).not.toContain('NON riprodurre qui i documenti stragiudiziali');
    });

    it('premesse: budget LARGE + maxChars, directive verbatim atti processuali con formule intro', () => {
      const premesse = CTU_SECTIONS.find((s) => s.id === 'premesse');
      expect(premesse?.maxTokens).toBe(10_000);
      expect(premesse?.maxChars).toBe(32_000);
      expect(premesse?.promptDirective).toMatch(/VERBATIM/);
      expect(premesse?.promptDirective).toMatch(/redatt[oa] dall'Avv\./);
      expect(premesse?.promptDirective).toMatch(/NON riprodurre qui i documenti stragiudiziali/i);
    });

    it('quesiti: blocco virgolettato unico con numerazione ORIGINALE, vietato rinumerare', () => {
      const quesiti = CTU_SECTIONS.find((s) => s.id === 'quesiti');
      expect(quesiti?.promptDirective).toMatch(/numerazione\/elencazione ORIGINALE/i);
      expect(quesiti?.promptDirective).toMatch(/NON rinumerare/i);
      expect(quesiti?.promptDirective).toMatch(/formula di rito/i);
      expect(quesiti?.promptDirective).not.toMatch(/Numera ciascun quesito progressivamente/);
    });

    it('operazioni_peritali: scheletro-verbale con comparizioni, dichiarazioni a verbale, rubriche visita e firme', () => {
      const op = CTU_SECTIONS.find((s) => s.id === 'operazioni_peritali');
      expect(op?.isPlaceholder).toBe(true);
      const txt = op?.placeholderText ?? '';
      expect(txt).toMatch(/In tale occasione, sono comparsi/);
      expect(txt).toMatch(/chiede che sia scritto a verbale/);
      expect(txt).toMatch(/ANAMNESI PATOLOGICA PROSSIMA/i);
      expect(txt).toMatch(/ESAME OBIETTIVO per distretti/i);
      expect(txt).toMatch(/L'incontro terminava alle ore/);
      expect(txt).toMatch(/FIRME DEL VERBALE/i);
      expect(txt).toMatch(/imperfetto/);
    });

    it('decesso (civile): considerazioni_ml guida su causa morte e danno iure proprio/hereditatis, niente ITT/SIMLA', () => {
      const plan = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: { decesso: true } });
      const cons = plan.find((s) => s.id === 'considerazioni_ml');
      expect(cons?.isPlaceholder).toBe(true);
      const txt = cons?.placeholderText ?? '';
      expect(txt).toMatch(/CAUSA DEL DECESSO/i);
      expect(txt).toMatch(/più probabile che non/);
      expect(txt).toMatch(/iure proprio/i);
      expect(txt).toMatch(/iure hereditatis/i);
      expect(txt).toMatch(/NON si applicano al periziando deceduto/i);
      expect(txt).not.toMatch(/danno biologico temporaneo \(ITT\/ITP\) con date/i);
    });

    it('decesso (civile): operazioni_peritali diventa verbale di riunione tecnica senza visita', () => {
      const plan = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: { decesso: true } });
      const op = plan.find((s) => s.id === 'operazioni_peritali');
      expect(op?.placeholderText).toMatch(/riunione di discussione tecnica/i);
      expect(op?.placeholderText).not.toMatch(/SOGGETTIVAMENTE|VISITA DEL PERIZIANDO/);
    });

    it('penale: operazioni_peritali diventa "I Dati dell\'Incontro Peritale" senza visita', () => {
      const plan = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: { ambitoPenale: true } });
      const op = plan.find((s) => s.id === 'operazioni_peritali');
      expect(op?.title).toBe('I Dati dell\'Incontro Peritale');
      expect(op?.placeholderText).toMatch(/incontro peritale/i);
      expect(op?.placeholderText).toMatch(/per gli imputati/i);
      expect(op?.placeholderText).not.toMatch(/SOGGETTIVAMENTE|VISITA DEL PERIZIANDO/);
    });

    it('penale + decesso: vince il penale (considerazioni_penale + incontro peritale)', () => {
      const plan = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { ambitoPenale: true, decesso: true },
      });
      expect(plan.map((s) => s.id)).toContain('considerazioni_penale');
      expect(plan.map((s) => s.id)).not.toContain('considerazioni_ml');
      const op = plan.find((s) => s.id === 'operazioni_peritali');
      expect(op?.title).toBe('I Dati dell\'Incontro Peritale');
    });

    it('getSectionSpecById applica la variante decesso a considerazioni_ml e operazioni_peritali', () => {
      const cons = getSectionSpecById('considerazioni_ml', 'ctu', undefined, { decesso: true });
      expect(cons?.placeholderText).toMatch(/CAUSA DEL DECESSO/i);
      const op = getSectionSpecById('operazioni_peritali', 'ctu', undefined, { decesso: true });
      expect(op?.placeholderText).toMatch(/riunione di discussione tecnica/i);
    });

    it('senza flag decesso: considerazioni_ml e operazioni_peritali restano le varianti standard', () => {
      const plan = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: {} });
      const cons = plan.find((s) => s.id === 'considerazioni_ml');
      expect(cons?.placeholderText).toMatch(/danno biologico temporaneo \(ITT\/ITP\)/i);
      const op = plan.find((s) => s.id === 'operazioni_peritali');
      expect(op?.placeholderText).toMatch(/VISITA DEL PERIZIANDO/);
    });
  });

  // ── Benchmark gold 2026-06-10 — P1 CTU ────────────────────────────

  describe('benchmark gold 2026-06-10 — P1 CTU', () => {
    it('considerazioni_ml: struttura PER QUESITO con formule peritali, SIMLA 2016 e guida polizza infortuni', () => {
      const cons = CTU_SECTIONS.find((s) => s.id === 'considerazioni_ml');
      const txt = cons?.placeholderText ?? '';
      expect(txt).toMatch(/Venendo a rispondere ai quesiti proposti dal Sig\. Giudice/);
      expect(txt).toMatch(/ri-citato testualmente tra virgolette|ri-citazione testuale/i);
      expect(txt).toMatch(/SIMLA, Linee Guida per la valutazione del danno alla persona in ambito civilistico/);
      expect(txt).toMatch(/omnicomprensiva/i);
      expect(txt).toMatch(/polizza infortuni privata/i);
      expect(txt).toMatch(/conseguenze dirette ed esclusive/i);
      expect(txt).toMatch(/Il testo di cui sopra viene inviato alle parti/);
    });

    it('considerazioni_penale: sinossi clinico-documentale, risposta per-quesito alla Corte, diagnosi differenziale eziologica', () => {
      const plan = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: { ambitoPenale: true } });
      const pen = plan.find((s) => s.id === 'considerazioni_penale');
      const txt = pen?.placeholderText ?? '';
      expect(txt).toMatch(/Breve sinossi clinico-documentale/i);
      expect(txt).toMatch(/Ecc\.ma Corte|Sig\. Magistrato/);
      expect(txt).toMatch(/diagnosi differenziale eziologica/i);
      expect(txt).toMatch(/elevatissima probabilità/);
      expect(txt).toMatch(/controfattuale/i);
    });

    it('conciliazione attivata anche dal QUESITO "tenti la conciliazione" (causa ordinaria)', () => {
      const ids = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: {
          tipoProcedimento: 'Causa civile ordinaria',
          quesiti: ['Accerti il CTU le lesioni e tenti la conciliazione delle parti.'],
        },
      }).map((s) => s.id);
      expect(ids).toContain('conciliazione_ante_bozza');
      expect(ids).toContain('conciliazione_post_bozza');
    });

    it('conciliazione: i placeholder hanno le formule peritali e non dichiarano più "solo ATP 696-bis"', () => {
      const ante = CTU_SECTIONS.find((s) => s.id === 'conciliazione_ante_bozza');
      const post = CTU_SECTIONS.find((s) => s.id === 'conciliazione_post_bozza');
      expect(ante?.placeholderText).toMatch(/primo tentativo di soluzione conciliativa/i);
      expect(ante?.placeholderText).not.toMatch(/solo per procedimenti ATP/i);
      expect(post?.placeholderText).toMatch(/Non essendo stato possibile addivenire ad una soluzione bonaria/);
    });

    it('pareri_tecnici: riproduzione INTEGRALE con struttura a campi dei fiduciari, budget HUGE', () => {
      const pareri = CTU_SECTIONS.find((s) => s.id === 'pareri_tecnici');
      expect(pareri?.maxTokens).toBe(20_000);
      expect(pareri?.maxChars).toBe(60_000);
      expect(pareri?.promptDirective).toMatch(/INTEGRALMENTE/);
      expect(pareri?.promptDirective).toMatch(/fiduciari/i);
      expect(pareri?.promptDirective).toMatch(/clausole di polizza/i);
    });

    it('osservazioni_bozza: iter completo invio → osservazioni integrali → Risposta del C.T.U. → deposito', () => {
      const oss = CTU_SECTIONS.find((s) => s.id === 'osservazioni_bozza');
      const txt = oss?.placeholderText ?? '';
      expect(txt).toMatch(/si inviavano le bozze di CTU alle Parti/);
      expect(txt).toMatch(/INTEGRALMENTE/i);
      expect(txt).toMatch(/Risposta del C\.T\.U\./);
      expect(txt).toMatch(/si procede al deposito dell'elaborato tecnico/);
    });

    it('documentazione_atti: inventario per parte + formule intro + documentazione amministrativa', () => {
      const atti = CTU_SECTIONS.find((s) => s.id === 'documentazione_atti');
      const d = atti?.promptDirective ?? '';
      expect(d).toMatch(/economia espositiva/i);
      expect(d).toMatch(/raggruppat[oi] per parte/i);
      expect(d).toMatch(/Dichiarazione testimoniale resa da/);
      expect(d).toMatch(/amministrativa/i);
    });

    it('ordine sezioni: spese_mediche DOPO pareri_tecnici (doc sanitaria → pareri → spese)', () => {
      const ids = CTU_SECTIONS.map((s) => s.id);
      expect(ids.indexOf('spese_mediche')).toBeGreaterThan(ids.indexOf('pareri_tecnici'));
      expect(ids.indexOf('pareri_tecnici')).toBeGreaterThan(ids.indexOf('documentazione_sanitaria'));
    });

    it('nuova sezione profilo_metodologico (placeholder deterministico) subito dopo i quesiti', () => {
      const ids = CTU_SECTIONS.map((s) => s.id);
      expect(ids.indexOf('profilo_metodologico')).toBe(ids.indexOf('quesiti') + 1);
      const pm = CTU_SECTIONS.find((s) => s.id === 'profilo_metodologico');
      expect(pm?.isPlaceholder).toBe(true);
      expect(pm?.placeholderText).toMatch(/comparata disamina dei dati/);
    });

    it('nuova sezione accertamento_ausiliario: solo quando è nominato un ausiliario', () => {
      const withAus = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { collaboratoreName: 'Dr. Aldo Fittizio' },
      }).map((s) => s.id);
      expect(withAus).toContain('accertamento_ausiliario');

      const without = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: {} }).map((s) => s.id);
      expect(without).not.toContain('accertamento_ausiliario');

      const spec = CTU_SECTIONS.find((s) => s.id === 'accertamento_ausiliario');
      expect(spec?.placeholderText).toMatch(/seguiva l'accertamento di natura/);
    });

    it('nuova sezione preventivi_spese_ml: solo quando sono nominati CC.TT.P.', () => {
      const withCtp = resolveSectionPlan({
        ...CTU_PARAMS,
        periziaMetadata: { ctpRicorrente: 'Dott.ssa Bianca Fittizia' },
      }).map((s) => s.id);
      expect(withCtp).toContain('preventivi_spese_ml');

      const without = resolveSectionPlan({ ...CTU_PARAMS, periziaMetadata: {} }).map((s) => s.id);
      expect(without).not.toContain('preventivi_spese_ml');

      const spec = CTU_SECTIONS.find((s) => s.id === 'preventivi_spese_ml');
      expect(spec?.placeholderText).toMatch(/proforme di fattura/i);
    });

    it('spese_mediche: il placeholder guida la valutazione per categorie di congruità', () => {
      const spese = CTU_SECTIONS.find((s) => s.id === 'spese_mediche');
      const txt = spese?.placeholderText ?? '';
      expect(txt).toMatch(/pertinenti e congrue/i);
      expect(txt).toMatch(/si rimettono alla discrezione del Sig\. Giudice/);
    });
  });
});
