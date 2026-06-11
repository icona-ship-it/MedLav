import type { GeneratedSection } from '@/services/synthesis/section-generation-types';

/**
 * Graceful degradation for section generation (born from the Tedesco live
 * test, 2026-06-11): when ONE section exhausts its retries, the report must
 * NOT die — the other sections complete and the report is saved with this
 * explicit, clearly-technical marker in place of the failed section. The
 * perito regenerates just that section from the editor ("Rigenera sezione")
 * without re-running the whole analysis.
 *
 * Before this, a single failed section aborted the remaining sections, the
 * validator (correctly) refused the near-empty report, and a 30-minute run
 * produced nothing.
 */

export const FAILED_SECTION_MARKER = '⚠ SEZIONE NON GENERATA';

const FAILED_SECTION_BODY = `*[${FAILED_SECTION_MARKER} — un errore tecnico ha interrotto la generazione di questa sezione. Il resto del report è completo e utilizzabile. Per completarla: apri l'editor del report e usa "Rigenera sezione" su questa sezione — non serve ripetere l'analisi dei documenti.]*`;

/** Build the stand-in section for a spec whose generation failed after retries. */
export function buildFailedSectionFallback(spec: { id: string; title: string }): GeneratedSection {
  // intestazione* sections are assembled AS-IS (assembleSectionBlock does not
  // prepend the canonical heading because the template normally carries its
  // own). The fallback must therefore carry the heading itself, or the
  // validator's required-section check blocks the whole report.
  const content = spec.id.startsWith('intestazione')
    ? `## ${spec.title}\n\n${FAILED_SECTION_BODY}`
    : FAILED_SECTION_BODY;
  return {
    id: spec.id,
    title: spec.title,
    content,
    contextSummary: '',
    wordCount: FAILED_SECTION_BODY.split(/\s+/).filter((w) => w.length > 0).length,
    usage: undefined,
  };
}
