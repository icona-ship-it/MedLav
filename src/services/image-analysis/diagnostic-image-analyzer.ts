/**
 * Diagnostic image analysis service.
 * Uses Mistral vision (pixtral-large) to describe diagnostic images objectively.
 * Descriptions are purely observational — no diagnoses.
 */

import type { CaseType } from '@/types';
import { getMistralClient, withMistralRetry, MISTRAL_MODELS, DETERMINISTIC_SEED } from '@/lib/mistral/client';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { createEmptyUsage } from '@/services/cost-tracking/cost-calculator';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const ImageAnalysisResponseSchema = z.object({
  imageType: z.string().optional(),
  description: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export interface ImageAnalysisResult {
  pageNumber: number;
  imageType: string;
  description: string;
  confidence: number;
  storagePath?: string;
  usage?: TokenUsage;
}

const IMAGE_TYPE_KEYWORDS: Record<string, string[]> = {
  radiografia: ['rx', 'radiografia', 'radiograph', 'x-ray'],
  tac: ['tac', 'tc', 'ct', 'tomografia'],
  risonanza: ['rm', 'rmn', 'risonanza', 'mri'],
  ecografia: ['ecografia', 'ecografica', 'ultrasound'],
  endoscopia: ['endoscopia', 'endoscopica'],
  altro: [],
};

// Audit P1-IMG-002: raised from 3 → 15. Pixtral ~€0.007/image → €0.10/case.
const MAX_IMAGES_PER_CASE = 15;

/**
 * Analyze diagnostic images from a document using Mistral vision.
 * Returns objective descriptions (no diagnoses).
 * Processes images in parallel to stay within Vercel timeout.
 */
export async function analyzeDocumentImages(params: {
  images: Array<{ base64: string; pageNumber: number }>;
  caseType: CaseType;
  maxImages?: number;
}): Promise<ImageAnalysisResult[]> {
  const { images, caseType, maxImages = MAX_IMAGES_PER_CASE } = params;

  if (images.length === 0) return [];

  // Limit images to control costs and timeout
  const imagesToAnalyze = images.slice(0, maxImages);

  // Analyze in parallel to stay within Vercel timeout
  const settledResults = await Promise.allSettled(
    imagesToAnalyze.map((image) => analyzeSingleImage(image.base64, image.pageNumber, caseType)),
  );

  const results: ImageAnalysisResult[] = [];
  for (let i = 0; i < settledResults.length; i++) {
    const settled = settledResults[i];
    if (settled.status === 'fulfilled' && settled.value) {
      results.push(settled.value);
    } else if (settled.status === 'rejected') {
      logger.error('image-analysis', `Failed for page ${imagesToAnalyze[i].pageNumber}`, {
        error: settled.reason instanceof Error ? settled.reason.message : 'unknown',
      });
    }
  }

  return results;
}

/**
 * Analyze a single diagnostic image.
 */
async function analyzeSingleImage(
  base64: string,
  pageNumber: number,
  caseType: CaseType,
): Promise<ImageAnalysisResult | null> {
  const client = getMistralClient();

  const systemPrompt = `Sei un radiologo esperto. Descrivi questa immagine diagnostica in modo OGGETTIVO e DESCRITTIVO.

REGOLE:
- Descrivi SOLO ciò che osservi nell'immagine
- NON fare diagnosi
- NON suggerire trattamenti
- Usa terminologia medica appropriata
- Indica il tipo di immagine (radiografia, TAC, RM, ecografia, altro)
- Sii conciso ma completo (max 3 frasi)

Contesto caso: ${caseType}

Rispondi in formato JSON:
{
  "imageType": "radiografia|tac|risonanza|ecografia|endoscopia|altro",
  "description": "Descrizione oggettiva dell'immagine",
  "confidence": 0.0-1.0
}`;

  const response = await withMistralRetry(async () => {
    const dataUrl = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;

    const chatResponse = await client.chat.complete({
      model: MISTRAL_MODELS.PIXTRAL_LARGE,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', imageUrl: { url: dataUrl } },
            { type: 'text', text: 'Descrivi questa immagine diagnostica.' },
          ],
        },
      ],
      temperature: 0,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
      randomSeed: DETERMINISTIC_SEED,
    });

    return chatResponse;
  }, 'image-analysis');

  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') return null;

  const usage: TokenUsage = response.usage
    ? {
      promptTokens: response.usage.promptTokens ?? 0,
      completionTokens: response.usage.completionTokens ?? 0,
      totalTokens: response.usage.totalTokens ?? 0,
    }
    : createEmptyUsage();

  // Parse + validate via Zod. If shape is invalid (Pixtral returned non-JSON or
  // wrong types), produce a SAFE placeholder — never expose raw model output to
  // the report, since it might contain hallucinated diagnoses or error text.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    logger.warn('image-analysis', `JSON parse failed for page ${pageNumber} — using safe placeholder`);
    return {
      pageNumber,
      imageType: 'altro',
      description: '[Analisi immagine non disponibile per errore tecnico]',
      confidence: 0,
      usage,
    };
  }

  const validated = ImageAnalysisResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    logger.warn(
      'image-analysis',
      `Zod validation failed for page ${pageNumber}: ${validated.error.issues.map((i) => i.path.join('.') + ':' + i.message).join('; ')}`,
    );
    return {
      pageNumber,
      imageType: 'altro',
      description: '[Analisi immagine non disponibile per errore tecnico]',
      confidence: 0,
      usage,
    };
  }

  const data = validated.data;
  return {
    pageNumber,
    imageType: normalizeImageType(data.imageType ?? 'altro'),
    description: data.description ?? 'Nessuna descrizione disponibile',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
    usage,
  };
}

/**
 * Normalize image type to a known category.
 */
function normalizeImageType(rawType: string): string {
  const lower = rawType.toLowerCase();
  for (const [type, keywords] of Object.entries(IMAGE_TYPE_KEYWORDS)) {
    if (type === 'altro') continue;
    if (keywords.some((kw) => lower.includes(kw))) return type;
  }
  if (lower === 'altro' || lower === 'other') return 'altro';
  return rawType;
}
