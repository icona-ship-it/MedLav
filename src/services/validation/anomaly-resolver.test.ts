import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAnomalies, filterUnresolvedAnomalies } from './anomaly-resolver';
import type { OcrPageFetcher, ResolvedAnomaly } from './anomaly-resolver';
import type { DetectedAnomaly } from './anomaly-detector';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

// Mock Mistral client
vi.mock('@/lib/mistral/client', () => ({
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  TIMEOUT_DEFAULT: 120_000,
  DETERMINISTIC_SEED: 42,
  streamMistralChat: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { streamMistralChat } from '@/lib/mistral/client';

const mockStreamMistralChat = vi.mocked(streamMistralChat);

function makeAnomaly(overrides?: Partial<DetectedAnomaly>): DetectedAnomaly {
  return {
    anomalyType: 'ritardo_diagnostico',
    severity: 'media',
    description: 'Ritardo diagnostico di 120 giorni.',
    involvedEvents: [
      { eventId: null, orderNumber: 1, date: '2024-01-15', title: 'Prima visita' },
      { eventId: null, orderNumber: 3, date: '2024-05-15', title: 'Diagnosi' },
    ],
    suggestion: 'Valutare ritardo',
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<ConsolidatedEvent>): ConsolidatedEvent {
  return {
    orderNumber: 1,
    documentId: 'doc-1',
    eventDate: '2024-01-15',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Prima visita',
    description: 'Visita al PS',
    sourceType: 'cartella_clinica',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 0.9,
    requiresVerification: false,
    reliabilityNotes: null,
    discrepancyNote: null,
    sourceText: 'testo originale',
    sourcePages: [1, 2],
    ...overrides,
  } as ConsolidatedEvent;
}

function makeFetcher(texts: Map<string, string>): OcrPageFetcher {
  return async () => texts;
}

describe('resolveAnomalies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array for empty anomalies', async () => {
    const result = await resolveAnomalies([], [], makeFetcher(new Map()));
    expect(result).toHaveLength(0);
  });

  it('should resolve anomaly when LLM finds explicit evidence', async () => {
    mockStreamMistralChat.mockResolvedValueOnce(JSON.stringify({
      resolved: true,
      confidence: 0.95,
      evidence: 'Diagnosi formulata il 20/01/2024 nel referto.',
      reasoning: 'Il testo OCR contiene una diagnosi precedente.',
    }));

    const anomalies = [makeAnomaly()];
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-1', sourcePages: [1] }),
      makeEvent({ orderNumber: 3, documentId: 'doc-1', sourcePages: [3] }),
    ];
    const fetcher = makeFetcher(new Map([['doc-1:1', 'Diagnosi formulata il 20/01/2024 nel referto.']]));

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result).toHaveLength(1);
    expect(result[0].resolution?.resolved).toBe(true);
    expect(result[0].resolution?.confidence).toBe(0.95);
  });

  it('should confirm anomaly when LLM finds no evidence', async () => {
    mockStreamMistralChat.mockResolvedValueOnce(JSON.stringify({
      resolved: false,
      confidence: 0.9,
      evidence: '',
      reasoning: 'Nessuna evidenza di diagnosi precedente nel testo OCR.',
    }));

    const anomalies = [makeAnomaly()];
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-1', sourcePages: [1] }),
      makeEvent({ orderNumber: 3, documentId: 'doc-1', sourcePages: [3] }),
    ];
    const fetcher = makeFetcher(new Map([['doc-1:1', 'Solo testo generico.']]));

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result).toHaveLength(1);
    expect(result[0].resolution?.resolved).toBe(false);
  });

  it('should be conservative: low confidence resolution is NOT resolved', async () => {
    mockStreamMistralChat.mockResolvedValueOnce(JSON.stringify({
      resolved: true,
      confidence: 0.5, // Below threshold
      evidence: 'Forse c\'è un referto...',
      reasoning: 'Debole evidenza.',
    }));

    const anomalies = [makeAnomaly()];
    const events = [makeEvent({ orderNumber: 1, sourcePages: [1] })];
    const fetcher = makeFetcher(new Map([['doc-1:1', 'testo']]));

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result[0].resolution?.resolved).toBe(false);
  });

  it('should handle JSON parse errors conservatively', async () => {
    mockStreamMistralChat.mockResolvedValueOnce('this is not json');

    const anomalies = [makeAnomaly()];
    const events = [makeEvent({ orderNumber: 1, sourcePages: [1] })];
    const fetcher = makeFetcher(new Map([['doc-1:1', 'testo']]));

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result[0].resolution?.resolved).toBe(false);
    expect(result[0].resolution?.reasoning).toContain('parse');
  });

  it('should handle LLM call failure conservatively', async () => {
    mockStreamMistralChat.mockRejectedValueOnce(new Error('API timeout'));

    const anomalies = [makeAnomaly()];
    const events = [makeEvent({ orderNumber: 1, sourcePages: [1] })];
    const fetcher = makeFetcher(new Map([['doc-1:1', 'testo']]));

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result[0].resolution).toBeNull();
  });

  it('should skip anomalies with no matching events', async () => {
    const anomalies = [makeAnomaly({
      involvedEvents: [
        { eventId: null, orderNumber: 99, date: '2024-01-01', title: 'Ghost event' },
      ],
    })];
    const events = [makeEvent({ orderNumber: 1 })]; // No orderNumber 99
    const fetcher = makeFetcher(new Map());

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result[0].resolution?.resolved).toBe(false);
    expect(result[0].resolution?.reasoning).toContain('No involved events');
    expect(mockStreamMistralChat).not.toHaveBeenCalled();
  });

  it('should skip anomalies with no source pages', async () => {
    const anomalies = [makeAnomaly()];
    const events = [
      makeEvent({ orderNumber: 1, sourcePages: [], documentId: '' }),
      makeEvent({ orderNumber: 3, sourcePages: [], documentId: '' }),
    ];
    const fetcher = makeFetcher(new Map());

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result[0].resolution?.resolved).toBe(false);
    expect(mockStreamMistralChat).not.toHaveBeenCalled();
  });

  it('should prioritize high-severity anomalies when exceeding max', async () => {
    // Create 12 anomalies: 2 critica, 5 alta, 5 bassa
    const anomalies: DetectedAnomaly[] = [
      ...Array.from({ length: 2 }, () => makeAnomaly({ severity: 'critica' })),
      ...Array.from({ length: 5 }, () => makeAnomaly({ severity: 'alta' })),
      ...Array.from({ length: 5 }, () => makeAnomaly({ severity: 'bassa' })),
    ];

    // All will return confirmed
    mockStreamMistralChat.mockResolvedValue(JSON.stringify({
      resolved: false, confidence: 0.9, evidence: '', reasoning: 'No evidence',
    }));

    const events = [
      makeEvent({ orderNumber: 1, sourcePages: [1] }),
      makeEvent({ orderNumber: 3, sourcePages: [3] }),
    ];
    const fetcher = makeFetcher(new Map([['doc-1:1', 'testo'], ['doc-1:3', 'testo']]));

    const result = await resolveAnomalies(anomalies, events, fetcher);

    // Should have called LLM for max 10
    expect(mockStreamMistralChat).toHaveBeenCalledTimes(10);
    // 2 remaining anomalies should have null resolution (skipped)
    const skipped = result.filter((r) => r.resolution === null);
    expect(skipped.length).toBe(2);
    // Skipped ones should be bassa severity
    expect(skipped.every((r) => r.severity === 'bassa')).toBe(true);
  });

  it('should clamp confidence to [0, 1]', async () => {
    mockStreamMistralChat.mockResolvedValueOnce(JSON.stringify({
      resolved: true,
      confidence: 5.0, // Out of range
      evidence: 'found it',
      reasoning: 'high confidence',
    }));

    const anomalies = [makeAnomaly()];
    const events = [makeEvent({ orderNumber: 1, sourcePages: [1] })];
    const fetcher = makeFetcher(new Map([['doc-1:1', 'testo']]));

    const result = await resolveAnomalies(anomalies, events, fetcher);

    expect(result[0].resolution?.confidence).toBe(1);
  });
});

describe('filterUnresolvedAnomalies', () => {
  it('should filter out resolved anomalies', () => {
    const resolved: ResolvedAnomaly[] = [
      {
        ...makeAnomaly(),
        resolution: { anomalyIndex: 0, resolved: true, confidence: 0.95, evidence: 'found', reasoning: 'ok' },
      },
      {
        ...makeAnomaly({ anomalyType: 'gap_documentale' }),
        resolution: { anomalyIndex: 1, resolved: false, confidence: 0.9, evidence: '', reasoning: 'no' },
      },
      {
        ...makeAnomaly({ anomalyType: 'complicanza_non_gestita' }),
        resolution: null,
      },
    ];

    const filtered = filterUnresolvedAnomalies(resolved);

    expect(filtered).toHaveLength(2);
    expect(filtered[0].anomalyType).toBe('gap_documentale');
    expect(filtered[1].anomalyType).toBe('complicanza_non_gestita');
  });

  it('should return all anomalies when none resolved', () => {
    const resolved: ResolvedAnomaly[] = [
      {
        ...makeAnomaly(),
        resolution: { anomalyIndex: 0, resolved: false, confidence: 0.9, evidence: '', reasoning: 'no' },
      },
    ];

    const filtered = filterUnresolvedAnomalies(resolved);
    expect(filtered).toHaveLength(1);
  });

  it('should return empty when all resolved', () => {
    const resolved: ResolvedAnomaly[] = [
      {
        ...makeAnomaly(),
        resolution: { anomalyIndex: 0, resolved: true, confidence: 0.95, evidence: 'found', reasoning: 'yes' },
      },
    ];

    const filtered = filterUnresolvedAnomalies(resolved);
    expect(filtered).toHaveLength(0);
  });
});
