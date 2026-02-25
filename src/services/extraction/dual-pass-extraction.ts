import { extractEventsFromDocument } from './extraction-service';
import type { ExtractionParams } from './extraction-service';
import type { ExtractedEvent } from './extraction-schemas';
import { isSimilarEvent } from '../consolidation/event-consolidator';

type ExtractionPass = 'both' | 'pass1_only' | 'pass2_only';

export interface DualPassEvent extends ExtractedEvent {
  extractionPass: ExtractionPass;
}

export interface DualPassResult {
  events: DualPassEvent[];
  abbreviations?: Array<{ abbreviation: string; expansion: string }>;
}

const PASS2_EXTRA_INSTRUCTION = `

ATTENZIONE SPECIALE — SECONDA PASSATA DI VERIFICA:
Cerca con particolare cura:
- Eventi INDIRETTI: riferimenti ad accertamenti precedenti, anamnesi, storia clinica pregressa
- Dati in TABELLE: valori di laboratorio, parametri vitali tabulati, scale di valutazione
- Testo MANOSCRITTO: annotazioni, note a margine, firme con commenti
- Eventi impliciti: date di ricovero/dimissione deducibili dal contesto, durate terapie
- Informazioni negli HEADER/FOOTER: intestazioni con struttura/reparto, date documento
Non omettere NULLA, anche se sembra marginale.`;

/**
 * Run two extraction passes in parallel and reconcile results.
 *
 * Pass 1: temperature 0.1 (precise extraction)
 * Pass 2: temperature 0.3 + extra prompt for indirect events/tables/handwriting
 *
 * Reconciliation:
 * - Events found in both passes → extractionPass = 'both', confidence +10 (cap 100)
 * - Only in pass 1 → extractionPass = 'pass1_only'
 * - Only in pass 2 → extractionPass = 'pass2_only', requiresVerification = true, confidence -15 (min 10)
 * - If one pass fails → use the other
 */
export async function extractEventsWithDualPass(
  params: Omit<ExtractionParams, 'temperature'>,
): Promise<DualPassResult> {
  const pass1Params: ExtractionParams = {
    ...params,
    temperature: 0.1,
  };

  const pass2Params: ExtractionParams = {
    ...params,
    documentText: params.documentText + PASS2_EXTRA_INSTRUCTION,
    temperature: 0.3,
  };

  const [pass1Result, pass2Result] = await Promise.allSettled([
    extractEventsFromDocument(pass1Params),
    extractEventsFromDocument(pass2Params),
  ]);

  const pass1Events = pass1Result.status === 'fulfilled' ? pass1Result.value.events : [];
  const pass2Events = pass2Result.status === 'fulfilled' ? pass2Result.value.events : [];

  // Collect abbreviations from both passes
  const allAbbreviations: Array<{ abbreviation: string; expansion: string }> = [];
  if (pass1Result.status === 'fulfilled' && pass1Result.value.abbreviations) {
    allAbbreviations.push(...pass1Result.value.abbreviations);
  }
  if (pass2Result.status === 'fulfilled' && pass2Result.value.abbreviations) {
    allAbbreviations.push(...pass2Result.value.abbreviations);
  }

  // If one pass failed entirely, return the other
  if (pass1Events.length === 0 && pass2Events.length === 0) {
    return { events: [], abbreviations: deduplicateAbbreviations(allAbbreviations) };
  }

  if (pass1Events.length === 0) {
    return {
      events: pass2Events.map((e) => ({
        ...e,
        extractionPass: 'pass2_only' as ExtractionPass,
        requiresVerification: true,
        confidence: Math.max(e.confidence - 15, 10),
      })),
      abbreviations: deduplicateAbbreviations(allAbbreviations),
    };
  }

  if (pass2Events.length === 0) {
    return {
      events: pass1Events.map((e) => ({
        ...e,
        extractionPass: 'pass1_only' as ExtractionPass,
      })),
      abbreviations: deduplicateAbbreviations(allAbbreviations),
    };
  }

  // Both passes produced results — reconcile
  const reconciledEvents = reconcilePasses(pass1Events, pass2Events);

  return {
    events: reconciledEvents,
    abbreviations: deduplicateAbbreviations(allAbbreviations),
  };
}

/**
 * Match events between two passes using date + type + similarity.
 * Similar to isSimilarEvent from event-consolidator but also checks sourcePages overlap.
 */
function reconcilePasses(
  pass1Events: ExtractedEvent[],
  pass2Events: ExtractedEvent[],
): DualPassEvent[] {
  const result: DualPassEvent[] = [];
  const pass2Matched = new Set<number>();

  for (const p1Event of pass1Events) {
    let matchedIdx = -1;

    for (let j = 0; j < pass2Events.length; j++) {
      if (pass2Matched.has(j)) continue;

      const p2Event = pass2Events[j];

      if (
        p1Event.eventDate === p2Event.eventDate &&
        p1Event.eventType === p2Event.eventType &&
        (isSimilarEvent(p1Event, p2Event) || hasSourcePagesOverlap(p1Event, p2Event))
      ) {
        matchedIdx = j;
        break;
      }
    }

    if (matchedIdx >= 0) {
      // Found in both passes — boost confidence
      pass2Matched.add(matchedIdx);
      result.push({
        ...p1Event,
        extractionPass: 'both',
        confidence: Math.min(p1Event.confidence + 10, 100),
      });
    } else {
      // Only in pass 1
      result.push({
        ...p1Event,
        extractionPass: 'pass1_only',
      });
    }
  }

  // Events only in pass 2
  for (let j = 0; j < pass2Events.length; j++) {
    if (pass2Matched.has(j)) continue;

    const p2Event = pass2Events[j];
    result.push({
      ...p2Event,
      extractionPass: 'pass2_only',
      requiresVerification: true,
      confidence: Math.max(p2Event.confidence - 15, 10),
    });
  }

  return result;
}

/**
 * Check if two events share at least one source page.
 */
function hasSourcePagesOverlap(a: ExtractedEvent, b: ExtractedEvent): boolean {
  if (!a.sourcePages || !b.sourcePages) return false;
  return a.sourcePages.some((page) => b.sourcePages.includes(page));
}

/**
 * Remove duplicate abbreviations, keeping the first occurrence.
 */
function deduplicateAbbreviations(
  abbreviations: Array<{ abbreviation: string; expansion: string }>,
): Array<{ abbreviation: string; expansion: string }> {
  const seen = new Set<string>();
  return abbreviations.filter((abbr) => {
    const key = abbr.abbreviation.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
