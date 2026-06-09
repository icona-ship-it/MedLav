import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { SynthesisParams } from './synthesis-service';
import type { SectionContext } from './section-generation-types';
import {
  getSectionSpecById,
  buildDocSanitariaLlmSpec,
  buildDocSanitariaSelectiveSpec,
} from './section-catalog';
import { generateSingleSection, summarizeForContext } from './section-generator';
import { buildPlaceholderContent } from '@/inngest/steps/generate-report';
import { parseSynthesisSections, replaceSectionContent } from './section-parser';
import { DETERMINISTIC_MARKERS } from '../calculations/deterministic-tables';
import { annotateDocSanitariaQuotes } from '../validation/doc-sanitaria-quote-check';
import { checkSelectiveCoverage } from '../validation/selective-coverage';
import { logger } from '@/lib/logger';

interface RegenerateSectionParams {
  sectionId: string;
  currentSynthesis: string;
  caseType: CaseType;
  caseTypes?: CaseType[];
  caseRole: CaseRole;
  events: ConsolidatedEvent[];
  anomalies: DetectedAnomaly[];
  missingDocuments: MissingDocument[];
  calculations?: MedicoLegalCalculation[];
  userInstruction?: string;
  periziaMetadata?: PeriziaMetadata;
  documentsOcrText?: DocumentOcrContext[];
  /** Module id (parere_pro_veritate / parere_scopo_riserva / RC) for spec resolution. */
  moduleId?: string;
  patientInitials?: string | null;
  /** On-demand "elaborated (AI)" variant of documentazione_sanitaria: re-enable
   * the LLM reproduction (translation / lab tables / grouping) instead of the
   * deterministic verbatim default. */
  elaborated?: boolean;
  /** On-demand "selective (AI)" variant of documentazione_sanitaria: a
   * chronological narrative that quotes significant findings verbatim and
   * paraphrases routine content. Verbatim quotes are hard-verified against the
   * OCR; ungrounded ones are flagged "da verificare". Takes precedence over
   * `elaborated` for documentazione_sanitaria. */
  selective?: boolean;
}

/** Context length (chars) per prior-section summary fed back as rolling context. */
const PREVIOUS_CONTEXT_CHARS = 600;

/**
 * Regenerate a single section of the report, preserving all other sections.
 * Returns the full updated synthesis text.
 *
 * IMPORTANT: this path now delegates to the SAME generation pipeline as the
 * initial report (resolve the canonical SectionSpec from the catalog →
 * generateSingleSection). That guarantees regeneration inherits EVERY defense of
 * the first pass — CONSTITUTIONAL_PREAMBLE, ANTI_FABRICATION_RULE, REFUSAL_RULE,
 * doc-sanitaria neutrality, ABSOLUTE_RULES, and the JSON-mode deterministic
 * routing for `intestazione*` (anti-Regnoto). Previously it used a separate,
 * much weaker system prompt, silently dropping those guards on a routine action.
 */
export async function regenerateSection(params: RegenerateSectionParams): Promise<string> {
  const {
    sectionId, currentSynthesis, caseType, caseTypes, caseRole,
    events, anomalies, missingDocuments, calculations, userInstruction,
    periziaMetadata, documentsOcrText, moduleId, patientInitials,
  } = params;

  // Resolve the CANONICAL spec from the catalog (same source as generation).
  let spec = getSectionSpecById(sectionId, caseRole, moduleId, periziaMetadata);
  if (!spec) {
    throw new Error(`Sezione non riconosciuta per la rigenerazione: ${sectionId}`);
  }

  // AI-on-demand: the perito asked for an LLM variant of documentazione sanitaria
  // (the default is the deterministic verbatim placeholder). Re-enable the LLM spec
  // so it goes through generateSingleSection instead of the placeholder short-circuit.
  // `selective` (quote-verbatim-significant + paraphrase-routine) takes precedence
  // over `elaborated` (integral readable reproduction).
  if (sectionId === 'documentazione_sanitaria') {
    if (params.selective) {
      spec = buildDocSanitariaSelectiveSpec(spec);
    } else if (params.elaborated) {
      spec = buildDocSanitariaLlmSpec(spec);
    } else {
      // #2 (audit 2026-06-09): nessuna variante AI richiesta (es. rigenerazione
      // generica dal pannello "scegli cosa rigenerare"). Se la doc-sanitaria
      // corrente è una variante AI MATERIALIZZATA (niente sentinella deterministica),
      // NON sovrascriverla col placeholder verbatim — sarebbe una perdita silenziosa
      // del lavoro del perito. La si mantiene: per cambiarla serve scegliere
      // esplicitamente una variante (selective/elaborated) o il deterministico.
      const current = parseSynthesisSections(currentSynthesis).find(
        (s) => s.id === 'documentazione_sanitaria',
      );
      const isMaterializedAiVariant =
        !!current &&
        current.content.trim().length > 0 &&
        !current.content.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA);
      if (isMaterializedAiVariant) {
        logger.info('section-regenerator', 'doc-sanitaria materializzata (variante AI): rigenerazione generica ignorata per non sovrascriverla');
        return currentSynthesis;
      }
    }
  }

  // PLACEHOLDER GUARD (mirrors the main pipeline, generate-report.ts): placeholder
  // sections — the medico-legal VALUATIONS (considerazioni, operazioni peritali,
  // visita clinica/esame obiettivo, osservazioni bozza) and the RC deterministic
  // sections written BY THE PERITO (anamnesi, il fatto) — must NEVER be sent to the
  // LLM. The AI must not author or rewrite them (VINCOLO #1: oggettività assoluta).
  // Re-emit the deterministic placeholder content (keeps the ITT/ITP sentinel).
  if (spec.isPlaceholder) {
    return replaceSectionContent(currentSynthesis, sectionId, buildPlaceholderContent(spec));
  }

  // Inject the perito's free-text instruction into the section directive. This
  // keeps ALL the generation defenses (buildSectionSystemPrompt wraps
  // promptDirective with the constitutional preamble + anti-fabrication rules)
  // while honoring the custom request.
  const effectiveSpec = userInstruction
    ? {
      ...spec,
      promptDirective: `${spec.promptDirective}\n\n## ISTRUZIONE SPECIFICA DEL PERITO\n${userInstruction}\n(Rispetta comunque tutti i vincoli sopra: oggettività, nessuna invenzione, citazioni verbatim.)`,
    }
    : spec;

  const synthesisParams: SynthesisParams = {
    caseType,
    caseTypes: caseTypes && caseTypes.length > 1 ? caseTypes : undefined,
    caseRole,
    patientInitials: patientInitials ?? null,
    events,
    anomalies,
    missingDocuments,
    calculations,
    periziaMetadata,
    documentsOcrText,
  };

  // Rolling context: the OTHER sections of the current report, summarized — so a
  // regenerated section stays coherent with what surrounds it.
  const parsed = parseSynthesisSections(currentSynthesis);
  const previousContext: SectionContext[] = parsed
    .filter((s) => s.id !== sectionId && s.content.trim().length > 0)
    .map((s) => ({
      id: s.id,
      title: s.title,
      contextSummary: summarizeForContext(s.content, PREVIOUS_CONTEXT_CHARS),
    }));

  const generated = await generateSingleSection({
    spec: effectiveSpec,
    synthesisParams,
    previousContext,
    documentsOcrText,
  });

  // SELECTIVE doc-sanitaria safety nets: the selective narrative quotes
  // significant findings verbatim and paraphrases routine content. Two guards
  // run before the section is saved (both NON-BLOCKING — they annotate, never
  // discard: mai perdere un fatto):
  //   1. quote hard-check: every «...» must exist verbatim in the OCR, else it
  //      is flagged "da verificare" (a fabricated/distorted citation never
  //      reaches the perito unflagged);
  //   2. omission net: every clinically-significant (T1) event must appear in
  //      the narrative, else a "possibile omissione" banner is prepended.
  let finalContent = generated.content;
  if (params.selective && sectionId === 'documentazione_sanitaria') {
    const checked = annotateDocSanitariaQuotes(finalContent, documentsOcrText);
    finalContent = checked.annotatedMarkdown;

    const coverage = checkSelectiveCoverage(finalContent, events);
    if (coverage.missing.length > 0) {
      finalContent = `${buildOmissionBanner(coverage.missing.length)}\n\n${finalContent}`;
    }

    if (checked.ungroundedCount > 0 || checked.nonGuillemetQuotesDetected || coverage.missing.length > 0) {
      logger.warn('section-regenerator', 'Selective doc-sanitaria: review flags raised', {
        sectionId,
        totalQuotes: checked.total,
        ungroundedCount: checked.ungroundedCount,
        nonGuillemetQuotesDetected: checked.nonGuillemetQuotesDetected,
        t1Missing: coverage.missing.length,
        t1Total: coverage.t1Total,
      });
    }
  }

  return replaceSectionContent(currentSynthesis, sectionId, finalContent);
}

/**
 * Non-blocking banner prepended to the selective documentazione sanitaria when
 * one or more clinically-significant (T1) events are not found in the narrative.
 * Plain inline markdown (no blockquote) so it survives the HTML and DOCX
 * exporters intact — mirroring the convention of UNVERIFIED_QUOTE_MARKER.
 */
function buildOmissionBanner(missingCount: number): string {
  const plural = missingCount === 1 ? 'un evento clinicamente rilevante non risulta' : `${missingCount} eventi clinicamente rilevanti non risultano`;
  return `⚠️ *[Possibile omissione: ${plural} riportati nel testo selettivo. Verificare la documentazione completa prima del deposito.]*`;
}
