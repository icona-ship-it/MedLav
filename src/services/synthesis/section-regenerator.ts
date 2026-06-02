import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { SynthesisParams } from './synthesis-service';
import type { SectionContext } from './section-generation-types';
import { getSectionSpecById } from './section-catalog';
import { generateSingleSection, summarizeForContext } from './section-generator';
import { buildPlaceholderContent } from '@/inngest/steps/generate-report';
import { parseSynthesisSections, replaceSectionContent } from './section-parser';

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
  const spec = getSectionSpecById(sectionId, caseRole, moduleId, periziaMetadata);
  if (!spec) {
    throw new Error(`Sezione non riconosciuta per la rigenerazione: ${sectionId}`);
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

  return replaceSectionContent(currentSynthesis, sectionId, generated.content);
}
