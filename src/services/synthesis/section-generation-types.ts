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
  | 'guidelines'          // RAG guidelines
  | 'pubmed-references';  // PubMed scientific references

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
  | 'has-perizia-metadata'
  | 'has-non-medical-docs'
  | 'has-legal-docs'
  | 'has-expense-events'
  | 'has-perizie-docs'
  | 'has-quesiti'
  | 'has-pubmed-references';

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
  /** Compressed summary for passing to subsequent sections */
  contextSummary: string;
  /** Word count of generated content */
  wordCount: number;
  /** Token usage from LLM call */
  usage?: TokenUsage;
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
