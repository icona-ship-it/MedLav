import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';

/**
 * Data source types that a section can require.
 * Used by section-generator to determine what data to include in the prompt.
 */
export type SectionDataSource =
  | 'events'              // all consolidated events
  | 'events-non-medical'  // only non-medical events (doc_amministrativo, certificato)
  | 'events-medical'      // only medical events
  | 'events-expenses'     // only spesa_medica events
  | 'events-perizie'      // only perizia/parere events
  | 'anomalies'           // detected anomalies
  | 'missing-docs'        // missing document warnings
  | 'calculations'        // medico-legal calculations (ITT/ITP)
  | 'image-analysis'      // diagnostic image analysis results
  | 'perizia-metadata'    // perizia form data (tribunal, quesiti, etc.)
  | 'context-summaries'   // context summaries from previous sections
  | 'guidelines';         // RAG guidelines

/**
 * Specification for a single report section.
 * Defines what to generate and how.
 */
export interface SectionSpec {
  /** Canonical section ID (e.g., 'documentazione_sanitaria', 'conclusioni') */
  id: string;
  /** Section title for ## heading */
  title: string;
  /** Max tokens for LLM output */
  maxTokens: number;
  /** What data this section needs */
  dataSources: SectionDataSource[];
  /** Max chars for context summary passed to subsequent sections */
  contextMaxChars: number;
  /** Whether this section needs to fetch OCR text from DB */
  needsOcr: boolean;
  /**
   * Se true, le citazioni verbatim della sezione (incl. virgolette dritte "...")
   * vengono hard-verificate contro l'OCR sorgente e quelle non riscontrate sono
   * annotate inline "[citazione da verificare]". Per le sezioni che riproducono
   * VERBATIM atti/pareri (documentazione_atti, premesse, pareri_tecnici). La
   * documentazione_sanitaria selettiva ha il suo gate dedicato («...»).
   */
  verifyQuotes?: boolean;
  /**
   * Se true, gli esami EMATOCHIMICI / di laboratorio (eventType 'esame_ematochimico',
   * documentType 'esame_laboratorio') sono ESCLUSI dalla riproduzione: né nell'OCR
   * inviato all'LLM, né tra gli eventi del prompt, né nel controllo anti-omissione.
   * Direttiva del perito Lavini per la perizia RC stragiudiziale ("PERIZIA SEMPLICE":
   * i pannelli di laboratorio sono rumore; togliendoli si elimina anche il phantom_date
   * che gonfiava l'HRS). Impostato sulla documentazione_sanitaria stragiudiziale.
   */
  excludeLabTests?: boolean;
  /** Condition for inclusion (undefined = always included) */
  condition?: SectionCondition;
  /** Section-specific prompt instructions */
  promptDirective: string;
  /** If true, emit placeholderText instead of calling LLM */
  isPlaceholder?: boolean;
  /** Static text to emit for placeholder sections (no LLM call) */
  placeholderText?: string;
  /**
   * Sprint 1 S1.1 (Lavini quality, 2026-05-17): hard cap on generated content
   * length (in chars). If LLM output exceeds this, the section-generator
   * intelligently truncates at the nearest paragraph boundary and flags
   * `truncatedByCap: true` in metadata. Distinct from `maxTokens` which is
   * an INPUT-side budget to Mistral. This is an OUTPUT-side safety net for
   * sections that tend to ramble (documentazione_sanitaria).
   */
  maxChars?: number;
}

/**
 * Condition types for conditional section inclusion.
 */
export type SectionCondition =
  | 'has-non-medical-docs'
  | 'has-legal-docs'
  | 'has-expense-events'
  | 'has-perizie-docs'
  | 'has-ausiliario';

/**
 * Output of generating a single section.
 */
export interface GeneratedSection {
  /** Section spec ID */
  id: string;
  /** Section title */
  title: string;
  /** Generated markdown content (without ## heading) */
  content: string;
  /**
   * Affidabilità (2026-07-04): per le sezioni voluminose (doc-sanitaria
   * batched) il contenuto vive su Supabase Storage e qui viaggia solo il
   * puntatore — lo stato Inngest resta O(1) rispetto alla dimensione del
   * fascicolo (il body Vercel ha un tetto di ~4,5MB). Quando presente e
   * content è vuoto, assembleSectionsAndSaveReport risolve dal path.
   */
  contentPath?: string;
  /** Compressed summary for passing to subsequent sections */
  contextSummary: string;
  /** Word count of generated content */
  wordCount: number;
  /** Token usage from LLM call */
  usage?: TokenUsage;
  /**
   * Doc-sanitaria: citazioni «...» NON riscontrate esattamente nell'OCR
   * (cap 12, troncate a ~160 char). Alimentano il warning "fedeltà citazioni"
   * del pannello "Da controllare" — prima il conteggio restava solo nei log
   * server e le divergenze arrivavano al documento in silenzio (beta 2026-07-20).
   */
  ungroundedQuotes?: string[];
  /** Totale citazioni «...» esaminate dal verificatore (per il rapporto N/tot). */
  quoteTotal?: number;
  /**
   * Doc-sanitaria selettiva/trascrizione: eventi T1 NON riscontrati nel testo
   * (rete anti-omissione) e totale verificati. Nella perizia RC il segnale va
   * al pannello "Da controllare", non nel testo depositabile (gate gold 2026-09-04).
   */
  coverageMissing?: number;
  coverageT1?: number;
  /** Sezioni narrative: date DD.MM.AAAA nel testo NON attestate da eventi/metadati (pannello "Da controllare"). */
  unattestedDates?: string[];
  /**
   * Doc-sanitaria: citazioni AGGANCIATE alla fonte (quote snapping) — riscritte
   * deterministicamente col testo esatto dell'OCR perché il modello le aveva
   * ricomposte con piccole divergenze (parole rimescolate, refusi introdotti).
   */
  quotesSnapped?: number;
  /** True when Chain-of-Verification post-processing was applied to this section. */
  coveApplied?: boolean;
  /** Number of verification questions generated, if CoVe was applied. */
  coveQuestionCount?: number;
  /** Number of facts the verifier flagged as unsupported by sources. */
  coveUnsupportedCount?: number;
  /** True when CoVe revisor actually changed the draft text. */
  coveRevised?: boolean;
  /**
   * True when CoVe was eligible for this section but its LLM phases failed
   * (network/parse/truncation). The draft was kept as-is, but downstream
   * scoring (HRS) should treat the section as unverified.
   */
  coveBypassedDueToLlmFailure?: boolean;
  /** Failure reason when coveBypassedDueToLlmFailure=true. */
  coveFailureReason?: string;
  /**
   * Sprint 1 S1.1: true when output exceeded `spec.maxChars` and was
   * truncated at a paragraph boundary. The medico can see in metadata that
   * the section was cut and may want to regenerate manually.
   */
  truncatedByCap?: boolean;
  /** Original char length before truncation (only set if truncatedByCap). */
  originalCharLength?: number;
  /**
   * Trasparenza fedeltà (sezioni documentali): come è stata alimentata.
   * 'ocr_complete' = OCR integrale (verbatim affidabile);
   * 'ocr_truncated' = output troncato al cap;
   * 'summaries' = riassunti map-reduce (caso voluminoso, NON verbatim integrale).
   * Solo per sezioni needsOcr.
   */
  fidelityMode?: 'ocr_complete' | 'ocr_truncated' | 'summaries';
  /** Numero di documenti riassunti quando fidelityMode='summaries'. */
  fidelitySummaryCount?: number;
}

/**
 * Context from a previously generated section, passed to subsequent sections.
 */
export interface SectionContext {
  id: string;
  title: string;
  contextSummary: string;
}

/**
 * Final result of the sectional pipeline.
 */
export interface SectionPipelineResult {
  /** All generated sections in order */
  sections: GeneratedSection[];
  /** Assembled full report markdown */
  fullReport: string;
  /** Total word count */
  totalWordCount: number;
  /** Combined token usage */
  totalUsage: TokenUsage;
}
