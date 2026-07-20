import { describe, it, expect } from 'vitest';
import { resolveSectionPlan, evaluateCondition, getAllSectionIds, getSelectableSections, MANDATORY_SECTION_IDS, STRAGIUDIZIALE_SECTIONS, getSectionSpecById, buildDocSanitariaLlmSpec, buildDocSanitariaSelectiveSpec } from './section-catalog';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { CaseType } from '@/types';

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

const STRAGIUDIZIALE_PARAMS = {
  caseType: 'ortopedica' as CaseType,
  caseRole: 'stragiudiziale' as const,
  events: [makeEvent()],
  documentTypes: ['cartella_clinica'],
};

describe('section-catalog', () => {
  // ── evaluateCondition ─────────────────────────────────────────────

  describe('evaluateCondition', () => {
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

    it('has-ausiliario: true solo quando è nominato un ausiliario nei metadati', () => {
      expect(evaluateCondition('has-ausiliario', {
        events: [],
        documentTypes: [],
        periziaMetadata: { collaboratoreName: 'Dr. Aldo Fittizio' },
      })).toBe(true);

      expect(evaluateCondition('has-ausiliario', {
        events: [],
        documentTypes: [],
        periziaMetadata: {},
      })).toBe(false);

      expect(evaluateCondition('has-ausiliario', {
        events: [],
        documentTypes: [],
      })).toBe(false);
    });
  });

  // ── Stragiudiziale section array ──────────────────────────────────

  describe('stragiudiziale section catalog', () => {
    it('should have 7 stragiudiziale sections (allineato benchmark Antoniazzi)', () => {
      expect(STRAGIUDIZIALE_SECTIONS).toHaveLength(7);
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).toContain('il_fatto_e_storia_clinica');
    });

    it("l'Epicrisi stragiudiziale NON usa il dataSource 'calculations' (no ITT graduata auto-inventata)", () => {
      // Bug misurato (Antoniazzi v2): l'Epicrisi emetteva "ITT 57/57/58 [stima non supportata]"
      // perché formatCalculationsForPrompt iniettava la tabella ITT graduata PROPOSTA. Contraddice
      // C4 ("ITT graduata = scaffold del perito") e la direttiva Epicrisi. I fatti ricovero+durata
      // arrivano dal marker deterministico ITT_RICOVERO_FACTS, non da 'calculations'.
      const epicrisi = STRAGIUDIZIALE_SECTIONS.find((s) => s.id === 'epicrisi');
      expect(epicrisi?.dataSources).not.toContain('calculations');
    });

    it('should have placeholder sections with isPlaceholder=true and maxTokens=0', () => {
      const placeholders = STRAGIUDIZIALE_SECTIONS.filter((s) => s.isPlaceholder);
      // documentazione_sanitaria (verbatim deterministico), visita_clinica, spese_mediche
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
      for (const p of placeholders) {
        expect(p.maxTokens).toBe(0);
        expect(p.placeholderText).toBeTruthy();
        expect(p.dataSources).toEqual([]);
      }
    });

    it('should not contain specialty sections (analisi_intervento, complicanze, etc.)', () => {
      const allIds = STRAGIUDIZIALE_SECTIONS.map((s) => s.id);
      expect(allIds).not.toContain('analisi_intervento');
      expect(allIds).not.toContain('complicanze');
      expect(allIds).not.toContain('danno_biologico');
      expect(allIds).not.toContain('nesso_causale');
      expect(allIds).not.toContain('timeline_diagnostica');
    });

    it('should not contain elementi_rilievo or riassunto (old section names)', () => {
      const allIds = STRAGIUDIZIALE_SECTIONS.map((s) => s.id);
      expect(allIds).not.toContain('elementi_rilievo');
      expect(allIds).not.toContain('riassunto');
    });

    it('should contain epicrisi as the concluding section', () => {
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).toContain('epicrisi');
    });

    it('should not contain removed sections after benchmark alignment', () => {
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).not.toContain('il_fatto');
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).not.toContain('fatto_storia_clinica');
      expect(STRAGIUDIZIALE_SECTIONS.map((s) => s.id)).not.toContain('conclusioni');
    });

    it('should not have [Ev.N] references in any promptDirective', () => {
      for (const s of STRAGIUDIZIALE_SECTIONS) {
        expect(s.promptDirective).not.toMatch(/\[Ev\.N\]/);
        expect(s.promptDirective).not.toMatch(/\[Ev\.\d+\]/);
      }
    });

    it('documentazione_sanitaria must instruct VERBATIM reproduction (no synthesis of source content)', () => {
      // Regression: benchmark scuola veronese (Lavini 2026-06-01) → la documentazione
      // va TRASCRITTA fedelmente, non riassunta. Vietato re-introdurre la sintesi del
      // contenuto-fonte (verbali operatori, lettere di dimissione).
      const docSan = STRAGIUDIZIALE_SECTIONS.filter((s) => s.id === 'documentazione_sanitaria');
      expect(docSan.length).toBeGreaterThanOrEqual(1);
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

    it('intestazione must have anti-fabrication rule and access to events', () => {
      // Regression: case Regnoto → report invented "Mario Bianchi", "Dott. Marco Rossi",
      // wrong fracture, wrong hospital, fake CF. Root cause: the prompt did not forbid
      // fabrication and the section had no access to events to read the real patient name.
      const spec = STRAGIUDIZIALE_SECTIONS.find((s) => s.id === 'intestazione_stragiudiziale');
      expect(spec).toBeDefined();
      if (!spec) return;

      // Must include explicit anti-fabrication rule
      expect(spec.promptDirective).toMatch(/VIETATO INVENTARE/i);
      expect(spec.promptDirective).toContain('[da compilare dal perito]');

      // Must have access to events so it can read the real patient name from documents
      expect(spec.dataSources).toContain('events-medical');
    });

    it('documentazione_sanitaria must forbid the FATTO/STANDARD/ELEMENTI A SUPPORTO/CONTRARI pattern', () => {
      // Regression: this interpretive pattern leaked into the chronology and produced
      // a biased narrative. It must be confined to dedicated anomaly/considerazioni sections.
      const docSan = STRAGIUDIZIALE_SECTIONS.filter((s) => s.id === 'documentazione_sanitaria');

      expect(docSan.length).toBeGreaterThan(0);
      for (const spec of docSan) {
        expect(spec.promptDirective).toMatch(/VIETATO il pattern/i);
        expect(spec.promptDirective).toMatch(/FATTO DOCUMENTATO.*STANDARD DI RIFERIMENTO/i);
      }
    });
  });

  // ── resolveSectionPlan ────────────────────────────────────────────

  describe('resolveSectionPlan', () => {
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

    // Feedback beta 2026-07-20: "sarebbe utile che il perito scegliesse l'ordine
    // dei capitoli" (es. documentazione valutata prima degli accertamenti clinici).
    describe('sectionOrder (ordine capitoli del perito)', () => {
      it('rispetta l\'ordine richiesto: documentazione_sanitaria prima di anamnesi', () => {
        const plan = resolveSectionPlan({
          ...STRAGIUDIZIALE_PARAMS,
          periziaMetadata: {
            sectionOrder: [
              'intestazione_stragiudiziale',
              'documentazione_sanitaria',
              'anamnesi',
              'il_fatto_e_storia_clinica',
              'visita_clinica',
              'spese_mediche',
              'epicrisi',
            ],
          },
        });
        const ids = plan.map((s) => s.id);
        expect(ids.indexOf('documentazione_sanitaria')).toBeLessThan(ids.indexOf('anamnesi'));
        expect(ids.indexOf('documentazione_sanitaria')).toBeLessThan(ids.indexOf('visita_clinica'));
      });

      it('intestazione SEMPRE prima ed epicrisi SEMPRE ultima, anche se l\'ordine prova a spostarle', () => {
        const plan = resolveSectionPlan({
          ...STRAGIUDIZIALE_PARAMS,
          periziaMetadata: {
            sectionOrder: ['epicrisi', 'documentazione_sanitaria', 'intestazione_stragiudiziale'],
          },
        });
        const ids = plan.map((s) => s.id);
        expect(ids[0]).toBe('intestazione_stragiudiziale');
        expect(ids[ids.length - 1]).toBe('epicrisi');
      });

      it('id sconosciuti ignorati; sezioni non elencate restano in ordine di catalogo dopo quelle elencate', () => {
        const plan = resolveSectionPlan({
          ...STRAGIUDIZIALE_PARAMS,
          periziaMetadata: {
            sectionOrder: ['sezione_inesistente', 'visita_clinica'],
          },
        });
        const ids = plan.map((s) => s.id);
        expect(ids[0]).toBe('intestazione_stragiudiziale');
        expect(ids[ids.length - 1]).toBe('epicrisi');
        // visita_clinica (elencata) viene prima delle non-elencate (anamnesi, fatto...)
        expect(ids.indexOf('visita_clinica')).toBeLessThan(ids.indexOf('anamnesi'));
        // le non-elencate mantengono l'ordine relativo di catalogo
        expect(ids.indexOf('anamnesi')).toBeLessThan(ids.indexOf('il_fatto_e_storia_clinica'));
        expect(ids).not.toContain('sezione_inesistente');
      });

      it('senza sectionOrder l\'ordine di catalogo resta invariato (regressione)', () => {
        const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
        const ids = plan.map((s) => s.id);
        expect(ids.indexOf('anamnesi')).toBeLessThan(ids.indexOf('documentazione_sanitaria'));
      });
    });

    it('should include spese_mediche when expense events exist', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        events: [makeEvent({ eventType: 'spesa_medica' })],
      });
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('spese_mediche');
    });

    it('should ALWAYS include spese_mediche, anche senza spese (stato vuoto onesto)', () => {
      // 2026-07-14 (CASO-2026-219): la sezione non è più condizionata — se non
      // ci sono spese mostra "nessuna spesa documentata", non sparisce.
      const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
      const ids = plan.map((s) => s.id);
      expect(ids).toContain('spese_mediche');
    });

    it('spese_mediche is a DETERMINISTIC placeholder (sentinel, no LLM) so every expense is included by construction', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        events: [makeEvent({ eventType: 'spesa_medica' })],
      });
      const spese = plan.find((s) => s.id === 'spese_mediche');
      expect(spese?.isPlaceholder).toBe(true);
      expect(spese?.placeholderText).toContain('<!--MEDLAV:SPESE-->');
    });

    it('documentazione_sanitaria: default SELETTIVA (decisione medici 2026-06-12) — narrativa con citazioni verbatim verificate', () => {
      const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
      const docSan = plan.find((s) => s.id === 'documentazione_sanitaria');
      expect(docSan?.isPlaceholder).toBe(false);
      expect(docSan?.needsOcr).toBe(true);
      expect(docSan?.promptDirective).toBeTruthy();
    });

    it('documentazione_sanitaria: docSanitariaMode integrale → placeholder deterministico verbatim', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        periziaMetadata: { docSanitariaMode: 'integrale' },
      });
      const docSan = plan.find((s) => s.id === 'documentazione_sanitaria');
      expect(docSan?.isPlaceholder).toBe(true);
      expect(docSan?.needsOcr).toBe(false);
      expect(docSan?.placeholderText).toContain('MEDLAV:DOC_SANITARIA');
    });

    it('should have needsOcr=false for epicrisi (stragiudiziale)', () => {
      const plan = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
      const epicrisi = plan.find((s) => s.id === 'epicrisi');
      expect(epicrisi?.needsOcr).toBe(false);
    });

    it('should handle all case types without errors', () => {
      const caseTypes: CaseType[] = [
        'ortopedica', 'oncologica', 'ostetrica', 'anestesiologica',
        'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto', 'generica',
      ];

      for (const ct of caseTypes) {
        const plan = resolveSectionPlan({
          ...STRAGIUDIZIALE_PARAMS,
          caseType: ct,
        });
        expect(plan.length).toBeGreaterThanOrEqual(3);
        expect(plan.map((s) => s.id)).toContain('documentazione_sanitaria');
      }
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
        periziaMetadata: { patientFullName: 'Mario Esempi' },
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
  });

  // ── getAllSectionIds ──────────────────────────────────────────────

  describe('getAllSectionIds', () => {
    it('should return the stragiudiziale section IDs', () => {
      const ids = getAllSectionIds();
      expect(ids).toContain('intestazione_stragiudiziale');
      expect(ids).toContain('anamnesi');
      expect(ids).toContain('il_fatto_e_storia_clinica');
      expect(ids).toContain('epicrisi');
      expect(ids).not.toContain('quesiti');
      expect(ids).not.toContain('conclusioni_quesiti');
      expect(ids).not.toContain('conclusioni');
    });
  });

  // ── Post-audit invariants for A2/A3 ──

  describe('A3 — placeholder sections are never empty', () => {
    it('every placeholder has >=5 words so the empty-section check never false-blocks', () => {
      for (const s of STRAGIUDIZIALE_SECTIONS.filter((x) => x.isPlaceholder)) {
        const words = (s.placeholderText ?? '').split(/\s+/).filter((w) => w.length > 0).length;
        expect(words, `placeholder "${s.id}" too short`).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('A2 — ITT/ITP table injected at most once', () => {
    it('stragiudiziale: no LLM section carries calculations (i fatti arrivano dal marker deterministico)', () => {
      const llmCalcSections = STRAGIUDIZIALE_SECTIONS
        .filter((s) => !s.isPlaceholder && s.dataSources.includes('calculations'))
        .map((s) => s.id);
      expect(llmCalcSections).toHaveLength(0);
    });
  });

  // ── Selettore "Sezioni del report" ──────────────────────────────────

  describe('getSelectableSections', () => {
    it('flags intestazione_stragiudiziale + epicrisi as mandatory, documentazione optional', () => {
      const sections = getSelectableSections();
      expect(sections.find((s) => s.id === 'intestazione_stragiudiziale')?.mandatory).toBe(true);
      expect(sections.find((s) => s.id === 'epicrisi')?.mandatory).toBe(true);
      expect(sections.find((s) => s.id === 'documentazione_sanitaria')?.mandatory).toBe(false);
    });
    it('every section title is non-empty', () => {
      for (const s of getSelectableSections()) expect(s.title.length).toBeGreaterThan(0);
    });
  });

  describe('resolveSectionPlan — excludedReportSections (selettore)', () => {
    it('removes an optional section the perito excluded', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        periziaMetadata: { excludedReportSections: ['documentazione_sanitaria'] },
      });
      expect(plan.find((s) => s.id === 'documentazione_sanitaria')).toBeUndefined();
    });

    it('NEVER removes a mandatory section even if listed in the exclusion', () => {
      const plan = resolveSectionPlan({
        ...STRAGIUDIZIALE_PARAMS,
        periziaMetadata: { excludedReportSections: ['intestazione_stragiudiziale', 'epicrisi'] },
      });
      expect(plan.find((s) => s.id === 'intestazione_stragiudiziale')).toBeDefined();
      expect(plan.find((s) => s.id === 'epicrisi')).toBeDefined();
    });

    it('keeps all sections when the exclusion list is empty (backward compatible)', () => {
      const withEmpty = resolveSectionPlan({ ...STRAGIUDIZIALE_PARAMS, periziaMetadata: { excludedReportSections: [] } });
      const without = resolveSectionPlan(STRAGIUDIZIALE_PARAMS);
      expect(withEmpty.map((s) => s.id)).toEqual(without.map((s) => s.id));
    });

    it('every mandatory id is a real section id in the catalog', () => {
      const allIds = new Set(getAllSectionIds());
      for (const id of MANDATORY_SECTION_IDS) {
        expect(allIds.has(id)).toBe(true);
      }
    });
  });

  describe('buildDocSanitariaSelectiveSpec', () => {
    const baseSpec = getSectionSpecById('documentazione_sanitaria');

    it('the default doc-sanitaria spec is a deterministic placeholder', () => {
      expect(baseSpec).toBeDefined();
      expect(baseSpec?.isPlaceholder).toBe(true);
    });

    it('enables the LLM and swaps in the selective directive', () => {
      const selective = buildDocSanitariaSelectiveSpec(baseSpec!);
      expect(selective.isPlaceholder).toBe(false);
      expect(selective.needsOcr).toBe(true);
      expect(selective.maxTokens).toBeGreaterThan(0);
      // Verbatim citations delimited by «...» so they can be hard-verified vs OCR.
      expect(selective.promptDirective).toContain('«...»');
    });

    it('produces a DIFFERENT directive than the integral LLM variant', () => {
      const integral = buildDocSanitariaLlmSpec(baseSpec!);
      const selective = buildDocSanitariaSelectiveSpec(baseSpec!);
      expect(selective.promptDirective).not.toBe(integral.promptDirective);
    });

    it('is a no-op for non-placeholder / non-doc-sanitaria specs', () => {
      const intestazione = getSectionSpecById('intestazione_stragiudiziale');
      expect(intestazione).toBeDefined();
      expect(buildDocSanitariaSelectiveSpec(intestazione!)).toBe(intestazione);
    });

    it('RC stragiudiziale: directive TRASCRIZIONE FEDELE (feedback beta 2026-07-20: verbatim-first, PS integrale)', () => {
      // Trascrizione (decisione founder 2026-07-20, su feedback Del Balzo): un
      // blocco per documento con riproduzione verbatim sostanzialmente integrale,
      // niente inventario, niente narrazione/parafrasi sopra il testo del medico,
      // PS trascritto integralmente (non più condensato), refusi conservati,
      // categorie escluse (lab, log-terapia, diario infermieristico, scale...).
      const stragBase = getSectionSpecById('documentazione_sanitaria');
      expect(stragBase?.excludeLabTests).toBe(true);
      const stragSelective = buildDocSanitariaSelectiveSpec(stragBase!);
      expect(stragSelective.promptDirective).toContain('TRASCRIZIONE FEDELE');
      expect(stragSelective.promptDirective).toContain('UN SOLO blocco'); // 1 blocco/documento
      expect(stragSelective.promptDirective).toContain('SOSTANZIALMENTE INTEGRALE'); // trascrizione, non distillazione
      expect(stragSelective.promptDirective).toContain('NIENTE ELENCO'); // no inventario...
      expect(stragSelective.promptDirective).not.toContain('ELENCO ANALITICO'); // ...l'inventario CTU non c'è
      expect(stragSelective.promptDirective).toContain('VIETATA la narrazione o parafrasi'); // la critica #1 della beta
      expect(stragSelective.promptDirective).toContain('si trascrive INTEGRALMENTE'); // PS integrale (non condensato)
      expect(stragSelective.promptDirective).not.toContain('SOLO la DIAGNOSI'); // il PS condensato è superato
      expect(stragSelective.promptDirective).toContain('NON CORREGGERE I REFUSI'); // fedeltà char-per-char
      expect(stragSelective.promptDirective).toContain('NON riprodurli'); // lab esclusi
      expect(stragSelective.promptDirective).toContain('diario/consegne infermieristiche'); // categorie policy nel prompt
      expect(stragSelective.promptDirective).toContain('«...»'); // grounding/verifica
      expect(stragSelective.excludeLabTests).toBe(true);
    });
  });
});
