import { describe, it, expect } from 'vitest';
import {
  capEventsFromLowQualityPages,
  buildLowQualityPageSet,
  LOW_QUALITY_PAGE_CONFIDENCE_CAP,
} from './low-quality-page-guard';

interface TestEvent {
  title: string;
  confidence: number;
  requiresVerification: boolean;
  reliabilityNotes?: string | null;
  sourcePages?: number[];
}

const makeEvent = (overrides: Partial<TestEvent> = {}): TestEvent => ({
  title: 'Visita ortopedica',
  confidence: 90,
  requiresVerification: false,
  reliabilityNotes: null,
  sourcePages: [3],
  ...overrides,
});

describe('low-quality-page-guard — buildLowQualityPageSet', () => {
  it('should collect pages below the quality threshold', () => {
    const pages = [
      { page_number: 1, ocr_confidence: 95 },
      { page_number: 2, ocr_confidence: 42 },
      { page_number: 3, ocr_confidence: 60 },
    ];
    const set = buildLowQualityPageSet(pages);
    expect(set.has(2)).toBe(true);
    expect(set.has(1)).toBe(false);
    // la soglia stessa NON è "sotto soglia"
    expect(set.has(3)).toBe(false);
  });

  it('should ignore pages with null/undefined confidence (legacy rows)', () => {
    const pages = [
      { page_number: 1, ocr_confidence: null },
      { page_number: 2 },
    ];
    const set = buildLowQualityPageSet(pages);
    expect(set.size).toBe(0);
  });
});

describe('low-quality-page-guard — capEventsFromLowQualityPages', () => {
  it('should cap confidence and flag events sourced from a low-quality page', () => {
    const events = [makeEvent({ confidence: 88, sourcePages: [2] })];
    const result = capEventsFromLowQualityPages(events, new Set([2]));
    expect(result.cappedCount).toBe(1);
    expect(result.events[0].confidence).toBe(LOW_QUALITY_PAGE_CONFIDENCE_CAP);
    expect(result.events[0].requiresVerification).toBe(true);
    expect(result.events[0].reliabilityNotes).toContain('[AUTO]');
    expect(result.events[0].reliabilityNotes).toContain('bassa qualità');
  });

  it('should not raise a confidence already below the cap', () => {
    const events = [makeEvent({ confidence: 20, sourcePages: [2] })];
    const result = capEventsFromLowQualityPages(events, new Set([2]));
    expect(result.events[0].confidence).toBe(20);
    expect(result.cappedCount).toBe(1); // comunque flaggato
  });

  it('should leave events from clean pages untouched (immutably)', () => {
    const original = makeEvent({ confidence: 88, sourcePages: [1] });
    const result = capEventsFromLowQualityPages([original], new Set([2]));
    expect(result.cappedCount).toBe(0);
    expect(result.events[0]).toBe(original); // stesso riferimento: nessuna copia inutile
    expect(original.confidence).toBe(88);
  });

  it('should cap when ANY source page is low quality', () => {
    const events = [makeEvent({ sourcePages: [1, 4] })];
    const result = capEventsFromLowQualityPages(events, new Set([4]));
    expect(result.cappedCount).toBe(1);
  });

  it('should not touch events without sourcePages', () => {
    const events = [makeEvent({ sourcePages: undefined })];
    const result = capEventsFromLowQualityPages(events, new Set([1, 2, 3]));
    expect(result.cappedCount).toBe(0);
  });

  it('should append to existing reliability notes, not overwrite them', () => {
    const events = [makeEvent({ sourcePages: [2], reliabilityNotes: 'Nota esistente' })];
    const result = capEventsFromLowQualityPages(events, new Set([2]));
    expect(result.events[0].reliabilityNotes).toContain('Nota esistente');
    expect(result.events[0].reliabilityNotes).toContain('[AUTO]');
  });

  it('should not duplicate the note on double application (idempotente)', () => {
    const events = [makeEvent({ sourcePages: [2] })];
    const once = capEventsFromLowQualityPages(events, new Set([2]));
    const twice = capEventsFromLowQualityPages(once.events, new Set([2]));
    const occurrences = (twice.events[0].reliabilityNotes ?? '').split('[AUTO]').length - 1;
    expect(occurrences).toBe(1);
  });

  it('should be a no-op with an empty low-quality set', () => {
    const events = [makeEvent(), makeEvent({ sourcePages: [7] })];
    const result = capEventsFromLowQualityPages(events, new Set());
    expect(result.cappedCount).toBe(0);
    expect(result.events).toHaveLength(2);
  });
});
