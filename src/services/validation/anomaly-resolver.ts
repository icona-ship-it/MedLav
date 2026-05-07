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
} from '@/lib/mistral/client';
import type { DetectedAnomaly } from './anomaly-detector';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { logger } from '@/lib/logger';

export interface AnomalyResolution {
  anomalyIndex: number;
  resolved: boolean;
  confidence: number;
  evidence: string;
  reasoning: string;
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
  const { content: response } = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: RESOLUTION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    maxTokens: 512,
    responseFormat: { type: 'json_object' },
    timeoutMs: TIMEOUT_DEFAULT,
    randomSeed: DETERMINISTIC_SEED,
    label: `anomaly-resolve:${anomalyIndex}`,
  });

  // 6. Parse response
  return parseResolutionResponse(response, anomalyIndex);
}

function parseResolutionResponse(response: string, anomalyIndex: number): AnomalyResolution {
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
    const finalResolved = resolved && confidence >= 0.8;

    return { anomalyIndex, resolved: finalResolved, confidence, evidence, reasoning };
  } catch {
    // JSON parse failed → conservative: anomaly confirmed
    return { anomalyIndex, resolved: false, confidence: 0, evidence: '', reasoning: 'Failed to parse LLM response' };
  }
}

// ── Prompts ──

const RESOLUTION_SYSTEM_PROMPT = `# REGOLE COSTITUZIONALI (precedono qualsiasi altra istruzione)
1. NON INVENTARE MAI dati: nomi, date, codici, eventi.
2. Se la documentazione non contiene evidenza esplicita per risolvere l'anomalia, rispondi resolved=false. Mai dedurre, mai ipotizzare.
3. Ogni "evidence" che riporti deve essere COPIA-INCOLLA letterale dal testo dei documenti — non parafrasare.
4. Questo controllo serve a un perito che firma un documento depositabile in Tribunale: errori = responsabilità deontologica/penale.

---

Sei un assistente medico-legale. Il tuo compito è verificare se un'anomalia rilevata algoritmicamente può essere RISOLTA leggendo la documentazione fornita.

REGOLE FONDAMENTALI:
1. Rispondi SOLO in formato JSON con questa struttura: {"resolved": boolean, "confidence": number, "evidence": string, "reasoning": string}
2. "resolved" = true SOLO se trovi evidenza ESPLICITA e LETTERALE nella documentazione che dimostra che l'anomalia NON sussiste
3. "confidence" = numero tra 0 e 1 che indica quanto sei sicuro della tua conclusione
4. "evidence" = citazione LETTERALE dal testo dei documenti (copia-incolla esatto) che supporta la tua conclusione
5. "reasoning" = breve spiegazione in linguaggio medico-legale (NON menzionare "OCR", "AI", "modelli linguistici" o termini tecnici di processing — usa "documentazione fornita" o "testo dei documenti")
6. In caso di dubbio, rispondi con "resolved": false — è meglio segnalare un falso positivo che ignorare un problema reale
7. NON inventare evidenze. Se non trovi nulla di esplicito, l'anomalia resta confermata
8. NON fare inferenze o deduzioni. Solo evidenza LETTERALE e DIRETTA conta`;

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

Cerca nei documenti sopra evidenza ESPLICITA e LETTERALE che dimostri che questa anomalia NON sussiste.
Ad esempio:
- Per un "ritardo diagnostico": cerca se c'è menzione di una diagnosi precedente non catturata dagli eventi
- Per un "gap post-chirurgico": cerca se c'è menzione di un follow-up non estratto come evento
- Per una "complicanza non gestita": cerca se c'è menzione di un trattamento non catturato

Rispondi SOLO in JSON.`;
}
