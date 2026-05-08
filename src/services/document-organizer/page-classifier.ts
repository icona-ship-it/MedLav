import { streamMistralChat, MISTRAL_MODELS, DETERMINISTIC_SEED, assertNotTruncated } from '@/lib/mistral/client';
import { logger } from '@/lib/logger';

export interface PageClassification {
  pageNumber: number;
  documentType: string;
  confidence: number;
  reasoning: string;
  dateFound: string | null;
}

export interface DocumentBoundary {
  startPage: number;
  endPage: number;
  documentType: string;
  avgConfidence: number;
  dateFound: string | null;
}

const VALID_TYPES = new Set([
  'cartella_clinica', 'referto_specialistico', 'esame_strumentale',
  'esame_laboratorio', 'lettera_dimissione', 'certificato',
  'perizia_precedente', 'spese_mediche', 'memoria_difensiva',
  'perizia_ctp', 'perizia_ctu', 'altro',
]);

const SYSTEM_PROMPT = `Sei un classificatore di documenti medico-legali italiani.
Analizza il testo di una SINGOLA PAGINA di un documento e determina:
1. Il tipo di documento a cui appartiene questa pagina
2. La tua confidenza (0-100)
3. Il motivo della classificazione (1 frase)
4. Una data rilevante trovata nella pagina (formato YYYY-MM-DD) o null

Tipi validi: cartella_clinica, referto_specialistico, esame_strumentale, esame_laboratorio, lettera_dimissione, certificato, perizia_precedente, spese_mediche, memoria_difensiva, perizia_ctp, perizia_ctu, altro

Rispondi SOLO con JSON: {"documentType": "...", "confidence": N, "reasoning": "...", "dateFound": "YYYY-MM-DD" | null}`;

/**
 * Classify a single page of a document using Mistral.
 */
export async function classifyPage(
  pageText: string,
  pageNumber: number,
): Promise<PageClassification> {
  if (!pageText || pageText.trim().length < 20) {
    return { pageNumber, documentType: 'altro', confidence: 10, reasoning: 'Pagina vuota o quasi', dateFound: null };
  }

  const truncated = pageText.slice(0, 2000);

  try {
    const result = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Pagina ${pageNumber}:\n${truncated}` },
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0,
      maxTokens: 256,
      timeoutMs: 30_000,
      randomSeed: DETERMINISTIC_SEED,
      label: `page-classify:p${pageNumber}`,
    });
    assertNotTruncated(result, `page-classify:p${pageNumber}`);

    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    const docType = String(parsed.documentType ?? 'altro');

    return {
      pageNumber,
      documentType: VALID_TYPES.has(docType) ? docType : 'altro',
      confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 50,
      reasoning: String(parsed.reasoning ?? ''),
      dateFound: typeof parsed.dateFound === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateFound) ? parsed.dateFound : null,
    };
  } catch (error) {
    logger.warn('document-organizer', `Page ${pageNumber} classification failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { pageNumber, documentType: 'altro', confidence: 10, reasoning: 'Classificazione fallita', dateFound: null };
  }
}

/**
 * Detect document boundaries from page classifications.
 * Groups consecutive pages of the same type into document segments.
 */
export function detectBoundaries(pageClassifications: PageClassification[]): DocumentBoundary[] {
  if (pageClassifications.length === 0) return [];

  const sorted = [...pageClassifications].sort((a, b) => a.pageNumber - b.pageNumber);
  const boundaries: DocumentBoundary[] = [];

  let currentType = sorted[0].documentType;
  let startPage = sorted[0].pageNumber;
  let confidences = [sorted[0].confidence];
  let bestDate: string | null = sorted[0].dateFound;

  for (let i = 1; i < sorted.length; i++) {
    const page = sorted[i];

    if (page.documentType !== currentType) {
      // Boundary detected — save current segment
      boundaries.push({
        startPage,
        endPage: sorted[i - 1].pageNumber,
        documentType: currentType,
        avgConfidence: Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length),
        dateFound: bestDate,
      });

      // Start new segment
      currentType = page.documentType;
      startPage = page.pageNumber;
      confidences = [page.confidence];
      bestDate = page.dateFound;
    } else {
      confidences.push(page.confidence);
      if (!bestDate && page.dateFound) bestDate = page.dateFound;
    }
  }

  // Push last segment
  boundaries.push({
    startPage,
    endPage: sorted[sorted.length - 1].pageNumber,
    documentType: currentType,
    avgConfidence: Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length),
    dateFound: bestDate,
  });

  return boundaries;
}
