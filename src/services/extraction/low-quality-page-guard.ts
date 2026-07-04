/**
 * Guard deterministico: eventi estratti da pagine OCR di bassa qualità
 * non possono presentarsi come affidabili.
 *
 * Stessa filosofia del cap 25% sulle date inferite: MAI perdere un fatto
 * (l'evento resta), ma la confidenza viene cappata e l'evento marcato
 * requiresVerification, così il perito lo vede nel flusso di revisione.
 * Complementare al gate [ILLEGGIBILE] a monte (page-quality.ts): quello
 * rimuove le parole irrecuperabili, questo declassa ciò che è stato letto
 * su pagine comunque inaffidabili.
 */

import { PAGE_LOW_QUALITY_THRESHOLD } from '@/services/ocr/page-quality';

/** Confidenza massima per un evento proveniente da una pagina sotto soglia. */
export const LOW_QUALITY_PAGE_CONFIDENCE_CAP = 40;

const LOW_QUALITY_NOTE =
  '[AUTO] Pagina OCR di bassa qualità: contenuto da verificare sul documento originale';

interface PageQualityRow {
  page_number: number;
  ocr_confidence?: number | null;
}

/** Pagine (numeri assoluti nel documento) con qualità OCR sotto soglia. */
export function buildLowQualityPageSet(pages: PageQualityRow[]): Set<number> {
  const set = new Set<number>();
  for (const page of pages) {
    if (typeof page.ocr_confidence === 'number' && page.ocr_confidence < PAGE_LOW_QUALITY_THRESHOLD) {
      set.add(page.page_number);
    }
  }
  return set;
}

interface CappableEvent {
  confidence: number;
  requiresVerification: boolean;
  reliabilityNotes?: string | null;
  sourcePages?: number[];
}

export interface LowQualityCapResult<T> {
  events: T[];
  cappedCount: number;
}

/**
 * Cappa la confidenza degli eventi con almeno una sourcePage di bassa qualità.
 * Immutabile (nuovi oggetti solo dove serve) e idempotente (nota non duplicata).
 */
export function capEventsFromLowQualityPages<T extends CappableEvent>(
  events: T[],
  lowQualityPages: ReadonlySet<number>,
): LowQualityCapResult<T> {
  if (lowQualityPages.size === 0) return { events, cappedCount: 0 };

  let cappedCount = 0;
  const result = events.map((event) => {
    const pages = event.sourcePages ?? [];
    if (!pages.some((p) => lowQualityPages.has(p))) return event;

    cappedCount += 1;
    const existingNotes = event.reliabilityNotes ?? '';
    const notes = existingNotes.includes(LOW_QUALITY_NOTE)
      ? existingNotes
      : existingNotes.length > 0
        ? `${existingNotes} | ${LOW_QUALITY_NOTE}`
        : LOW_QUALITY_NOTE;

    return {
      ...event,
      confidence: Math.min(event.confidence, LOW_QUALITY_PAGE_CONFIDENCE_CAP),
      requiresVerification: true,
      reliabilityNotes: notes,
    };
  });

  return { events: result, cappedCount };
}
