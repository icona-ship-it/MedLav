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

Analizza il NOME FILE e il TESTO del documento per classificarlo in UNA delle seguenti categorie:

- cartella_clinica: Cartella clinica ospedaliera, diario medico, scheda infermieristica, SDO, verbale di pronto soccorso
- referto_specialistico: Referto di visita specialistica (ortopedica, neurologica, cardiologica, etc.), consulenza medica ambulatoriale
- esame_strumentale: Referti di RX, TAC/TC, RM/RMN, ecografia, ECG, EMG, scintigrafia, PET, angiografia, endoscopia
- esame_laboratorio: Esami del sangue, urine, markers tumorali, colturali, antibiogramma, emocromo
- lettera_dimissione: Lettera di dimissione ospedaliera, relazione di dimissione, epicrisi
- certificato: Certificato medico, certificato INAIL, certificato di invalidità, certificato di idoneità, certificato di malattia
- perizia_precedente: Perizia medico-legale generica precedente, relazione medico-legale (non specificamente CTP o CTU)
- spese_mediche: Fatture sanitarie, ricevute mediche, note spese per prestazioni, ticket, parcelle
- memoria_difensiva: Atto legale difensivo, conclusioni di parte, comparsa, ricorso, memoria autorizzata
- perizia_ctp: Consulenza tecnica di parte (CTP) — contiene la dicitura "consulente tecnico di parte" o è firmata da un CTP
- perizia_ctu: Consulenza tecnica d'ufficio (CTU) — contiene la dicitura "consulente tecnico d'ufficio", quesiti del giudice, o è depositata in tribunale
- altro: Solo se NESSUNA categoria sopra è applicabile

SEGNALI DA USARE:
- Nome file: spesso contiene indicazioni (es. "fattura", "CTU", "RM_ginocchio", "dimissione")
- Intestazione: le prime righe spesso identificano il tipo (es. "REFERTO DI RISONANZA MAGNETICA", "LETTERA DI DIMISSIONE")
- Struttura: tabelle con valori numerici → esame_laboratorio; immagini diagnostiche → esame_strumentale
- Linguaggio: termini giuridici → memoria_difensiva/perizia; termini clinici → cartella/referto

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
