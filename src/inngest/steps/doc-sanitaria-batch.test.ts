import { describe, it, expect } from 'vitest';
import { planDocSanitariaEventBatches, planDocSanitariaEventBatchesByDocument, dedupeDocumentsByContent, stripRepeatedSectionHeading, DOC_SANITARIA_EVENT_BATCH_SIZE, filterImagesForBatch } from './doc-sanitaria-batch';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';

function img(overrides?: Partial<ImageAnalysisResult>): ImageAnalysisResult {
  return { pageNumber: 1, imageType: 'radiografia', description: 'd', confidence: 0.9, storagePath: 'p', documentId: 'doc-a', ...overrides };
}

describe('filterImagesForBatch', () => {
  it('keeps only the images whose documentId is in the batch docIds', () => {
    const images = [
      img({ documentId: 'doc-a', storagePath: 'a/1.png' }),
      img({ documentId: 'doc-b', storagePath: 'b/1.png' }),
      img({ documentId: 'doc-a', storagePath: 'a/2.png' }),
    ];
    const out = filterImagesForBatch(images, ['doc-a']);
    expect(out?.map((i) => i.storagePath)).toEqual(['a/1.png', 'a/2.png']);
  });

  it('excludes images without a documentId (not attributable to a window)', () => {
    const out = filterImagesForBatch([img({ documentId: undefined })], ['doc-a']);
    expect(out).toEqual([]);
  });

  it('returns undefined when imageAnalysis is undefined', () => {
    expect(filterImagesForBatch(undefined, ['doc-a'])).toBeUndefined();
  });
});

function makeEvent(overrides?: Partial<ConsolidatedEvent>): ConsolidatedEvent {
  return {
    orderNumber: 1,
    documentId: 'doc-1',
    eventDate: '2024-03-15',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Visita ortopedica',
    description: 'Paziente visitato.',
    sourceType: 'referto_controllo',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 90,
    requiresVerification: false,
    reliabilityNotes: null,
    sourceText: 'x',
    sourcePages: [1],
    discrepancyNote: null,
    ...overrides,
  };
}

describe('planDocSanitariaEventBatches', () => {
  it('returns no batches for an empty event list', () => {
    expect(planDocSanitariaEventBatches([], 50)).toEqual([]);
  });

  it('puts every event in exactly one batch (no loss, no duplication)', () => {
    const events = Array.from({ length: 217 }, (_, i) => makeEvent({ orderNumber: i + 1 })); // il caso Lavini
    const batches = planDocSanitariaEventBatches(events, 50);
    const flat = batches.flatMap((b) => b.events);
    expect(flat).toEqual(events);
    expect(batches.length).toBe(5); // 50+50+50+50+17
  });

  it('preserves chronological order across and within batches', () => {
    const events = Array.from({ length: 120 }, (_, i) =>
      makeEvent({ orderNumber: i + 1, eventDate: `2024-01-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
    const batches = planDocSanitariaEventBatches(events, 50);
    const flatOrders = batches.flatMap((b) => b.events.map((e) => e.orderNumber));
    expect(flatOrders).toEqual(events.map((e) => e.orderNumber));
  });

  it('derives the deduped set of referenced docIds per batch', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-a' }),
      makeEvent({ orderNumber: 3, documentId: 'doc-b' }),
    ];
    const batches = planDocSanitariaEventBatches(events, 50);
    expect(batches).toHaveLength(1);
    expect(batches[0].docIds).toEqual(['doc-a', 'doc-b']);
  });

  it('keeps docIds scoped to the events of each batch', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-b' }),
      makeEvent({ orderNumber: 3, documentId: 'doc-c' }),
    ];
    const batches = planDocSanitariaEventBatches(events, 2);
    expect(batches).toHaveLength(2);
    expect(batches[0].docIds).toEqual(['doc-a', 'doc-b']);
    expect(batches[1].docIds).toEqual(['doc-c']);
  });

  it('degrades to a single batch when size <= 0 (never loses events)', () => {
    const events = [makeEvent({ orderNumber: 1 }), makeEvent({ orderNumber: 2 })];
    const batches = planDocSanitariaEventBatches(events, 0);
    expect(batches).toHaveLength(1);
    expect(batches[0].events).toEqual(events);
  });

  it('computes a readable DD.MM.YYYY date range per batch (first – last)', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-03-15' }),
      makeEvent({ orderNumber: 2, eventDate: '2024-06-20' }),
    ];
    const [batch] = planDocSanitariaEventBatches(events, 50);
    expect(batch.dateRange).toBe('15.03.2024 – 20.06.2024');
  });

  it('exposes a sane default batch size', () => {
    expect(DOC_SANITARIA_EVENT_BATCH_SIZE).toBeGreaterThan(0);
    expect(DOC_SANITARIA_EVENT_BATCH_SIZE).toBeLessThanOrEqual(80);
  });
});

describe('dedupeDocumentsByContent — anti-duplicazione (mai perdere un fatto)', () => {
  it('rimuove un documento a contenuto IDENTICO a uno già tenuto (tiene il primo)', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a', sourceText: 'Frattura composta del radio distale destro.' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-b', sourceText: 'Frattura composta del radio distale destro.' }), // stesso referto, altro PDF
      makeEvent({ orderNumber: 3, documentId: 'doc-c', sourceText: 'Lesione osteocondrale del ginocchio sinistro.' }),
    ];
    expect([...new Set(dedupeDocumentsByContent(events).map((e) => e.documentId))]).toEqual(['doc-a', 'doc-c']);
  });

  it('TIENE documenti con stessa data ma contenuto DIVERSO (no fact loss)', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a', eventDate: '2024-11-13', sourceText: 'Accesso PS: trauma toracico.' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-b', eventDate: '2024-11-13', sourceText: 'SUEM 118: dinamica trauma maggiore.' }),
    ];
    expect([...new Set(dedupeDocumentsByContent(events).map((e) => e.documentId))]).toEqual(['doc-a', 'doc-b']);
  });

  it('normalizza spazi/maiuscole prima del confronto', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a', sourceText: 'Frattura  COMPOSTA del radio.' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-b', sourceText: 'frattura composta del radio.' }),
    ];
    expect([...new Set(dedupeDocumentsByContent(events).map((e) => e.documentId))]).toEqual(['doc-a']);
  });

  it('confronta il documento INTERO (tutti i suoi eventi), e tiene tutti gli eventi del documento conservato', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a', sourceText: 'Diagnosi alla dimissione' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-a', sourceText: 'Terapia domiciliare' }),
      makeEvent({ orderNumber: 3, documentId: 'doc-b', sourceText: 'Diagnosi alla dimissione' }),
      makeEvent({ orderNumber: 4, documentId: 'doc-b', sourceText: 'Terapia domiciliare' }), // doc-b identico a doc-a
    ];
    const out = dedupeDocumentsByContent(events);
    expect(out.map((e) => e.orderNumber)).toEqual([1, 2]); // doc-a intero tenuto, doc-b (dup) via
  });

  it('input vuoto → vuoto', () => {
    expect(dedupeDocumentsByContent([])).toEqual([]);
  });
});

describe('planDocSanitariaEventBatchesByDocument — un documento mai spezzato tra batch + dedup', () => {
  it('NON spezza un documento tra due batch anche se scavalca la finestra', () => {
    // doc-A ha 3 eventi sugli indici 4-6: con chunk per-evento (size 4) sarebbe diviso; per-documento NO.
    const events = [
      ...Array.from({ length: 4 }, (_, i) => makeEvent({ orderNumber: i + 1, documentId: `d${i}`, sourceText: `t${i}` })),
      makeEvent({ orderNumber: 5, documentId: 'A', sourceText: 'a1' }),
      makeEvent({ orderNumber: 6, documentId: 'A', sourceText: 'a2' }),
      makeEvent({ orderNumber: 7, documentId: 'A', sourceText: 'a3' }),
    ];
    const batches = planDocSanitariaEventBatchesByDocument(events, 4);
    const batchesWithA = batches.filter((b) => b.events.some((e) => e.documentId === 'A'));
    expect(batchesWithA).toHaveLength(1); // tutto A in UN batch
    expect(batches.flatMap((b) => b.events)).toHaveLength(7); // niente perso
  });

  it('applica la dedup per-contenuto prima di impacchettare', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a', sourceText: 'referto identico' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-b', sourceText: 'referto identico' }),
    ];
    const batches = planDocSanitariaEventBatchesByDocument(events, 50);
    expect(batches.flatMap((b) => b.events)).toHaveLength(1); // doc-b dup rimosso
  });

  it('input vuoto → nessun batch', () => {
    expect(planDocSanitariaEventBatchesByDocument([], 50)).toEqual([]);
  });
});

describe('stripRepeatedSectionHeading — toglie il titolo di sezione ripetuto dai batch', () => {
  const T = 'La Documentazione Medica Prodotta';

  it('toglie il titolo in GRASSETTO su riga propria (il vero bug Bigon: **Titolo** ×9)', () => {
    const part = `**${T}**\n\n**Referto 13.11.2024** ...testo...`;
    const out = stripRepeatedSectionHeading(part, T);
    expect(out).not.toContain(`**${T}**`);
    expect(out).toContain('Referto 13.11.2024');
  });

  it('toglie il titolo come heading ## su riga propria', () => {
    const out = stripRepeatedSectionHeading(`## ${T}\nfoo`, T);
    expect(out).not.toContain(`## ${T}`);
    expect(out).toContain('foo');
  });

  it('toglie TUTTE le ripetizioni, anche a metà blocco', () => {
    const part = `prima\n**${T}**\nmezzo\n**${T}**\nfine`;
    const out = stripRepeatedSectionHeading(part, T);
    expect(out).not.toContain(`**${T}**`);
    expect(out).toContain('prima');
    expect(out).toContain('mezzo');
    expect(out).toContain('fine');
  });

  it('NON tocca una menzione del titolo dentro la prosa (non è una riga-titolo)', () => {
    const part = `Vedi la ${T} riportata sopra per i dettagli.`;
    expect(stripRepeatedSectionHeading(part, T)).toBe(part);
  });

  it('blocco senza il titolo resta invariato', () => {
    const part = '**Referto 17.04.2025**\n«testo verbatim»';
    expect(stripRepeatedSectionHeading(part, T)).toBe(part);
  });
});
