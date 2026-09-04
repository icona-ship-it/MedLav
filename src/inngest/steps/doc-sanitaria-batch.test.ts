import { describe, it, expect } from 'vitest';
import { planDocSanitariaEventBatches, planDocSanitariaEventBatchesByDocument, dedupeDocumentsByContent, dedupeEventsAcrossDocuments, stripRepeatedSectionHeading, stripWindowArtifacts, DOC_SANITARIA_EVENT_BATCH_SIZE, filterImagesForBatch, distillRcDocSanitariaEvents, planRcDocSanitariaBatches } from './doc-sanitaria-batch';
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
    temporalScope: 'corrente' as const,
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

  it('TIENE documenti con testo identico ma DATE diverse (esame ripetuto ≠ duplicato)', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a', eventDate: '2024-03-15', sourceText: 'RX torace: nei limiti.' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-b', eventDate: '2024-05-20', sourceText: 'RX torace: nei limiti.' }), // stesso testo, controllo successivo
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

  it('SCARTA il documento SOTTOINSIEME di un contenitore (dimissione dentro cartella + autonoma = narrata una volta)', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'dimissione-standalone', eventDate: '2024-11-22', sourceText: 'Diagnosi alla dimissione: frattura bifocale femore sinistro.' }),
      makeEvent({ orderNumber: 2, documentId: 'cartella', eventDate: '2024-11-13', sourceText: 'Accesso PS per politrauma da investimento.' }),
      makeEvent({ orderNumber: 3, documentId: 'cartella', eventDate: '2024-11-22', sourceText: 'Diagnosi alla dimissione: frattura bifocale femore sinistro.' }),
    ];
    const out = dedupeDocumentsByContent(events);
    expect([...new Set(out.map((e) => e.documentId))]).toEqual(['cartella']);
    expect(out).toHaveLength(2); // il contenitore resta INTERO
  });

  it('il documento con un fatto IN PIÙ sopravvive sempre: cade il sottoinsieme, nessun fatto perso', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'estratto', eventDate: '2024-11-22', sourceText: 'Diagnosi alla dimissione: frattura femore.' }),
      makeEvent({ orderNumber: 2, documentId: 'referto-completo', eventDate: '2024-11-22', sourceText: 'Diagnosi alla dimissione: frattura femore.' }),
      makeEvent({ orderNumber: 3, documentId: 'referto-completo', eventDate: '2024-11-23', sourceText: 'Terapia domiciliare con eparina.' }),
    ];
    const out = dedupeDocumentsByContent(events);
    expect([...new Set(out.map((e) => e.documentId))]).toEqual(['referto-completo']);
    expect(out).toHaveLength(2); // tutti i fatti restano (dentro il completo)
  });

  it('due documenti con fatti PARZIALMENTE sovrapposti ma ciascuno con un fatto proprio → restano entrambi', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-x', eventDate: '2024-11-22', sourceText: 'Diagnosi alla dimissione: frattura femore.' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-x', eventDate: '2024-11-24', sourceText: 'Controllo ferita chirurgica regolare.' }),
      makeEvent({ orderNumber: 3, documentId: 'doc-y', eventDate: '2024-11-22', sourceText: 'Diagnosi alla dimissione: frattura femore.' }),
      makeEvent({ orderNumber: 4, documentId: 'doc-y', eventDate: '2024-11-23', sourceText: 'Terapia domiciliare con eparina.' }),
    ];
    const out = dedupeDocumentsByContent(events);
    expect(new Set(out.map((e) => e.documentId))).toEqual(new Set(['doc-x', 'doc-y']));
  });
});

describe('dedupeEventsAcrossDocuments — stesso fatto narrato UNA volta (Bigon, 17 doppioni)', () => {
  it('due documenti parzialmente sovrapposti: l\'evento condiviso resta solo nel PRIMO', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a', eventDate: '2025-11-04', sourceText: 'Ecocolordoppler TSA: nella norma.' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-a', eventDate: '2025-11-05', sourceText: 'Visita neurologica di controllo.' }),
      makeEvent({ orderNumber: 3, documentId: 'doc-b', eventDate: '2025-11-04', sourceText: 'Ecocolordoppler TSA: nella norma.' }), // stesso fatto in altro doc
      makeEvent({ orderNumber: 4, documentId: 'doc-b', eventDate: '2025-11-06', sourceText: 'RM encefalo di controllo.' }),
    ];
    const out = dedupeEventsAcrossDocuments(events);
    expect(out.map((e) => e.orderNumber)).toEqual([1, 2, 4]);
  });

  it('eventi senza contenuto testuale non sono mai deduplicati', () => {
    const events = [
      makeEvent({ orderNumber: 1, sourceText: '', description: '', title: '' }),
      makeEvent({ orderNumber: 2, sourceText: '', description: '', title: '' }),
    ];
    expect(dedupeEventsAcrossDocuments(events)).toHaveLength(2);
  });
});

describe('stripWindowArtifacts — artefatti ai confini di finestra (audit 2026-07-16)', () => {
  it('rimuove il paragrafo-cerniera di servizio e i separatori orfani, tiene i blocchi-documento', () => {
    const part = `---\n\n*I successivi documenti clinici, in ordine cronologico, verranno citati nei blocchi seguenti, riportando esclusivamente i dati clinici rilevanti.*\n\n**Referto di esame strumentale, in data 13.11.2024:**\nIl referto descrive «frattura bifocale scomposta».`;
    const out = stripWindowArtifacts(part, 'La Documentazione Medica Prodotta');
    expect(out).not.toContain('verranno citati');
    expect(out).not.toMatch(/^-{3,}$/m);
    expect(out).toContain('**Referto di esame strumentale');
    expect(out).toContain('frattura bifocale scomposta');
  });

  it('NON tocca prosa clinica legittima né i blocchi-documento lunghi', () => {
    const part = `**Cartella clinica, in data 13.11.2024:**\nLa paziente giunge in PS. Nei blocchi operatori si procedeva a riduzione della frattura.`;
    const out = stripWindowArtifacts(part, 'La Documentazione Medica Prodotta');
    expect(out).toBe(part.trim());
  });

  it('rimuove anche il titolo di sezione ripetuto (comportamento pregresso preservato)', () => {
    const part = `## La Documentazione Medica Prodotta\n\n**Referto, in data 01.01.2025:**\nTesto.`;
    const out = stripWindowArtifacts(part, 'La Documentazione Medica Prodotta');
    expect(out).not.toContain('## La Documentazione');
    expect(out).toContain('**Referto');
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

// ── Distillazione v2 + planner RC con cap (review 2026-07-04) ─────────

describe('distillRcDocSanitariaEvents — filtro completo RC (lab + noise + policy)', () => {
  it('toglie lab di routine, consensi/amministrativi e categorie della policy; tiene il clinico', () => {
    const events = [
      makeEvent({ orderNumber: 1, title: 'Referto RX bacino', description: 'Frattura composta ramo ileo-ischio-pubico.' }),
      makeEvent({ orderNumber: 2, eventType: 'esame', sourceType: 'esame_ematochimico', title: 'Emocromo', description: 'Hb 12.1' }),
      makeEvent({ orderNumber: 3, eventType: 'consenso', title: 'Consenso informato anestesia', description: 'Firmato.' }),
      makeEvent({ orderNumber: 4, eventType: 'terapia', title: 'Somministrazione terapia', description: 'Foglio unico di terapia, schema giornaliero.' }),
      makeEvent({ orderNumber: 5, title: 'Diario infermieristico', description: 'Consegne infermieristiche del turno.' }),
    ];
    const { kept, stats } = distillRcDocSanitariaEvents(events);
    expect(kept.map((e) => e.orderNumber)).toEqual([1]);
    expect(stats.total).toBe(5);
    expect(stats.omitted).toBe(4);
  });

  it('NON toglie mai un evento T1 load-bearing, qualunque sia la categoria', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventType: 'esame', sourceType: 'esame_ematochimico', title: 'D-dimero', description: 'Elevato', diagnosis: 'TVP arto inferiore sinistro' }),
      makeEvent({ orderNumber: 2, title: 'Diario infermieristico', description: 'Consegne.', diagnosis: 'Trombosi venosa profonda' }),
    ];
    const { kept } = distillRcDocSanitariaEvents(events);
    expect(kept).toHaveLength(2);
  });
});

describe('planRcDocSanitariaBatches — per-documento con cap sul numero di finestre', () => {
  it('distilla PRIMA di pianificare (meno eventi → meno finestre)', () => {
    // 60 eventi clinici + 60 log-terapia: senza distillazione 120 eventi (3 finestre da 50),
    // con distillazione 60 (2 finestre).
    const clinici = Array.from({ length: 60 }, (_, i) =>
      makeEvent({ orderNumber: i + 1, documentId: `doc-${Math.floor(i / 10)}`, title: `Referto ${i}`, description: `Reperto clinico ${i}.`, sourceText: `testo ${i}` }));
    const logs = Array.from({ length: 60 }, (_, i) =>
      makeEvent({ orderNumber: 100 + i, documentId: `doc-${Math.floor(i / 10)}`, eventType: 'terapia', title: 'Somministrazione terapia', description: `Foglio unico di terapia ${i}.`, sourceText: `fut ${i}` }));
    const { batches, stats } = planRcDocSanitariaBatches([...clinici, ...logs], 50);
    expect(stats.omitted).toBe(60);
    expect(batches.length).toBeLessThanOrEqual(2);
    const totalPlanned = batches.reduce((s, b) => s + b.events.length, 0);
    expect(totalPlanned).toBe(60);
  });

  it('non spezza mai un documento tra due finestre (no straddle → no ri-narrazione)', () => {
    // 3 documenti da 30 eventi: con size 50 il packing per-documento fa [30, 30+? no: 30+30>50] → [doc1],[doc2],[doc3]? 30+30=60>50 → finestre [30],[30],[30].
    const events = Array.from({ length: 90 }, (_, i) =>
      makeEvent({ orderNumber: i + 1, documentId: `doc-${Math.floor(i / 30)}`, title: `Referto ${i}`, description: `Reperto ${i}.`, sourceText: `testo ${i}` }));
    const { batches } = planRcDocSanitariaBatches(events, 50);
    for (const batch of batches) {
      // ogni documento compare in UNA sola finestra
      for (const id of batch.docIds) {
        const elsewhere = batches.filter((b) => b !== batch && b.docIds.includes(id));
        expect(elsewhere).toHaveLength(0);
      }
    }
  });

  it('rispetta il cap: su un macrodanno il numero di finestre non supera maxBatches (finestre più larghe, non di più)', () => {
    // 900 eventi clinici su 90 documenti: con size 50 sarebbero ~18 finestre → cap 12.
    const events = Array.from({ length: 900 }, (_, i) =>
      makeEvent({ orderNumber: i + 1, documentId: `doc-${Math.floor(i / 10)}`, title: `Referto ${i}`, description: `Reperto ${i}.`, sourceText: `testo ${i}` }));
    const { batches } = planRcDocSanitariaBatches(events, 50, 12);
    expect(batches.length).toBeLessThanOrEqual(12);
    const totalPlanned = batches.reduce((s, b) => s + b.events.length, 0);
    expect(totalPlanned).toBe(900); // il cap allarga le finestre, NON perde eventi
  });

  it('lista vuota → nessuna finestra', () => {
    expect(planRcDocSanitariaBatches([], 50).batches).toEqual([]);
  });
});

describe('planDocSanitariaEventBatchesByDocument — ordine dei documenti dai soli eventi correnti (gate gold 2026-09-04)', () => {
  it('un documento del 2025 con una menzione anamnestica del 2002 NON va in testa alla trascrizione', () => {
    const events: ConsolidatedEvent[] = [
      makeEvent({ orderNumber: 1, eventDate: '2002-01-01', documentId: 'doc-2025', title: 'pregressa colecistectomia', temporalScope: 'retrospettivo' }),
      makeEvent({ orderNumber: 2, eventDate: '2024-11-13', documentId: 'doc-ps', title: 'accesso PS', temporalScope: 'corrente' }),
      makeEvent({ orderNumber: 3, eventDate: '2025-08-13', documentId: 'doc-2025', title: 'visita', temporalScope: 'corrente' }),
      makeEvent({ orderNumber: 4, eventDate: '2026-03-01', documentId: 'doc-2026', title: 'controllo', temporalScope: 'corrente' }),
    ];
    const [win] = planDocSanitariaEventBatchesByDocument(events, 100);
    expect(win.docIds).toEqual(['doc-ps', 'doc-2025', 'doc-2026']);
    // gli eventi del documento restano insieme (mai spezzato) e la menzione resta nel suo documento
    expect(win.events.map((e) => e.orderNumber)).toEqual([2, 1, 3, 4]);
  });

  it('senza eventi correnti (solo menzioni) il documento è datato dalla prima menzione, e l\'ordine legacy (senza scope) è invariato', () => {
    const legacy: ConsolidatedEvent[] = [
      makeEvent({ orderNumber: 1, eventDate: '2024-01-01', documentId: 'a' }),
      makeEvent({ orderNumber: 2, eventDate: '2024-02-01', documentId: 'b' }),
      makeEvent({ orderNumber: 3, eventDate: '2024-03-01', documentId: 'a' }),
    ];
    expect(planDocSanitariaEventBatchesByDocument(legacy, 100)[0].docIds).toEqual(['a', 'b']);
    const onlyMentions: ConsolidatedEvent[] = [
      makeEvent({ orderNumber: 1, eventDate: '2020-01-01', documentId: 'm', temporalScope: 'retrospettivo' }),
      makeEvent({ orderNumber: 2, eventDate: '2024-02-01', documentId: 'b', temporalScope: 'corrente' }),
    ];
    expect(planDocSanitariaEventBatchesByDocument(onlyMentions, 100)[0].docIds).toEqual(['m', 'b']);
  });
});
