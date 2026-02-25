import { getMistralClient, MISTRAL_MODELS, withMistralRetry } from '@/lib/mistral/client';
import { buildSynthesisSystemPrompt, buildSynthesisUserPrompt } from './synthesis-prompts';
import type { CaseType } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';

interface SynthesisResult {
  synthesis: string;
  wordCount: number;
}

/**
 * Generate the medico-legal synthesis using Mistral Large.
 * Produces a structured 900-1300 word report with 4 mandatory sections.
 */
export async function generateSynthesis(params: {
  caseType: CaseType;
  caseRole: string;
  patientInitials: string | null;
  events: ConsolidatedEvent[];
  anomalies: DetectedAnomaly[];
  missingDocuments: MissingDocument[];
}): Promise<SynthesisResult> {
  const client = getMistralClient();

  const response = await withMistralRetry(
    () => client.chat.complete({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        {
          role: 'system',
          content: buildSynthesisSystemPrompt(),
        },
        {
          role: 'user',
          content: buildSynthesisUserPrompt(params),
        },
      ],
      temperature: 0.3,
      maxTokens: 4096,
    }),
    'synthesis',
  );

  const synthesis = extractResponseContent(response);
  const wordCount = synthesis.split(/\s+/).filter((w) => w.length > 0).length;

  return { synthesis, wordCount };
}

/**
 * Extract text content from Mistral chat response.
 */
function extractResponseContent(response: unknown): string {
  const res = response as {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
  };
  return res.choices?.[0]?.message?.content ?? '';
}
