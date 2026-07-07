import { streamMistralChat, MISTRAL_MODELS, DETERMINISTIC_SEED, assertNotTruncated } from '@/lib/mistral/client';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
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

/**
 * json_schema (vs plain json_object) makes the provider enforce the SHAPE +
 * the documentType ENUM, so an out-of-vocabulary type can't come back. The
 * defensive parseClassificationResponse is still kept as a net.
 */
const CLASSIFICATION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    documentType: { type: 'string', enum: [...VALID_DOCUMENT_TYPES] },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['documentType', 'confidence', 'reasoning'],
  additionalProperties: false,
};

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

LINGUA: il documento può essere in ITALIANO, TEDESCO o INGLESE (es. Alto Adige). Classifica per STRUTTURA e FUNZIONE del documento, non per la lingua.

CONFIDENCE (0-100) — usa questa scala ancorata:
- 85-100: tipo EVIDENTE (intestazione/struttura/firma lo dichiarano esplicitamente)
- 70-84: tipo molto probabile (più segnali concordi, nessun segnale contrario)
- 50-69: tipo probabile ma con AMBIGUITÀ (segnali deboli o parzialmente discordanti)
- sotto 50: incerto (segnali insufficienti o contraddittori) → preferisci "altro"

Rispondi SOLO in JSON con questo formato esatto:
{ "documentType": "categoria", "confidence": 0-100, "reasoning": "breve motivazione in italiano" }`;

/** Max chars of OCR text to send for classification.
 * Audit P1-CLASS-001: raised from 3000 → 8000. Long PDFs with legal cover page
 * were misclassified because only the first 3K chars were inspected.
 * 8K covers header + body + signatures → robust classification. */
const MAX_CLASSIFICATION_CHARS = 8000;

/** Sotto questa soglia di testo OCR "vero" il documento è di fatto illeggibile
 * (manoscritto/vuoto): non lo si manda all'LLM, si restituisce un motivo esplicito. */
const MIN_CLASSIFICATION_CHARS = 25;

export interface ClassificationResult {
  documentType: string;
  confidence: number;
  reasoning: string;
  usage?: TokenUsage;
}

/**
 * Classify a document using its OCR text and file name.
 * Uses Mistral Large for high-quality classification.
 */
export async function classifyDocument(
  text: string,
  fileName: string,
): Promise<ClassificationResult> {
  // Guard OCR vuoto/insufficiente: un documento manoscritto/illeggibile produce poco o
  // nessun testo. Inviarlo all'LLM dà un errore "muto" o una categoria a caso; meglio
  // restituire un MOTIVO esplicito (così l'utente capisce: non è un bug, è illeggibile).
  const meaningful = text.replace(/\s+/g, ' ').trim();
  if (meaningful.length < MIN_CLASSIFICATION_CHARS) {
    return {
      documentType: 'altro',
      confidence: 0,
      reasoning: 'OCR non ha prodotto testo leggibile sufficiente: il documento è probabilmente manoscritto, illeggibile o vuoto. Non categorizzabile automaticamente — da verificare a mano.',
    };
  }

  const truncatedText = text.slice(0, MAX_CLASSIFICATION_CHARS);
  const safeFileName = fileName.replace(/[\n\r]/g, ' ').slice(0, 100);

  const userMessage = `Nome file: ${safeFileName}\n\nTesto documento (prime ${truncatedText.length} caratteri):\n${truncatedText}`;

  const result_ = await streamMistralChat({
    // mistral-medium (≈50 req/s) invece di large (≈1,25 req/s sul tier): la
    // classificazione è un task semplice e vincolato dallo schema, ma con large
    // 6 classificazioni concorrenti saturavano l'RPS → 429 → doc non classificati
    // che l'utente doveva rifare. Medium regge il parallelismo. Stesso modello in
    // TUTTI i percorsi (batch, pipeline, singola, reclassify) → nessuna
    // classificazione divergente per lo stesso doc. (medium usa già json_schema
    // nel claim-verifier).
    model: MISTRAL_MODELS.MISTRAL_MEDIUM,
    messages: [
      { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
    maxTokens: 256,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: { name: 'document_classification', schemaDefinition: CLASSIFICATION_RESPONSE_SCHEMA },
    },
    randomSeed: DETERMINISTIC_SEED,
    label: `classify-${safeFileName.slice(0, 30)}`,
  });
  assertNotTruncated(result_, `classify-${safeFileName.slice(0, 30)}`);
  const { content: raw, usage } = result_;

  const result = parseClassificationResponse(raw, fileName);
  return { ...result, usage };
}

/** Ritardi (ms) tra i tentativi a livello di chiamante. Distanziati per dare
 * tempo al circuit-breaker Mistral di richiudersi dopo un picco transitorio. */
const CLASSIFY_RETRY_DELAYS_MS = [3000, 8000];

/**
 * Come classifyDocument, ma RIPROVA quando la chiamata LANCIA (API giù,
 * circuit-breaker aperto, timeout, 429 dopo l'esaurimento dei retry interni).
 * I casi non-eccezionali (OCR vuoto, parse error) NON lanciano: ritornano
 * 'altro' e non vengono riprovati (riprovare non aiuterebbe). Serve ai percorsi
 * AUTOMATICI (batch pre-analisi + step pipeline) dove un fallimento transitorio
 * lasciava il documento non classificato costringendo l'utente a rifare.
 */
export async function classifyDocumentWithRetry(
  text: string,
  fileName: string,
): Promise<ClassificationResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= CLASSIFY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await classifyDocument(text, fileName);
    } catch (error) {
      lastError = error;
      const delay = CLASSIFY_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break; // ultimo tentativo esaurito
      logger.warn('classification', `classify ${fileName}: tentativo ${attempt + 1} fallito, riprovo tra ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Classification failed after retries');
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
