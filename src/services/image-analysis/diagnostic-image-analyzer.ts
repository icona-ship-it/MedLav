/**
 * Diagnostic image analysis service.
 * Uses Mistral vision (pixtral-large) to describe diagnostic images objectively.
 * Descriptions are purely observational — no diagnoses.
 */

import type { CaseType } from '@/types';
import { getMistralClient, withMistralRetry, MISTRAL_MODELS } from '@/lib/mistral/client';
import { logger } from '@/lib/logger';

export interface ImageAnalysisResult {
  pageNumber: number;
  imageType: string;
  description: string;
  confidence: number;
  storagePath?: string;
}

const IMAGE_TYPE_KEYWORDS: Record<string, string[]> = {
  radiografia: ['rx', 'radiografia', 'radiograph', 'x-ray'],
  tac: ['tac', 'tc', 'ct', 'tomografia'],
  risonanza: ['rm', 'rmn', 'risonanza', 'mri'],
  ecografia: ['ecografia', 'ecografica', 'ultrasound'],
  endoscopia: ['endoscopia', 'endoscopica'],
  altro: [],
};

const MAX_IMAGES_PER_CASE = 3;

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
      temperature: 0.1,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
    });

    return chatResponse;
  }, 'image-analysis');

  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') return null;

  try {
    const parsed = JSON.parse(content) as {
      imageType?: string;
      description?: string;
      confidence?: number;
    };

    return {
      pageNumber,
      imageType: normalizeImageType(parsed.imageType ?? 'altro'),
      description: parsed.description ?? 'Nessuna descrizione disponibile',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch {
    return {
      pageNumber,
      imageType: 'altro',
      description: content.slice(0, 500),
      confidence: 0.3,
    };
  }
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
