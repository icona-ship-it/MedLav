import { streamMistralChat, MISTRAL_MODELS } from '@/lib/mistral/client';
import { logger } from '@/lib/logger';

const VALID_DOCUMENT_TYPES = new Set([
  'cartella_clinica',
  'referto_specialistico',
  'esame_strumentale',
  'esame_laboratorio',
  'lettera_dimissione',
  'certificato',
  'perizia_precedente',
  'spese_mediche',
  'memoria_difensiva',
  'perizia_ctp',
  'perizia_ctu',
  'altro',
]);

const CLASSIFICATION_SYSTEM_PROMPT = `Sei un sistema di classificazione documentale medico-legale italiano.
Analizza il testo e classifica il documento in UNA delle seguenti categorie:
- cartella_clinica: Cartella clinica ospedaliera, diario medico, scheda infermieristica
- referto_specialistico: Referto di visita specialistica, consulenza medica
- esame_strumentale: RX, TAC, RM, ecografia, ECG, EMG e altri esami diagnostici per immagini
- esame_laboratorio: Esami del sangue, urine, markers tumorali, colturali
- lettera_dimissione: Lettera di dimissione ospedaliera
- certificato: Certificato medico, INAIL, invalidità, idoneità
- perizia_precedente: Perizia medico-legale precedente (non CTU/CTP specifico)
- spese_mediche: Fatture, ricevute, note spese per prestazioni sanitarie
- memoria_difensiva: Atto legale difensivo, conclusioni, comparsa
- perizia_ctp: Consulenza tecnica di parte (CTP)
- perizia_ctu: Consulenza tecnica d'ufficio (CTU)
- altro: Solo se nessuna categoria sopra è applicabile

Rispondi SOLO in JSON con questo formato esatto:
{ "documentType": "categoria", "confidence": 0-100, "reasoning": "breve motivazione in italiano" }`;

/** Max chars of OCR text to send for classification */
const MAX_CLASSIFICATION_CHARS = 3000;

export interface ClassificationResult {
  documentType: string;
  confidence: number;
  reasoning: string;
}

/**
 * Classify a document using its OCR text and file name.
 * Uses Mistral Small for fast, cheap classification (~€0.001/doc).
 */
export async function classifyDocument(
  text: string,
  fileName: string,
): Promise<ClassificationResult> {
  const truncatedText = text.slice(0, MAX_CLASSIFICATION_CHARS);

  const userMessage = `Nome file: ${fileName}\n\nTesto documento (prime ${truncatedText.length} caratteri):\n${truncatedText}`;

  const raw = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_SMALL,
    messages: [
      { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
    maxTokens: 256,
    responseFormat: { type: 'json_object' },
    label: `classify-${fileName.slice(0, 30)}`,
  });

  return parseClassificationResponse(raw, fileName);
}

function parseClassificationResponse(raw: string, fileName: string): ClassificationResult {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Response is not an object');
    }

    const obj = parsed as Record<string, unknown>;
    const documentType = String(obj.documentType ?? 'altro');
    const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0;
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : '';

    // Validate document type
    const normalizedType = VALID_DOCUMENT_TYPES.has(documentType) ? documentType : 'altro';

    if (normalizedType !== documentType) {
      logger.warn('classification', `Invalid type "${documentType}" for ${fileName}, falling back to "altro"`);
    }

    return { documentType: normalizedType, confidence, reasoning };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parse error';
    logger.error('classification', `Failed to parse classification for ${fileName}: ${message}`);
    return { documentType: 'altro', confidence: 0, reasoning: 'Classification parse error' };
  }
}
