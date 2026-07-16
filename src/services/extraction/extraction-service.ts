import { MISTRAL_MODELS, streamMistralChat, TIMEOUT_EXTRACTION, DETERMINISTIC_SEED, assertNotTruncated } from '@/lib/mistral/client';
import type { MistralResponseFormat } from '@/lib/mistral/client';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import type { ExtractedEvent, ExtractionResponse } from './extraction-schemas';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './extraction-prompts';
import { annotateTablesInText } from './table-detector';
import type { CaseType } from '@/types';
import { jsonrepair } from 'jsonrepair';
import { logger } from '@/lib/logger';

// Smaller chunks = faster per-chunk extraction + less risk of truncation
const MAX_CHUNK_CHARS = 8_000;

// ── JSON Schema for structured extraction (enforced at token level by Mistral) ──
const EXTRACTION_JSON_SCHEMA: MistralResponseFormat = {
  type: 'json_schema',
  jsonSchema: {
    name: 'extraction_response',
    // strict: constrained decoding (il default Mistral è best-effort). Richiede
    // lo shape rigido: tutti i campi required (i nullable via type union) e
    // additionalProperties: false a ogni livello.
    strict: true,
    schemaDefinition: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              extraction_reasoning: {
                type: 'string',
                description: 'Why this event was extracted and where it was found in the text',
              },
              eventDate: {
                type: ['string', 'null'],
                description: 'Date in YYYY-MM-DD format, null if unknown',
              },
              datePrecision: {
                type: 'string',
                enum: ['giorno', 'mese', 'anno', 'sconosciuta'],
                description: 'How precise the date is',
              },
              eventType: {
                type: 'string',
                enum: [
                  'visita', 'esame', 'diagnosi', 'intervento', 'terapia',
                  'ricovero', 'follow-up', 'referto', 'prescrizione',
                  'consenso', 'complicanza', 'spesa_medica',
                  'documento_amministrativo', 'certificato', 'altro',
                ],
                description: 'Category of clinical event',
              },
              title: { type: 'string', description: 'Short title, max 100 chars' },
              description: { type: 'string', description: 'Complete detailed description with all values' },
              sourceType: {
                type: 'string',
                enum: ['cartella_clinica', 'referto_controllo', 'esame_strumentale', 'esame_ematochimico', 'altro'],
                description: 'Source document category',
              },
              diagnosis: { type: ['string', 'null'], description: 'Formal diagnosis if present' },
              doctor: { type: ['string', 'null'], description: 'Doctor name if present' },
              facility: { type: ['string', 'null'], description: 'Facility name if present' },
              confidence: { type: 'number', description: '0-100 confidence score' },
              requiresVerification: { type: 'boolean', description: 'Whether manual verification is needed' },
              reliabilityNotes: { type: ['string', 'null'], description: 'Reliability notes if applicable' },
              sourceText: { type: 'string', description: 'Exact quote from OCR text, max 200 chars' },
              sourcePages: { type: 'array', items: { type: 'number' }, description: 'Page numbers' },
            },
            required: [
              'extraction_reasoning', 'eventDate', 'datePrecision', 'eventType',
              'title', 'description', 'sourceType', 'diagnosis', 'doctor',
              'facility', 'confidence', 'requiresVerification',
              'reliabilityNotes', 'sourceText', 'sourcePages',
            ],
            additionalProperties: false,
          },
        },
        abbreviations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              abbreviation: { type: 'string' },
              expansion: { type: 'string' },
            },
            required: ['abbreviation', 'expansion'],
            additionalProperties: false,
          },
        },
      },
      required: ['events', 'abbreviations'],
      additionalProperties: false,
    },
  },
};

export interface ExtractionParams {
  documentText: string;
  fileName: string;
  documentType: string;
  caseType: CaseType;
  temperature?: number;
}

/**
 * Pre-process text and split into chunks for extraction.
 * Returns chunks ready to be processed (potentially in parallel).
 */
export function prepareExtractionChunks(params: ExtractionParams): {
  chunks: string[];
  params: ExtractionParams;
} {
  const { documentText } = params;

  const { annotatedText, tableCount } = annotateTablesInText(documentText);
  if (tableCount > 0) {
    logger.info('extraction', ` Annotated ${tableCount} tables in document`);
  }

  const processedParams = { ...params, documentText: annotatedText };

  if (annotatedText.length <= MAX_CHUNK_CHARS) {
    return { chunks: [annotatedText], params: processedParams };
  }

  const chunks = splitTextIntoChunks(annotatedText, MAX_CHUNK_CHARS);
  logger.info('extraction', ` Split ${annotatedText.length} chars into ${chunks.length} chunks`);
  return { chunks, params: processedParams };
}

/** Nota su evento estratto da JSON LLM riparato/parziale (recupero non pulito). */
const PARTIAL_RECOVERY_NOTE =
  '[AUTO] Estrazione da JSON LLM riparato/parziale: eventi successivi in questo segmento potrebbero non essere stati estratti — verificare la completezza nel documento originale';

/** Parametri di estrazione per chunk (esteso con la profondità dello split-retry). */
interface ExtractChunkParams {
  chunkText: string;
  chunkLabel: string;
  documentType: string;
  caseType: CaseType | CaseType[];
  temperature?: number;
  chunkIndex?: number;
  totalChunks?: number;
  documentName?: string;
  pageRange?: string;
  /** Wave C.4: language hint when chunk OCR is detected as not-Italian. */
  languageHint?: 'de' | 'en' | 'mixed';
  /** Profondità dello split-retry (interno): 0 = chunk originale. */
  _splitDepth?: number;
}

/** Soglia sotto cui non ha senso splittare (chunk già piccolo). */
const SPLIT_RETRY_MIN_CHARS = 6000;

/** Divide il testo a metà sul confine di riga più vicino al centro (null se
 * non divisibile sensatamente). Puro. */
export function splitChunkForRetry(text: string): [string, string] | null {
  if (text.length < SPLIT_RETRY_MIN_CHARS) return null;
  const mid = Math.floor(text.length / 2);
  // cerca un confine di riga entro ±20% dal centro
  const window = Math.floor(text.length * 0.2);
  let cut = -1;
  for (let d = 0; d <= window; d++) {
    if (text[mid + d] === '\n') { cut = mid + d; break; }
    if (text[mid - d] === '\n') { cut = mid - d; break; }
  }
  if (cut <= 0) cut = mid;
  const a = text.slice(0, cut).trim();
  const b = text.slice(cut).trim();
  if (a.length < 500 || b.length < 500) return null;
  return [a, b];
}

/** True per l'errore di troncamento output (assertNotTruncated). */
function isTruncationError(e: unknown): boolean {
  return e instanceof Error && /truncation detected|finishreason=length/i.test(e.message);
}

/**
 * Extract events from a single text chunk using streaming.
 * Designed to be called as a separate Inngest step for parallelism.
 *
 * AUTO-SPLIT sui chunk DENSI (CASO-2026-219/220, 2026-07-14): quando l'output
 * LLM tronca (finishReason=length) o il JSON va recuperato parzialmente (coda
 * persa), il chunk viene RIPROVATO diviso in due metà — output dimezzato =
 * niente troncamento — e i risultati fusi. Solo se anche lo split fallisce si
 * tiene il recupero parziale (flaggato) o si rilancia. Un livello di profondità.
 */
export async function extractEventsFromChunk(params: ExtractChunkParams): Promise<ExtractionResponse & { usage?: TokenUsage }> {
  const depth = params._splitDepth ?? 0;

  let result: (ExtractionResponse & { usage?: TokenUsage }) | null = null;
  try {
    result = await extractChunkOnce(params);
  } catch (error) {
    // Troncamento duro: riprova splittando PRIMA di rilanciare (il retry Inngest
    // ripeterebbe lo stesso input → stessa troncatura).
    if (depth === 0 && isTruncationError(error)) {
      const split = await trySplitExtraction(params);
      if (split) return split;
    }
    throw error;
  }

  // Recupero parziale (JSON riparato, coda possibile persa): tenta lo split per
  // un'estrazione PULITA; se non migliora, tieni il recupero parziale flaggato.
  if (result.partialRecovery && depth === 0) {
    const split = await trySplitExtractionSafe(params);
    if (split && !split.partialRecovery) {
      logger.info('extraction', `[${params.chunkLabel}] split-retry riuscito: estrazione pulita (${split.events.length} eventi vs ${result.events.length} dal recupero parziale)`);
      return split;
    }
  }
  return result;
}

/** Split-retry che RILANCIA gli errori (usato nel ramo troncamento-duro). */
async function trySplitExtraction(params: ExtractChunkParams): Promise<(ExtractionResponse & { usage?: TokenUsage }) | null> {
  const halves = splitChunkForRetry(params.chunkText);
  if (!halves) return null;
  logger.warn('extraction', `[${params.chunkLabel}] output troncato su chunk denso (${params.chunkText.length} char) → retry in 2 metà`);
  const [a, b] = halves;
  const ra = await extractEventsFromChunk({ ...params, chunkText: a, chunkLabel: `${params.chunkLabel}·A`, _splitDepth: 1 });
  const rb = await extractEventsFromChunk({ ...params, chunkText: b, chunkLabel: `${params.chunkLabel}·B`, _splitDepth: 1 });
  return mergeSplitResults(ra, rb);
}

/** Split-retry che NON rilancia (usato nel ramo recupero-parziale: il salvage esiste già). */
async function trySplitExtractionSafe(params: ExtractChunkParams): Promise<(ExtractionResponse & { usage?: TokenUsage }) | null> {
  try {
    return await trySplitExtraction(params);
  } catch {
    return null;
  }
}

function mergeSplitResults(
  a: ExtractionResponse & { usage?: TokenUsage },
  b: ExtractionResponse & { usage?: TokenUsage },
): ExtractionResponse & { usage?: TokenUsage } {
  return {
    events: [...a.events, ...b.events],
    abbreviations: [...(a.abbreviations ?? []), ...(b.abbreviations ?? [])],
    partialRecovery: Boolean(a.partialRecovery || b.partialRecovery),
    usage: a.usage && b.usage ? {
      promptTokens: a.usage.promptTokens + b.usage.promptTokens,
      completionTokens: a.usage.completionTokens + b.usage.completionTokens,
      totalTokens: a.usage.totalTokens + b.usage.totalTokens,
    } : (a.usage ?? b.usage),
  };
}

/** Esecuzione singola (senza split-retry) — il corpo originale della funzione. */
async function extractChunkOnce(params: ExtractChunkParams): Promise<ExtractionResponse & { usage?: TokenUsage }> {
  const {
    chunkText, chunkLabel, documentType, caseType,
    temperature = 0, chunkIndex, totalChunks, documentName, pageRange, languageHint,
  } = params;

  const startMs = Date.now();
  logger.info('extraction', ` Starting Mistral Large for "${chunkLabel}" (${chunkText.length} chars)`);

  const result_ = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      {
        role: 'system',
        content: buildExtractionSystemPrompt(caseType),
      },
      {
        role: 'user',
        content: buildExtractionUserPrompt({
          documentText: chunkText,
          fileName: chunkLabel,
          documentType,
          chunkIndex,
          totalChunks,
          documentName,
          pageRange,
          languageHint,
        }),
      },
    ],
    responseFormat: EXTRACTION_JSON_SCHEMA,
    temperature,
    // 16384 (era 8192): un chunk denso (~30K char di JSON eventi) sforava il tetto
    // output → finishReason=length → troncamento. Col tetto alzato i chunk densi
    // completano e il retry (ora che il troncamento NON è più ingoiato) ha una
    // chance reale invece di ripetere la stessa troncatura.
    maxTokens: 16384,
    timeoutMs: TIMEOUT_EXTRACTION,
    randomSeed: DETERMINISTIC_SEED,
    label: `extraction:${chunkLabel.slice(0, 30)}`,
  });
  assertNotTruncated(result_, `extraction:${chunkLabel.slice(0, 30)}`);
  const { content, usage } = result_;

  const elapsedMs = Date.now() - startMs;
  logger.info('extraction', ` Mistral Large responded in ${elapsedMs}ms (${content.length} chars)`);

  const result = parseExtractionResponse(content, chunkLabel);
  const validatedEvents = validateExtractedNamesAgainstOcr(result.events, chunkText);
  const inferredEvents = inferMissingDates(validatedEvents);
  const filteredEvents = flagLegislativeReferences(inferredEvents);
  // "Mai perdere un fatto": se il JSON è stato riparato/recuperato (non parse pulito),
  // la coda può essere stata troncata → flagghiamo OGNI evento del chunk per la
  // verifica del perito, DOPO i transform così il flag non viene sovrascritto.
  const finalEvents = result.partialRecovery
    ? filteredEvents.map((e) => ({
        ...e,
        requiresVerification: true,
        reliabilityNotes: e.reliabilityNotes
          ? `${e.reliabilityNotes} | ${PARTIAL_RECOVERY_NOTE}`
          : PARTIAL_RECOVERY_NOTE,
      }))
    : filteredEvents;
  return { ...result, events: finalEvents, usage };
}

// --- Internal helpers ---

interface PageBlock {
  pageNumber: number;
  text: string;
}

function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const pageBlocks = extractPageBlocks(text);

  if (pageBlocks.length === 0) {
    return splitByCharacterBoundaries(text, maxChunkSize);
  }

  return splitPageBlocksIntoChunks(pageBlocks, maxChunkSize);
}

function extractPageBlocks(text: string): PageBlock[] {
  const blocks: PageBlock[] = [];
  const regex = /\[PAGE_START:(\d+)\]([\s\S]*?)\[PAGE_END:\d+\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      pageNumber: parseInt(match[1], 10),
      text: match[0],
    });
  }

  return blocks;
}

function splitPageBlocksIntoChunks(blocks: PageBlock[], maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let currentPages: string[] = [];
  let currentSize = 0;
  // Overlap: keep last 2 pages from previous chunk
  const OVERLAP_PAGES = 2;
  let lastPagesOfPrevChunk: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.text.length > maxChunkSize) {
      if (currentPages.length > 0) {
        chunks.push(currentPages.join('\n'));
        lastPagesOfPrevChunk = currentPages.slice(-OVERLAP_PAGES);
        currentPages = [];
        currentSize = 0;
      }
      const subChunks = splitByCharacterBoundaries(block.text, maxChunkSize);
      chunks.push(...subChunks);
      lastPagesOfPrevChunk = [];
      continue;
    }

    if (currentSize + block.text.length > maxChunkSize && currentPages.length > 0) {
      chunks.push(currentPages.join('\n'));
      lastPagesOfPrevChunk = currentPages.slice(-OVERLAP_PAGES);
      currentPages = [...lastPagesOfPrevChunk];
      currentSize = currentPages.reduce((s, p) => s + p.length, 0);
    }

    currentPages.push(block.text);
    currentSize += block.text.length;
  }

  if (currentPages.length > 0) {
    chunks.push(currentPages.join('\n'));
  }

  return chunks;
}

function splitByCharacterBoundaries(text: string, maxChunkSize: number): string[] {
  const overlapSize = 2_000;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    if (end < text.length) {
      const searchStart = Math.max(end - 1000, start);
      const searchText = text.slice(searchStart, end);
      const lastDoubleNewline = searchText.lastIndexOf('\n\n');
      if (lastDoubleNewline !== -1) {
        end = searchStart + lastDoubleNewline + 2;
      } else {
        const lastNewline = searchText.lastIndexOf('\n');
        if (lastNewline !== -1) {
          end = searchStart + lastNewline + 1;
        }
      }
    }

    chunks.push(text.slice(start, end));
    start = Math.max(end - overlapSize, start + 1);
    if (end >= text.length) break;
  }

  return chunks;
}

// ── Date inference for events with missing dates ──

const SENTINEL_DATE = '1900-01-01';

/**
 * Infer missing dates from nearby events on the same source pages.
 * For events with sentinel date '1900-01-01', tries to find a "donor" event
 * on the same page (or ±1 page) that has a valid date.
 */
export function inferMissingDates(events: ExtractedEvent[]): ExtractedEvent[] {
  if (events.length === 0) return events;

  // Index events with valid dates by page number
  const datedEventsByPage = new Map<number, ExtractedEvent[]>();
  for (const event of events) {
    if (event.eventDate === SENTINEL_DATE) continue;
    for (const page of event.sourcePages) {
      const existing = datedEventsByPage.get(page) ?? [];
      existing.push(event);
      datedEventsByPage.set(page, existing);
    }
  }

  // Nothing to donate from
  if (datedEventsByPage.size === 0) return events;

  let inferredCount = 0;

  const result = events.map((event) => {
    if (event.eventDate !== SENTINEL_DATE) return event;

    // Try to find a donor: same page first, then ±1
    const donor = findDateDonor(event.sourcePages, datedEventsByPage);
    if (!donor) return event;

    inferredCount++;
    const note = `Data approssimata — desunta da "${donor.title}" del ${donor.eventDate} nella stessa pagina. Verificare sul documento originale.`;
    return {
      ...event,
      eventDate: donor.eventDate,
      datePrecision: 'sconosciuta' as const,
      confidence: Math.max(10, Math.min(event.confidence - 30, 40)),
      requiresVerification: true,
      reliabilityNotes: event.reliabilityNotes
        ? `${event.reliabilityNotes} | ${note}`
        : note,
    };
  });

  if (inferredCount > 0) {
    logger.info('extraction', `Date inference: ${inferredCount} events inherited dates from nearby events`);
  }

  return result;
}

// ── Legislative reference filter ──

const LEGISLATIVE_PATTERNS = [
  /\bLegge\s+\d+\/\d{4}\b/i,
  /\bL\.\s*\d+\/\d{4}\b/i,
  /\bD\.?\s*L\.?\s*gs\.?\s*\d+\/\d{4}\b/i,
  /\bD\.?\s*P\.?\s*R\.?\s*\d+\/\d{4}\b/i,
  /\bD\.?\s*M\.?\s*\d+\/\d{4}\b/i,
  /\bArt\.?\s*\d+\s+c\.?\s*[cp]\b/i, // Art. 2043 c.c.
  /\bCass\.?\s*(Civ|Pen|Sez)/i, // Cassazione
  /\bSent(?:enza)?\s+n\.\s*\d+/i, // Sentenza n.
];

const PATIENT_KEYWORDS = [
  'paziente', 'periziando', 'ricorrente', 'resistente',
  'sig.', 'signor', 'signora', 'sig.ra',
  'danneggiato', 'danneggiata', 'vittima',
  'lavoratore', 'lavoratrice', 'assicurato', 'assicurata',
  'infortunato', 'infortunata', 'assistito', 'assistita',
  'ricorsa', 'attore', 'attrice', 'convenuto', 'convenuta',
];

/**
 * Flag legislative references that are NOT about the patient.
 * Does NOT delete them — marks with very low confidence so they sort to bottom.
 */
export function flagLegislativeReferences(events: ExtractedEvent[]): ExtractedEvent[] {
  let flaggedCount = 0;

  const result = events.map((event) => {
    // Only check documento_amministrativo and altro types
    if (event.eventType !== 'documento_amministrativo' && event.eventType !== 'altro') return event;

    const text = `${event.title} ${event.description}`.toLowerCase();

    // Does it match a legislative pattern?
    const isLegislative = LEGISLATIVE_PATTERNS.some((p) => p.test(event.title) || p.test(event.description));
    if (!isLegislative) return event;

    // Does it reference the patient specifically?
    const mentionsPatient = PATIENT_KEYWORDS.some((kw) => text.includes(kw));
    if (mentionsPatient) return event; // Keep — it's about the patient

    flaggedCount++;
    return {
      ...event,
      confidence: Math.min(event.confidence, 10),
      requiresVerification: true,
      reliabilityNotes: `Riferimento normativo generico — potrebbe non essere pertinente alla vicenda clinica del paziente. ${event.reliabilityNotes ?? ''}`.trim(),
    };
  });

  if (flaggedCount > 0) {
    logger.info('extraction', `Legislative filter: ${flaggedCount} normative references flagged with low confidence`);
  }

  return result;
}

/**
 * Find a date donor for an event without a date.
 * Priority: same page > adjacent page (±1).
 *
 * MEDICO-LEGAL SAFETY (audit 2026-05-31, confermato Lavini): inherit a date
 * ONLY when the page is unambiguous — i.e. all candidate donors share a SINGLE
 * date. The previous heuristic "pick the most recent" silently assigned the
 * DISCHARGE date to an undated lab that sat between an admission and a discharge
 * on the same page — a confidently-wrong date in a forensic timeline. When
 * multiple distinct dates are present, refuse to guess: leave the event undated
 * (sentinel) and flagged, so the perito assigns the correct date.
 */
function findDateDonor(
  sourcePages: number[],
  datedEventsByPage: Map<number, ExtractedEvent[]>,
): ExtractedEvent | null {
  // Collect all candidate donors from same page, then adjacent pages
  const candidates: ExtractedEvent[] = [];

  // Priority 1: exact same page
  for (const page of sourcePages) {
    const donors = datedEventsByPage.get(page);
    if (donors) candidates.push(...donors);
  }

  // Priority 2: adjacent page (±1) — only if no same-page donors
  if (candidates.length === 0) {
    for (const page of sourcePages) {
      for (const offset of [-1, 1]) {
        const donors = datedEventsByPage.get(page + offset);
        if (donors) candidates.push(...donors);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Inherit ONLY if the page is unambiguous (one single date among candidates).
  const distinctDates = Array.from(
    new Set(candidates.map((c) => c.eventDate).filter((d): d is string => Boolean(d) && d !== SENTINEL_DATE)),
  );
  if (distinctDates.length !== 1) return null; // ambiguous → do not fabricate a date
  return candidates.find((c) => c.eventDate === distinctDates[0]) ?? null;
}

/**
 * 3-level JSON parse with repair and recovery.
 */
function safeJsonParse(raw: string, label: string): { value: unknown; recovered: boolean } {
  // Level 1: Direct parse — UNICO path garantito COMPLETO (nessuna perdita).
  try {
    return { value: JSON.parse(raw), recovered: false };
  } catch {
    // continue
  }

  // Level 2: Automatic repair (close brackets, fix quotes, etc.). ATTENZIONE: su
  // input TRONCATO jsonrepair scarta l'oggetto-coda incompleto → possibile perdita
  // silenziosa di eventi. recovered=true → gli eventi vanno flaggati per verifica.
  try {
    const repaired = jsonrepair(raw);
    logger.warn('extraction', `[${label}] JSON repaired (${raw.length} -> ${repaired.length} chars)`);
    return { value: JSON.parse(repaired), recovered: true };
  } catch {
    // continue
  }

  // Level 3: Manual recovery of events from truncated JSON — lossy (coda persa).
  const eventsMatch = raw.match(/"events"\s*:\s*\[/);
  if (eventsMatch && eventsMatch.index !== undefined) {
    const fromEvents = raw.substring(eventsMatch.index);
    const lastCloseBrace = fromEvents.lastIndexOf('}');
    if (lastCloseBrace > 0) {
      try {
        const partial = '{' + fromEvents.substring(0, lastCloseBrace + 1) + ']}';
        const result = JSON.parse(partial) as Record<string, unknown>;
        const count = Array.isArray(result.events) ? result.events.length : 0;
        logger.warn('extraction', `[${label}] Recovered ${count} events from truncated JSON (${raw.length} chars total)`);
        return { value: result, recovered: true };
      } catch { /* give up */ }
    }
  }

  // All levels failed: do NOT swallow the error with an empty events array.
  // Returning {events:[]} silently makes the perito believe a document carries
  // no clinical events when in reality the LLM produced unparseable output.
  // Inngest will retry; if every attempt fails the document lands in
  // processing_status='failed' with a visible error in the UI.
  // GDPR Art.9: NON loggare il body LLM grezzo — contiene nomi/diagnosi (dati
  // sensibili) e sanitizeLogMessage (logger.ts) redige solo CF/email/telefono.
  // Solo diagnostica strutturale (lunghezza); l'errore è comunque visibile in UI
  // (processing_status='failed' dopo i retry Inngest).
  logger.error('extraction',
    `[${label}] JSON irrecoverable (${raw.length} chars, no parsable events). Inngest will retry.`,
  );
  throw new Error(
    `Estrazione fallita per "${label}": JSON LLM irrecuperabile dopo 3 livelli di fallback. Inngest ritenterà.`,
  );
}

/**
 * Parse extraction response with maximum resilience.
 */
function parseExtractionResponse(content: string, chunkLabel?: string): ExtractionResponse {
  const label = `parse:${chunkLabel ?? 'unknown'}`;
  const parsed = safeJsonParse(content, label);
  const raw = parsed.value as Record<string, unknown>;
  // partialRecovery: il JSON è stato riparato/recuperato (non parse pulito) → la
  // coda incompleta può essere stata scartata. Gli eventi sono flaggati per la
  // verifica del perito e un warning doc-level risale fino a process-case.
  const partialRecovery = parsed.recovered;

  // Find events array — try multiple key names
  let rawEvents: unknown[] | null = null;
  for (const key of ['events', 'Events', 'eventi', 'EVENTS']) {
    if (Array.isArray(raw[key])) {
      rawEvents = raw[key] as unknown[];
      break;
    }
  }

  // Search all keys for array with event-like objects
  if (!rawEvents) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        const first = value[0] as Record<string, unknown>;
        if ('eventDate' in first || 'title' in first || 'description' in first) {
          rawEvents = value as unknown[];
          logger.info('extraction', ` Found events under key "${key}"`);
          break;
        }
      }
    }
  }

  if (!rawEvents || rawEvents.length === 0) {
    // GDPR Art.9: le chiavi JSON sono strutturali (safe); il content grezzo NO
    // (può contenere nomi/diagnosi) → logghiamo solo le chiavi + la lunghezza.
    logger.error('extraction', `No events found. Keys: ${Object.keys(raw).join(', ')} (${content.length} chars)`);
    return { events: [], partialRecovery };
  }

  // Parse each event with safe defaults
  const validEvents: ExtractedEvent[] = [];
  let sentinelCopyCount = 0;
  for (const rawEvent of rawEvents) {
    const e = rawEvent as Record<string, unknown>;
    if (!e || typeof e !== 'object') continue;
    if (!('title' in e) && !('description' in e)) continue;

    // Handle missing/invalid dates — never invent dates
    // Use '1900-01-01' sentinel for missing dates (DB column is NOT NULL)
    const rawDate = e.eventDate ?? e.event_date;
    const dateStr = rawDate != null ? String(rawDate).trim() : '';
    const isDateMissing = !dateStr || dateStr === '1900-01-01' || dateStr === 'null' || dateStr === 'undefined';
    const normalizedDate = isDateMissing ? '1900-01-01' : normalizeDateFormat(dateStr);
    const eventDate = normalizedDate ?? '1900-01-01';
    const isDateInvalid = !isDateMissing && normalizedDate === null;
    const datePrecision = (isDateMissing || isDateInvalid)
      ? 'sconosciuta'
      : String(e.datePrecision ?? e.date_precision ?? 'sconosciuta');

    // Sentinel detection: nullify fields where LLM copied placeholder values from example
    const rawDiagnosis = e.diagnosis != null ? String(e.diagnosis) : null;
    const rawDoctor = e.doctor != null ? String(e.doctor) : null;
    const rawFacility = e.facility != null ? String(e.facility) : null;
    const diagnosis = rawDiagnosis && isSentinelValue(rawDiagnosis) ? null : rawDiagnosis;
    const doctor = rawDoctor && isSentinelValue(rawDoctor) ? null : rawDoctor;
    const facility = rawFacility && isSentinelValue(rawFacility) ? null : rawFacility;
    if (diagnosis !== rawDiagnosis || doctor !== rawDoctor || facility !== rawFacility) {
      sentinelCopyCount++;
    }

    validEvents.push({
      eventDate,
      datePrecision,
      eventType: String(e.eventType ?? e.event_type ?? 'altro'),
      title: String(e.title ?? 'Evento clinico'),
      description: String(e.description ?? ''),
      sourceType: String(e.sourceType ?? e.source_type ?? 'altro'),
      diagnosis,
      doctor,
      facility,
      confidence: typeof e.confidence === 'number' ? Math.min(100, Math.max(0, e.confidence)) : 70,
      requiresVerification: (isDateMissing || isDateInvalid) ? true : Boolean(e.requiresVerification ?? e.requires_verification ?? false),
      reliabilityNotes: isDateMissing
        ? (e.reliabilityNotes != null ? `${String(e.reliabilityNotes)} | Data non presente nel documento originale` : 'Data non presente nel documento originale')
        : isDateInvalid
          ? (e.reliabilityNotes != null ? `${String(e.reliabilityNotes)} | Formato data non valido nel documento: "${dateStr}"` : `Formato data non valido nel documento: "${dateStr}"`)
          : (e.reliabilityNotes != null ? String(e.reliabilityNotes) : null),
      sourceText: String(e.sourceText ?? e.source_text ?? ''),
      sourcePages: Array.isArray(e.sourcePages ?? e.source_pages) ? ((e.sourcePages ?? e.source_pages) as number[]) : [1],
    });
  }

  if (sentinelCopyCount > 0) {
    logger.warn('extraction', `Detected ${sentinelCopyCount} events with sentinel/placeholder values copied from example — nullified`);
  }

  // Validazione al confine (no cast cieco su output LLM): tieni solo le voci
  // {abbreviation, expansion} valide. Un raw.abbreviations malformato (stringa,
  // oggetti monchi) altrimenti farebbe crashare lo spread/dedup a valle.
  const rawAbbr = raw.abbreviations;
  const abbreviations: Array<{ abbreviation: string; expansion: string }> | undefined = Array.isArray(rawAbbr)
    ? rawAbbr.filter((a): a is { abbreviation: string; expansion: string } => {
        const o = a as Record<string, unknown> | null;
        return !!o && typeof o === 'object' && typeof o.abbreviation === 'string' && typeof o.expansion === 'string';
      })
    : undefined;
  logger.info('extraction', ` Parsed ${validEvents.length}/${rawEvents.length} events`);
  // partialRecovery propagato: il flagging degli eventi (requiresVerification + nota)
  // avviene in extractEventsFromChunk DOPO i transform, così non viene sovrascritto.
  return { events: validEvents, abbreviations, partialRecovery };
}

// ── Date format normalization ──

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const EURO_DATE_REGEX = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;

/**
 * True only for a REAL calendar date. A format-only check is not enough: an
 * invalid date like "2024-02-31" or "2024-13-01" would either silently roll
 * over via `new Date()` ("2024-02-31" → 2024-03-02) or become an Invalid Date
 * → NaN day-counts in the ITT/ITP calculations downstream. We reject it so the
 * caller stores the sentinel (a flagged "data non documentata") instead of a
 * silently-wrong date.
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // AUDIT 2026-07-16: bound di PLAUSIBILITÀ sull'anno. Una data OCR-misread
  // (es. "2014"→"2074" o "1014") è un calendario valido ma entrerebbe nei FATTI
  // deterministici del report gonfiando i calcoli ITT. Range: 1900 .. anno+1
  // (una prenotazione può essere di pochi mesi nel futuro).
  if (year < 1900 || year > new Date().getUTCFullYear() + 1) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/**
 * Normalize a date string to ISO YYYY-MM-DD format.
 * Accepts: YYYY-MM-DD (pass-through), DD.MM.YYYY, DD/MM/YYYY.
 * Returns null if the format is unrecognizable OR the date is not a real
 * calendar date — caller should use the sentinel.
 */
export function normalizeDateFormat(dateStr: string): string | null {
  // Already ISO format — but still validate it is a REAL date (format ≠ valid).
  const isoMatch = dateStr.match(ISO_DATE_REGEX);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isRealCalendarDate(y, m, d)) return dateStr;
    logger.warn('extraction', `ISO date out of calendar range: "${dateStr}" — using sentinel`);
    return null;
  }

  // European format: DD.MM.YYYY or DD/MM/YYYY
  const euroMatch = dateStr.match(EURO_DATE_REGEX);
  if (euroMatch) {
    const day = euroMatch[1].padStart(2, '0');
    const month = euroMatch[2].padStart(2, '0');
    const year = euroMatch[3];
    if (isRealCalendarDate(parseInt(year, 10), parseInt(month, 10), parseInt(day, 10))) {
      return `${year}-${month}-${day}`;
    }
  }

  // Unrecognizable / invalid date
  logger.warn('extraction', `Unrecognizable or invalid date: "${dateStr}" — using sentinel`);
  return null;
}

// ── Post-extraction validation: verify names exist in OCR text ──

/**
 * Validate that extracted doctor/facility names actually appear in the source OCR text.
 * Prevents LLM hallucination of names that don't exist in the original document.
 * Names not found in OCR are nullified and confidence is lowered.
 */
function validateExtractedNamesAgainstOcr(
  events: ExtractedEvent[],
  ocrText: string,
): ExtractedEvent[] {
  if (!ocrText || ocrText.length === 0) return events;

  const ocrLower = ocrText.toLowerCase();
  let nullifiedCount = 0;

  const validated = events.map((event) => {
    let modified = false;
    let newDoctor = event.doctor;
    let newFacility = event.facility;
    let newConfidence = event.confidence;
    let newRequiresVerification = event.requiresVerification;
    let notes = event.reliabilityNotes;

    // Validate doctor name: must appear in OCR text (case-insensitive, word boundary)
    if (newDoctor && newDoctor.length >= 3) {
      const doctorLower = newDoctor.toLowerCase();
      // Check if at least the surname (last word, >= 3 chars) appears as whole word in OCR
      const parts = doctorLower.split(/\s+/).filter((p) => p.length >= 3);
      const surnameFound = parts.some((part) => {
        const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`).test(ocrLower);
      });
      if (!surnameFound) {
        newDoctor = null;
        newConfidence = Math.min(newConfidence, 50);
        newRequiresVerification = true;
        notes = notes
          ? `${notes} | Nome medico non riscontrato nel documento originale — rimosso per verifica`
          : 'Nome medico non riscontrato nel documento originale — rimosso per verifica';
        modified = true;
      }
    }

    // Validate facility name: must appear in OCR text (case-insensitive, word boundary)
    if (newFacility && newFacility.length >= 4) {
      const facilityLower = newFacility.toLowerCase();
      // Check if the main keyword (>= 4 chars) appears as whole word in OCR
      const parts = facilityLower.split(/\s+/).filter((p) => p.length >= 4);
      const facilityFound = parts.some((part) => {
        const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`).test(ocrLower);
      });
      if (!facilityFound) {
        newFacility = null;
        newConfidence = Math.min(newConfidence, 50);
        newRequiresVerification = true;
        notes = notes
          ? `${notes} | Nome struttura non riscontrato nel documento originale — rimosso per verifica`
          : 'Nome struttura non riscontrato nel documento originale — rimosso per verifica';
        modified = true;
      }
    }

    if (modified) {
      nullifiedCount++;
      return {
        ...event,
        doctor: newDoctor,
        facility: newFacility,
        confidence: newConfidence,
        requiresVerification: newRequiresVerification,
        reliabilityNotes: notes,
      };
    }
    return event;
  });

  if (nullifiedCount > 0) {
    // GDPR (.claude/rules/security.md): MAI loggare i nomi propri (medico/struttura
    // SONO dati personali). Solo conteggi aggregati. Il nome non riscontrato nell'OCR
    // viene azzerato (anti-hallucination) e reliabilityNotes porta solo una nota
    // generica: il nome NON viene conservato — coerente col non doverlo loggare.
    const doctorNullified = validated.filter((v, i) => events[i].doctor && !v.doctor).length;
    const facilityNullified = validated.filter((v, i) => events[i].facility && !v.facility).length;
    logger.warn('extraction', `Name validation: ${nullifiedCount}/${events.length} events had names not in OCR. Nullified medico=${doctorNullified}, struttura=${facilityNullified}`);
  }

  return validated;
}

// ── Sentinel value detection (prevent LLM from copying example placeholders) ──

const SENTINEL_PATTERNS = [
  /PLACEHOLDER/i, /NON_COPIARE/i, /ESEMPIO_FITTIZIO/i,
  /NOME_ESEMPIO/i, /STRUTTURA_PLACEHOLDER/i, /DIAGNOSI_PLACEHOLDER/i,
];

function isSentinelValue(value: string): boolean {
  return SENTINEL_PATTERNS.some((p) => p.test(value));
}

