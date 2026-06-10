import { createHash } from 'crypto';
import { buildSectionSystemPrompt, buildHeaderSystemPrompt } from '@/services/synthesis/section-generator';
import type { SectionSpec } from '@/services/synthesis/section-generation-types';
import type { CaseType, CaseRole } from '@/types';

/**
 * Compute the prompt-version hash for sectional generation mode (ADR-011).
 *
 * Sprint 2.3: the hash is computed from the REAL prompt material of the
 * RESOLVED section plan — not from empty stub specs. Per section:
 *  - LLM sections → the full system prompt actually sent to the model
 *    (constitutional preamble, role directive, ABSOLUTE_RULES, the section's
 *    promptDirective from section-catalog);
 *  - intestazione* → the JSON-mode header system prompt (schema description +
 *    negative few-shot), which is what those sections really use;
 *  - placeholder sections → their placeholderText (the emitted template) plus
 *    the dormant promptDirective (used by on-demand AI variants).
 *
 * Any change to section-catalog directives, section-placeholders texts,
 * role-prompts or peritale-formulations therefore changes the hash saved in
 * generation_metadata.promptVersion — prompt drift is detectable per report.
 * Field shape is unchanged: 12-char SHA-256 hex prefix.
 */
export function computeSectionalPromptVersion(params: {
  caseType: CaseType;
  caseRole: CaseRole;
  caseTypes?: CaseType[];
  /** Resolved SectionSpec[] of the sections actually generated (plan order). */
  sections: SectionSpec[];
}): string {
  const { caseType, caseRole, caseTypes, sections } = params;

  const promptParts = sections.map((spec) => {
    if (spec.isPlaceholder) {
      // Placeholder sections never call the LLM: their "prompt" IS the emitted
      // template. Include the dormant promptDirective too (doc-sanitaria keeps
      // it for the on-demand AI variants).
      return `placeholder:${spec.id}\n${spec.placeholderText ?? ''}\n${spec.promptDirective}`;
    }
    if (spec.id.startsWith('intestazione')) {
      // Header sections use the JSON-mode pipeline, not buildSectionSystemPrompt.
      return `header:${spec.id}\n${buildHeaderSystemPrompt()}`;
    }
    return buildSectionSystemPrompt({
      spec,
      caseRole,
      caseType,
      caseTypes,
      hasOcrText: spec.needsOcr,
    });
  });

  const combined = promptParts.join('\n---\n');
  const hash = createHash('sha256').update(combined).digest('hex');
  return hash.slice(0, 12);
}
