/**
 * LLM-based anomaly resolution service.
 * For each detected anomaly, reads the source OCR pages and asks Mistral Large
 * whether there is EXPLICIT evidence in the text that resolves the anomaly.
 * Ultra-conservative: only resolves with literal, explicit evidence.
 */

import {
  MISTRAL_MODELS,
  streamMistralChat,
  TIMEOUT_DEFAULT,
  DETERMINISTIC_SEED,
  assertNotTruncated,
} from '@/lib/mistral/client';
import type { DetectedAnomaly } from './anomaly-detector';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { isCitationGrounded } from './source-text-verifier';
import { logger } from '@/lib/logger';

/**
 * JSON schema for the resolution response. json_schema (vs plain json_object)
 * makes the provider enforce the SHAPE (keys + types), not just valid JSON.
 * parseResolutionResponse is still kept as a defensive net.
 */
const RESOLUTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    resolved: { type: 'boolean' },
    confidence: { type: 'number' },
    evidence: { type: 'string' },
    reasoning: { type: 'string' },
  },
  required: ['resolved', 'confidence', 'evidence', 'reasoning'],
  additionalProperties: false,
};

export interface AnomalyResolution {
  anomalyIndex: number;
  resolved: boolean;
  confidence: number;
  evidence: string;
  reasoning: string;
  /** LLM token usage of the resolution call (absent for short-circuited rules). */
  usage?: TokenUsage;
}

export interface ResolvedAnomaly extends DetectedAnomaly {
  resolution: AnomalyResolution | null;
}

/** Max anomalies to resolve per run (skip low-severity if exceeded).
 * Audit P1-VAL-004: raised 5 → 25. Complex ICU/oncology cases can have 15-20
 * clinical anomalies. Parallel resolution (inside resolveAnomaliesWithLLM)
 * keeps wall time under Vercel 800s. Marginal cost ~€0.013 per resolution. */
const MAX_ANOMALIES_PER_RUN = 25;
/** Max OCR chars per anomaly to send to LLM. */
const MAX_OCR_CHARS = 5000;

/**
 * Resolve anomalies by checking source OCR pages for explicit evidence.
 * Returns the same anomalies array with resolution metadata attached.
 *
 * @param anomalies - Detected anomalies from the algorithmic detector
 * @param allEvents - All consolidated events (for documentId + sourcePages lookup)
 * @param fetchOcrPages - Function to fetch OCR text for given document/page combos
 */
export async function resolveAnomalies(
  anomalies: DetectedAnomaly[],
  allEvents: ConsolidatedEvent[],
  fetchOcrPages: OcrPageFetcher,
): Promise<ResolvedAnomaly[]> {
  if (anomalies.length === 0) return [];

  // Prioritize: skip low-severity if too many anomalies
  const toResolveSet = new Set(prioritizeAnomalies(anomalies));

  // Resolve ALL selected anomalies in parallel — the Mistral semaphore (capacity 10)
  // inside the client.ts serializes actual HTTP calls, so 25 parallel anomalies
  // resolve in ~25/10 × ~60s = ~150s wall time, well under Vercel 800s.
  const settled = await Promise.allSettled(
    anomalies.map((anomaly, i) => {
      if (!toResolveSet.has(i)) return Promise.resolve(null);
      return resolveOneAnomaly(anomaly, i, allEvents, fetchOcrPages);
    }),
  );

  const results: ResolvedAnomaly[] = anomalies.map((anomaly, i) => {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      return { ...anomaly, resolution: outcome.value };
    }
    logger.warn('anomaly-resolver', `Failed to resolve anomaly ${i}: ${outcome.reason instanceof Error ? outcome.reason.message : 'unknown'}`);
    return { ...anomaly, resolution: null };
  });

  const resolvedCount = results.filter((r) => r.resolution?.resolved).length;
  const confirmedCount = results.filter((r) => r.resolution && !r.resolution.resolved).length;
  logger.info('anomaly-resolver', `Resolved ${resolvedCount}/${anomalies.length} anomalies, confirmed ${confirmedCount}`);

  return results;
}

/** Filter anomalies that should NOT flow into the report (resolved by LLM). */
export function filterUnresolvedAnomalies(resolved: ResolvedAnomaly[]): DetectedAnomaly[] {
  return resolved.filter((r) => !r.resolution?.resolved);
}

// ── Internals ──

/** Callback to fetch OCR text for a list of document/page pairs. */
export type OcrPageFetcher = (
  requests: Array<{ documentId: string; pageNumbers: number[] }>,
) => Promise<Map<string, string>>; // key = `${documentId}:${pageNumber}`, value = OCR text

function prioritizeAnomalies(anomalies: DetectedAnomaly[]): number[] {
  const indices = anomalies.map((_, i) => i);

  if (indices.length <= MAX_ANOMALIES_PER_RUN) return indices;

  // Sort by severity (critica > alta > media > bassa), keep top N
  const severityOrder: Record<string, number> = { critica: 0, alta: 1, media: 2, bassa: 3 };
  indices.sort((a, b) => {
    const sa = severityOrder[anomalies[a].severity] ?? 4;
    const sb = severityOrder[anomalies[b].severity] ?? 4;
    return sa - sb;
  });

  return indices.slice(0, MAX_ANOMALIES_PER_RUN);
}

async function resolveOneAnomaly(
  anomaly: DetectedAnomaly,
  anomalyIndex: number,
  allEvents: ConsolidatedEvent[],
  fetchOcrPages: OcrPageFetcher,
): Promise<AnomalyResolution> {
  // 0. HARD RULE: discordant diagnoses are NEVER auto-resolved — they are escalated
  // to the perito for evaluation (product invariant, see event-consolidator + CLAUDE.md).
  // Enforced in code (not just the prompt) and short-circuited to save the LLM call.
  if (anomaly.anomalyType === 'diagnosi_contraddittoria') {
    return {
      anomalyIndex,
      resolved: false,
      confidence: 0,
      evidence: '',
      reasoning: 'Diagnosi discordanti: la valutazione è riservata al perito in sede peritale.',
    };
  }

  // 1. Find involved events → documentId + sourcePages
  const involvedOrderNumbers = anomaly.involvedEvents.map((e) => e.orderNumber);
  const involvedEvents = allEvents.filter((e) => involvedOrderNumbers.includes(e.orderNumber));

  if (involvedEvents.length === 0) {
    return { anomalyIndex, resolved: false, confidence: 0, evidence: '', reasoning: 'No involved events found' };
  }

  // 2. Group pages by documentId
  const pageRequests = new Map<string, Set<number>>();
  for (const ev of involvedEvents) {
    if (!ev.documentId) continue;
    const existing = pageRequests.get(ev.documentId) ?? new Set();
    for (const page of ev.sourcePages) {
      existing.add(page);
    }
    pageRequests.set(ev.documentId, existing);
  }

  if (pageRequests.size === 0) {
    return { anomalyIndex, resolved: false, confidence: 0, evidence: '', reasoning: 'No source pages available' };
  }

  // 3. Fetch OCR text
  const requests = Array.from(pageRequests.entries()).map(([documentId, pages]) => ({
    documentId,
    pageNumbers: Array.from(pages).sort((a, b) => a - b),
  }));

  const ocrMap = await fetchOcrPages(requests);

  // 4. Assemble OCR context (capped at MAX_OCR_CHARS)
  let ocrContext = '';
  for (const [key, text] of ocrMap) {
    if (ocrContext.length >= MAX_OCR_CHARS) break;
    const remaining = MAX_OCR_CHARS - ocrContext.length;
    ocrContext += `\n--- Pagina ${key} ---\n${text.slice(0, remaining)}`;
  }
  ocrContext = ocrContext.trim();

  if (ocrContext.length === 0) {
    return { anomalyIndex, resolved: false, confidence: 0, evidence: '', reasoning: 'No OCR text available for source pages' };
  }

  // 5. Call Mistral Large
  const prompt = buildResolutionPrompt(anomaly, ocrContext);
  const result = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: RESOLUTION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    // 768 (was 512): evidence verbatim (cap ~400 char) + reasoning can exceed 512
    // tokens, which would trip assertNotTruncated and waste the whole call.
    maxTokens: 768,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: { name: 'anomaly_resolution', schemaDefinition: RESOLUTION_RESPONSE_SCHEMA },
    },
    timeoutMs: TIMEOUT_DEFAULT,
    randomSeed: DETERMINISTIC_SEED,
    label: `anomaly-resolve:${anomalyIndex}`,
  });
  assertNotTruncated(result, `anomaly-resolve:${anomalyIndex}`);

  // 6. Parse response + HARD-VERIFY the cited evidence against the source OCR.
  return { ...parseResolutionResponse(result.content, anomalyIndex, ocrContext), usage: result.usage };
}

function parseResolutionResponse(
  response: string,
  anomalyIndex: number,
  ocrContext: string,
): AnomalyResolution {
  try {
    const parsed = JSON.parse(response) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return { anomalyIndex, resolved: false, confidence: 0, evidence: '', reasoning: 'Invalid JSON response' };
    }

    const obj = parsed as Record<string, unknown>;
    const resolved = obj.resolved === true;
    const confidence = typeof obj.confidence === 'number' ? Math.min(Math.max(obj.confidence, 0), 1) : 0;
    const evidence = typeof obj.evidence === 'string' ? obj.evidence.slice(0, 500) : '';
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.slice(0, 500) : '';

    // Conservative: only trust resolution with high confidence
    let finalResolved = resolved && confidence >= 0.8;

    // ANTI-HALLUCINATION HARD CHECK: a resolution REMOVES an anomaly from the
    // perito's report, so the cited `evidence` MUST actually exist in the source
    // OCR. If it is paraphrased/fabricated (not grounded), degrade to confirmed —
    // never let an invented citation silently hide a real problem.
    if (finalResolved && !isCitationGrounded(evidence, ocrContext)) {
      logger.warn('anomaly-resolver', `Anomaly ${anomalyIndex}: evidence not grounded in source OCR → confirmed`);
      finalResolved = false;
      return {
        anomalyIndex,
        resolved: false,
        confidence,
        evidence,
        reasoning: 'Evidenza non riscontrata nel testo dei documenti — anomalia confermata per il perito.',
      };
    }

    return { anomalyIndex, resolved: finalResolved, confidence, evidence, reasoning };
  } catch {
    // JSON parse failed → conservative: anomaly confirmed
    return { anomalyIndex, resolved: false, confidence: 0, evidence: '', reasoning: 'Failed to parse LLM response' };
  }
}

// ── Prompts ──

const RESOLUTION_SYSTEM_PROMPT = `Sei un assistente medico-legale. Verifichi se un'anomalia rilevata algoritmicamente può essere RISOLTA leggendo SOLO la documentazione fornita. Il perito firma un atto depositabile in Tribunale: un errore ha rilievo deontologico e penale.

PRINCIPI (in ordine di priorità):
1. OUTPUT — Rispondi SOLO in JSON: {"resolved": boolean, "confidence": number, "evidence": string, "reasoning": string}.
2. SOGLIA DI PROVA — "resolved": true SOLO con evidenza ESPLICITA e LETTERALE nel testo che dimostra che l'anomalia NON sussiste. In ogni dubbio "resolved": false: è meglio un falso positivo che ignorare un problema reale. Mai dedurre, ipotizzare o inferire.
3. EVIDENZA VERBATIM — "evidence" deve essere una citazione COPIA-INCOLLA letterale dal testo (mai parafrasi, mai testo non presente). Massimo ~400 caratteri: se il passaggio è più lungo, riporta solo il frammento direttamente pertinente. Se "resolved": false, "evidence" può essere stringa vuota.
4. CONFIDENCE — numero tra 0 e 1: quanto sei sicuro della conclusione.
5. REASONING — breve spiegazione in linguaggio medico-legale. NON menzionare "OCR", "AI", "modelli linguistici" o termini di processing: usa "documentazione in atti" o "testo dei documenti".

CASO SPECIALE — "diagnosi_contraddittoria": rispondi SEMPRE "resolved": false. Le diagnosi discordanti non si risolvono automaticamente: vanno escalate al perito per la valutazione in sede peritale.`;

function buildResolutionPrompt(anomaly: DetectedAnomaly, ocrContext: string): string {
  const eventsDesc = anomaly.involvedEvents
    .map((e) => `- Evento #${e.orderNumber}: "${e.title}" (${e.date})`)
    .join('\n');

  return `## ANOMALIA DA VERIFICARE

**Tipo**: ${anomaly.anomalyType}
**Gravità**: ${anomaly.severity}
**Descrizione**: ${anomaly.description}

**Eventi coinvolti**:
${eventsDesc}

## TESTO INTEGRALE DELLE PAGINE SORGENTE DEI DOCUMENTI

${ocrContext}

## ISTRUZIONI

Cerca nei documenti sopra evidenza ESPLICITA e LETTERALE che dimostri che questa anomalia NON sussiste. Per ogni "resolved": true servono una citazione verbatim + (dove applicabile) una data.
Cosa cercare per tipo:
- ritardo_diagnostico: menzione di una diagnosi precedente non catturata dagli eventi.
- gap_post_chirurgico: menzione di un follow-up/controllo non estratto come evento.
- complicanza_non_gestita: menzione di un trattamento/gestione della complicanza non catturato.
- gap_documentale: presenza nel testo del documento/atto che risulterebbe mancante.
- consenso_non_documentato: menzione esplicita di consenso informato acquisito (data/firma).
- terapia_senza_followup: menzione di un controllo/rivalutazione successivo alla terapia.
- diagnosi_contraddittoria: NON risolvere — "resolved": false (escalation al perito).

Rispondi SOLO in JSON.`;
}
