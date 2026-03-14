import { MISTRAL_MODELS, streamMistralChat, TIMEOUT_EXTRACTION, DETERMINISTIC_SEED } from '@/lib/mistral/client';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import { formatRoleDirectiveForPrompt } from './role-prompts';
import { formatCausalNexusForPrompt, getCaseTypeKnowledge, getCombinedCaseTypeKnowledge } from '@/lib/domain-knowledge';
import { parseSynthesisSections, replaceSectionContent } from './section-parser';
import { formatDate } from '@/lib/format';

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
}

/**
 * Regenerate a single section of the report, preserving all other sections.
 * Returns the full updated synthesis text.
 */
export async function regenerateSection(params: RegenerateSectionParams): Promise<string> {
  const {
    sectionId, currentSynthesis, caseType, caseTypes, caseRole,
    events, anomalies, missingDocuments, calculations, userInstruction,
  } = params;

  const sections = parseSynthesisSections(currentSynthesis);
  const targetSection = sections.find((s) => s.id === sectionId);
  const sectionTitle = targetSection?.title ?? sectionId;
  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const knowledge = effectiveTypes.length > 1
    ? getCombinedCaseTypeKnowledge(effectiveTypes)
    : getCaseTypeKnowledge(caseType);

  // Find the section spec from domain knowledge
  const sectionSpec = knowledge.reportSections.find((s) => s.id === sectionId);
  const wordRange = sectionSpec?.wordRange;
  const wordGuidance = wordRange && wordRange.max > 0
    ? `La sezione deve essere di ${wordRange.min}-${wordRange.max} parole.`
    : 'La sezione non ha limiti di parole specifici.';

  const roleDirective = formatRoleDirectiveForPrompt(caseRole);
  const causalNexus = sectionId === 'nesso_causale' ? formatCausalNexusForPrompt() : '';

  const systemPrompt = `Sei un medico legale esperto. Devi RIGENERARE SOLO la sezione "${sectionTitle}" di un report peritale.

${roleDirective}

## ISTRUZIONI SPECIFICHE
- Genera ESCLUSIVAMENTE la sezione richiesta: "${sectionTitle}"
- ${wordGuidance}
- ${sectionSpec?.description ?? 'Segui le linee guida standard per questa sezione.'}
- NON generare altre sezioni del report
- NON includere heading ## — verrà aggiunto automaticamente
${causalNexus ? `\n## CRITERI NESSO CAUSALE\n${causalNexus}` : ''}`;

  // Build context from events (abbreviated for single-section regen)
  const eventsContext = events.length > 30
    ? events.slice(0, 30).map((e) =>
      `${formatDate(e.eventDate)} | ${e.eventType}: ${e.title} — ${e.description.slice(0, 200)}`,
    ).join('\n') + `\n... (${events.length - 30} altri eventi)`
    : events.map((e) =>
      `${formatDate(e.eventDate)} | ${e.eventType}: ${e.title} — ${e.description.slice(0, 300)}`,
    ).join('\n');

  const anomaliesContext = anomalies.length > 0
    ? anomalies.map((a) => `- [${a.severity}] ${a.anomalyType}: ${a.description}`).join('\n')
    : 'Nessuna anomalia.';

  const calcsContext = calculations && calculations.length > 0
    ? calculations.map((c) => `- ${c.label}: ${c.value}`).join('\n')
    : '';

  let userPrompt = `REPORT ATTUALE (per contesto):\n\n${currentSynthesis.slice(0, 4000)}${currentSynthesis.length > 4000 ? '\n...(troncato)' : ''}`;
  userPrompt += `\n\n## EVENTI (${events.length} totali)\n${eventsContext}`;
  userPrompt += `\n\n## ANOMALIE\n${anomaliesContext}`;
  if (calcsContext) userPrompt += `\n\n## CALCOLI\n${calcsContext}`;

  if (missingDocuments.length > 0) {
    const missingContext = missingDocuments.map((d) => `- ${d.documentName}: ${d.reason}`).join('\n');
    userPrompt += `\n\n## DOCUMENTAZIONE MANCANTE\n${missingContext}`;
  }

  if (userInstruction) {
    userPrompt += `\n\n## ISTRUZIONE SPECIFICA DELL'UTENTE\n${userInstruction}`;
  }

  userPrompt += `\n\n---\nGenera ORA la sezione "${sectionTitle}". Solo il contenuto, senza heading ##.`;

  const newContent = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    maxTokens: 4096,
    timeoutMs: TIMEOUT_EXTRACTION,
    randomSeed: DETERMINISTIC_SEED,
    label: `regen-section:${sectionId}`,
  });

  return replaceSectionContent(currentSynthesis, sectionId, newContent);
}
