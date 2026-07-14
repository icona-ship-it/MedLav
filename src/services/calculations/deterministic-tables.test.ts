import { describe, it, expect } from 'vitest';
import {
  formatExpenseTable,
  formatChronologyIndex,
  formatDocumentazioneSanitaria,
  expandDeterministicBlocks,
  hasDeterministicMarkers,
  toDeterministicEvents,
  toDeterministicDocs,
  DETERMINISTIC_MARKERS,
  type DeterministicTableEvent,
  type DeterministicDoc,
} from './deterministic-tables';

function ev(partial: Partial<DeterministicTableEvent>): DeterministicTableEvent {
  return {
    event_date: '2024-03-10',
    event_type: 'visita',
    title: 'Evento',
    description: '',
    ...partial,
  };
}

describe('formatExpenseTable', () => {
  it('returns empty string when there are no spesa_medica events', () => {
    expect(formatExpenseTable([])).toBe('');
    expect(formatExpenseTable([ev({ event_type: 'visita' }), ev({ event_type: 'esame' })])).toBe('');
  });

  it('lists only spesa_medica events with a parsed amount and a total', () => {
    const out = formatExpenseTable([
      ev({ event_type: 'spesa_medica', event_date: '2024-01-05', title: 'Fattura visita ortopedica', description: 'Importo € 150,00', facility: 'Studio Rossi' }),
      ev({ event_type: 'spesa_medica', event_date: '2024-02-10', title: 'Ricevuta RX', description: '€ 80,50', facility: 'Centro Radiologico' }),
      ev({ event_type: 'visita', title: 'NON una spesa' }),
    ]);
    // Benchmark spese 2026-06-10: colonna "N. Ricevuta/Fattura" nella tabella.
    expect(out).toContain('| Data | Descrizione | Struttura | N. Ricevuta/Fattura | Importo |');
    expect(out).toContain('Fattura visita ortopedica');
    expect(out).toContain('Studio Rossi');
    expect(out).not.toContain('NON una spesa'); // non-expense event excluded
    // Total = 150 + 80.50 = 230.50 → italian currency
    expect(out).toMatch(/Totale/);
    expect(out).toMatch(/230,50/);
  });

  it('estrae il numero ricevuta/fattura quando riconoscibile nel testo (mai inventato)', () => {
    const out = formatExpenseTable([
      ev({ event_type: 'spesa_medica', event_date: '2026-03-31', title: 'Dieci sedute di trattamento fisioterapico', description: 'Fattura n. 10/2026 del 31/03/2026, € 500,00' }),
      ev({ event_type: 'spesa_medica', event_date: '2026-03-24', title: 'RX anca sx', description: 'ricevuta TC3630661, € 31,50' }),
      ev({ event_type: 'spesa_medica', event_date: '2026-03-02', title: 'Ritiro cartella clinica', description: '€ 35,00 tramite PagoPA' }),
    ]);
    expect(out).toContain('| 10/2026 |');
    expect(out).toContain('| TC3630661 |');
    // nessun riferimento riconoscibile → '—', mai inventato
    const ritiroRow = out.split('\n').find((l) => l.includes('Ritiro cartella'));
    expect(ritiroRow).toContain('| — |');
  });

  it('shows — for sentinel/undated dates and for unparsable amounts (+ partial note)', () => {
    const out = formatExpenseTable([
      ev({ event_type: 'spesa_medica', event_date: '1900-01-01', title: 'Bollo', description: 'marca da bollo 2 euro' }),
      ev({ event_type: 'spesa_medica', event_date: '2024-02-10', title: 'Visita senza importo', description: 'nessun importo indicato', facility: null }),
    ]);
    // sentinel date → —
    expect(out).not.toContain('1900');
    expect(out).toContain('—');
    // at least one unparsable amount → partial-total note
    expect(out).toMatch(/importi non rilevati/);
  });

  it('escapes pipes in cells so the table never breaks', () => {
    const out = formatExpenseTable([
      ev({ event_type: 'spesa_medica', title: 'Visita | con pipe', description: '€ 50,00', facility: 'A | B' }),
    ]);
    expect(out).toContain('Visita \\| con pipe');
    expect(out).toContain('A \\| B');
  });
});

describe('formatChronologyIndex', () => {
  it('returns empty string when no clinical events', () => {
    expect(formatChronologyIndex([])).toBe('');
    // only non-clinical (expense/admin) → excluded → empty
    expect(formatChronologyIndex([
      ev({ event_type: 'spesa_medica' }),
      ev({ event_type: 'documento_amministrativo' }),
    ])).toBe('');
  });

  it('lists clinical events chronologically, excludes expenses, undated last', () => {
    const out = formatChronologyIndex([
      ev({ event_type: 'visita', event_date: '2024-05-01', title: 'Controllo', facility: 'Osp. A' }),
      ev({ event_type: 'spesa_medica', event_date: '2024-04-01', title: 'Fattura' }),
      ev({ event_type: 'esame', event_date: '2024-01-15', title: 'RX', facility: 'Centro B' }),
      ev({ event_type: 'visita', event_date: '1900-01-01', title: 'Visita senza data' }),
    ]);
    // Niente colonna Tipo (benchmark gold passaniti: il perito la elimina sempre)
    expect(out).toContain('| Data | Autore/Struttura | Titolo |');
    expect(out).not.toContain('Fattura'); // expense excluded
    const rxIdx = out.indexOf('RX');
    const controlloIdx = out.indexOf('Controllo');
    const undatedIdx = out.indexOf('Visita senza data');
    expect(rxIdx).toBeLessThan(controlloIdx); // 15 Jan before 1 May
    expect(undatedIdx).toBeGreaterThan(controlloIdx); // undated at the bottom
    expect(out).toContain('—'); // undated date cell
  });

  it('escapes pipes and omits the internal event type (benchmark gold passaniti)', () => {
    const out = formatChronologyIndex([
      ev({ event_type: 'esame_strumentale', event_date: '2024-01-15', title: 'TAC | torace', facility: 'X' }),
    ]);
    expect(out).not.toContain('Esame strumentale'); // tipo = dicitura interna, eliminata dal perito
    expect(out).toContain('TAC \\| torace');
  });
});

describe('expandDeterministicBlocks', () => {
  const expenses: DeterministicTableEvent[] = [
    ev({ event_type: 'spesa_medica', event_date: '2024-01-05', title: 'Fattura', description: '€ 100,00' }),
  ];

  it('is a no-op on legacy reports without markers (idempotent)', () => {
    const md = '## Epicrisi\n\nTesto senza marker.';
    expect(hasDeterministicMarkers(md)).toBe(false);
    expect(expandDeterministicBlocks(md, expenses)).toBe(md);
    // idempotent: running twice changes nothing
    const once = expandDeterministicBlocks(md, expenses);
    expect(expandDeterministicBlocks(once, expenses)).toBe(once);
  });

  it('replaces the SPESE marker with the rendered expense table', () => {
    const md = `## Spese mediche\n\n${DETERMINISTIC_MARKERS.SPESE}`;
    const out = expandDeterministicBlocks(md, expenses);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.SPESE);
    expect(out).toContain('| Data | Descrizione | Struttura | N. Ricevuta/Fattura | Importo |');
    expect(out).toContain('Fattura');
  });

  it('replaces ITT/ITP and CRONO markers', () => {
    const clinical: DeterministicTableEvent[] = [
      ev({ event_type: 'ricovero', event_date: '2024-01-01', title: 'Ricovero' }),
      ev({ event_type: 'dimissione', event_date: '2024-01-10', title: 'Dimissione' }),
    ];
    const md = `${DETERMINISTIC_MARKERS.ITT_ITP}\n\n${DETERMINISTIC_MARKERS.CRONO}`;
    const out = expandDeterministicBlocks(md, clinical);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.ITT_ITP);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.CRONO);
    expect(out).toContain('Autore/Struttura'); // chrono table header
  });

  it('replaces the ITT_RICOVERO_FACTS marker with the deterministic ricovero/durata block (fix Bigon)', () => {
    const clinical: DeterministicTableEvent[] = [
      ev({ event_type: 'ricovero', event_date: '2024-11-14', title: 'Ricovero' }),
      ev({ event_type: 'dimissione', event_date: '2024-11-22', title: 'Dimissione', description: 'lettera di dimissione' }),
    ];
    const md = `## Epicrisi\n\n${DETERMINISTIC_MARKERS.ITT_RICOVERO_FACTS}`;
    const out = expandDeterministicBlocks(md, clinical);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.ITT_RICOVERO_FACTS);
    expect(out).toContain('Giorni di ricovero');
    expect(out).toContain('9 (nove)'); // inclusivo (gold): 14→22.11 conta entrambi i giorni
  });

  it('ITT_RICOVERO_FACTS → marker rimosso anche senza dati calcolabili (nessun residuo)', () => {
    const md = DETERMINISTIC_MARKERS.ITT_RICOVERO_FACTS;
    const out = expandDeterministicBlocks(md, []);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.ITT_RICOVERO_FACTS);
  });

  it('uses a fallback note when the data yields an empty table', () => {
    const md = DETERMINISTIC_MARKERS.SPESE;
    const out = expandDeterministicBlocks(md, []); // no expenses
    expect(out).not.toContain(DETERMINISTIC_MARKERS.SPESE);
    expect(out).toContain('Non risultano spese mediche a carico del danneggiato');
  });
});

describe('toDeterministicEvents (export mapping)', () => {
  it('maps DB rows and tolerates missing fields', () => {
    const out = toDeterministicEvents([
      { event_date: '2024-01-01', event_type: 'spesa_medica', title: 'X', description: 'Y', facility: 'F', order_number: 3 },
      { event_type: 'visita' }, // missing fields → safe defaults
    ]);
    expect(out[0]).toMatchObject({ event_date: '2024-01-01', event_type: 'spesa_medica', title: 'X', facility: 'F', order_number: 3 });
    expect(out[1]).toMatchObject({ event_date: '', event_type: 'visita', title: '', description: '', facility: null });
  });

  it('round-trips through expandDeterministicBlocks from loose rows', () => {
    const rows = [{ event_type: 'spesa_medica', event_date: '2024-01-05', title: 'Fattura', description: '€ 100,00' }];
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.SPESE, toDeterministicEvents(rows));
    expect(out).toContain('Fattura');
    expect(out).toContain('100,00');
  });
});

function doc(partial: Partial<DeterministicDoc>): DeterministicDoc {
  return {
    documentId: 'd1',
    fileName: 'referto.pdf',
    documentType: 'referto_specialistico',
    pages: [{ pageNumber: 1, ocrText: 'Testo referto.' }],
    ...partial,
  };
}

describe('formatDocumentazioneSanitaria (complete + analytical list)', () => {
  it('lists docs analytically AND reproduces the full OCR verbatim per document', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ documentId: 'd1', fileName: 'rx.pdf', documentType: 'referto_specialistico', pages: [{ pageNumber: 1, ocrText: 'Diagnosi: frattura del radio distale.' }] })],
      [ev({ document_id: 'd1', event_date: '2024-04-20', facility: 'Ospedale Esempio' })],
    );
    expect(out).toContain('Documenti sanitari esaminati');
    // Benchmark gold 2026-06-10: header di blocco in formato perizia
    // "**Tipo, Struttura in data DD.MM.YYYY:**" — il filename resta SOLO
    // nell'elenco analitico iniziale (riferimento tecnico).
    expect(out).toContain('**Referto Specialistico, Ospedale Esempio in data 20.04.2024:**');
    expect(out).not.toContain('### Referto Specialistico: rx.pdf');
    expect(out).toContain('*rx.pdf*'); // filename nell'elenco analitico
    expect(out).toContain('Diagnosi: frattura del radio distale.');
  });

  it('reproduces documents in chronological order (earliest dated event first)', () => {
    const docs = [
      doc({ documentId: 'late', fileName: 'b.pdf', pages: [{ pageNumber: 1, ocrText: 'CONTENUTO_LATE' }] }),
      doc({ documentId: 'early', fileName: 'a.pdf', pages: [{ pageNumber: 1, ocrText: 'CONTENUTO_EARLY' }] }),
    ];
    const events: DeterministicTableEvent[] = [
      ev({ document_id: 'late', event_date: '2024-06-01' }),
      ev({ document_id: 'early', event_date: '2024-01-01' }),
    ];
    const out = formatDocumentazioneSanitaria(docs, events);
    expect(out.indexOf('CONTENUTO_EARLY')).toBeLessThan(out.indexOf('CONTENUTO_LATE'));
  });

  it('marks empty/illegible pages instead of dropping them (never lose a fact)', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ pages: [{ pageNumber: 1, ocrText: 'Pagina 1 ok.' }, { pageNumber: 2, ocrText: '   ' }] })],
      [],
    );
    expect(out).toContain('Pagina 1 ok.');
    expect(out).toContain('[Pagina 2 — testo non disponibile o illeggibile');
  });

  it('demotes H1/H2 headings in the OCR (no collision with "## " section delimiter)', () => {
    const out = formatDocumentazioneSanitaria([doc({ pages: [{ pageNumber: 1, ocrText: '## REFERTO\nTesto.' }] })], []);
    for (const line of out.split('\n')) expect(/^#{1,2}\s/.test(line)).toBe(false);
    expect(out).toContain('REFERTO');
    expect(out).toContain('#### REFERTO');
  });

  it('does NOT escape pipes (OCR tables survive)', () => {
    const out = formatDocumentazioneSanitaria([doc({ pages: [{ pageNumber: 1, ocrText: '| Hb | 9.7 |' }] })], []);
    expect(out).toContain('| Hb | 9.7 |');
    expect(out).not.toContain('\\|');
  });

  it('excludes non-clinical document types (atti / perizie / spese)', () => {
    const docs = [
      doc({ documentId: 'a', fileName: 'cartella.pdf', documentType: 'cartella_clinica', pages: [{ pageNumber: 1, ocrText: 'CLINICO' }] }),
      doc({ documentId: 'b', fileName: 'memoria.pdf', documentType: 'memoria_difensiva', pages: [{ pageNumber: 1, ocrText: 'NON_CLINICO' }] }),
    ];
    const out = formatDocumentazioneSanitaria(docs, []);
    expect(out).toContain('CLINICO');
    expect(out).not.toContain('NON_CLINICO');
  });

  it('returns empty string when there are no clinical documents', () => {
    expect(formatDocumentazioneSanitaria([], [])).toBe('');
    expect(formatDocumentazioneSanitaria([doc({ documentType: 'memoria_difensiva' })], [])).toBe('');
  });
});

describe('expandDeterministicBlocks — DOC_SANITARIA', () => {
  it('expands the DOC_SANITARIA marker with the documentation when docs are provided', () => {
    const docs = [doc({ pages: [{ pageNumber: 1, ocrText: 'TESTO_MEDICO_VERBATIM' }] })];
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, [], docs);
    expect(out).toContain('TESTO_MEDICO_VERBATIM');
    expect(out).not.toContain('MEDLAV:DOC_SANITARIA');
  });

  it('replaces the marker with a neutral note (no orphan, no raw OCR) when docs are NOT provided', () => {
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, []);
    // The invisible marker must NOT survive (it would orphan the section intro),
    // but no documents are exposed either — a neutral "perizia completa" note.
    expect(out).not.toContain('MEDLAV:DOC_SANITARIA');
    expect(out).toContain('consultabile nella perizia completa');
  });

  it('shows the empty fallback when docs are provided but empty', () => {
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, [], []);
    expect(out).toContain('Nessun documento sanitario disponibile');
  });

  it('is idempotent (re-expansion is a no-op once the marker is gone)', () => {
    const docs = [doc({})];
    const once = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, [], docs);
    const twice = expandDeterministicBlocks(once, [], docs);
    expect(twice).toBe(once);
  });
});

// Panel RC 2026-07-02: gli agenti hanno flaggato i tag <!--MEDLAV:...--> leggendo
// il markdown GREZZO. L'invariante depositabile è che DOPO l'espansione (che gli
// export HTML/DOCX/PDF eseguono sempre) NESSUN marker sopravvive — nemmeno con
// zero eventi e zero documenti (i fallback coprono ogni caso).
describe('expandDeterministicBlocks — invariante depositabile: nessun residuo MEDLAV', () => {
  it('espande TUTTI i marker noti senza lasciare residui, anche senza dati', () => {
    const allMarkers = Object.values(DETERMINISTIC_MARKERS).join('\n\n');
    const out = expandDeterministicBlocks(allMarkers, [], []);
    expect(out).not.toContain('<!--MEDLAV');
  });

  it('espande TUTTI i marker noti senza residui con dati presenti', () => {
    const allMarkers = Object.values(DETERMINISTIC_MARKERS).join('\n\n');
    const out = expandDeterministicBlocks(allMarkers, [], [doc({})]);
    expect(out).not.toContain('<!--MEDLAV');
  });
});

describe('toDeterministicDocs (mapping)', () => {
  it('maps id→documentId and preserves pages', () => {
    const out = toDeterministicDocs([
      { id: 'x', fileName: 'f.pdf', documentType: 'cartella_clinica', pages: [{ pageNumber: 1, ocrText: 'T' }] },
    ]);
    expect(out[0]).toMatchObject({ documentId: 'x', fileName: 'f.pdf', documentType: 'cartella_clinica' });
    expect(out[0].pages[0]).toMatchObject({ pageNumber: 1, ocrText: 'T' });
  });
});

describe('formatDocumentazioneSanitaria — nessuna omissione per-documento (revert 2026-07-06)', () => {
  it('riproduce SEMPRE il verbatim, anche di un documento con soli eventi di routine (no fact-loss su atto depositabile)', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ documentId: 'lab', fileName: 'esami.pdf', documentType: 'referto_specialistico', pages: [{ pageNumber: 1, ocrText: 'Emocromo: Hb 13.2, GB 6800' }] })],
      [ev({ document_id: 'lab', event_type: 'esame', event_date: '2024-04-20' })],
    );
    expect(out).toContain('Emocromo: Hb 13.2, GB 6800');
    expect(out).not.toContain('Documentazione di routine');
  });
});

describe('formatDocumentazioneSanitaria — filtro per-pagina (Lavini, 2026-07-07)', () => {
  const bigDoc = (id: string, nPages: number) => doc({
    documentId: id, fileName: `${id}.pdf`, documentType: 'cartella_clinica',
    pages: Array.from({ length: nPages }, (_, i) => ({ pageNumber: i + 1, ocrText: `CONTENUTO_PAGINA_${i + 1}` })),
  });

  it('documento GRANDE: riproduce solo le pagine con reperti importanti (T1/T2), salta le pagine di sola routine', () => {
    const out = formatDocumentazioneSanitaria(
      [bigDoc('d', 10)],
      [
        ev({ document_id: 'd', event_type: 'diagnosi', diagnosis: 'frattura', source_pages: [2], event_date: '2024-01-01' }),
        ev({ document_id: 'd', event_type: 'visita', source_pages: [5], event_date: '2024-01-01' }),
        ev({ document_id: 'd', event_type: 'esame', source_pages: [7], event_date: '2024-01-01' }), // T3 → pagina 7 NON tenuta
      ],
    );
    expect(out).toContain('CONTENUTO_PAGINA_2');
    expect(out).toContain('CONTENUTO_PAGINA_5');
    expect(out).not.toContain('CONTENUTO_PAGINA_7');
    expect(out).not.toContain('CONTENUTO_PAGINA_1');
    expect(out).toContain('reperti principali');
    // il documento resta INTERO nell'elenco analitico (tracciabilità)
    expect(out).toContain('*d.pdf*');
  });

  it('documento PICCOLO (≤8 pagine): riprodotto INTERO, nessun filtro', () => {
    const out = formatDocumentazioneSanitaria(
      [bigDoc('s', 4)],
      [ev({ document_id: 's', event_type: 'diagnosi', diagnosis: 'x', source_pages: [1], event_date: '2024-01-01' })],
    );
    for (let p = 1; p <= 4; p++) expect(out).toContain(`CONTENUTO_PAGINA_${p}`);
    expect(out).not.toContain('reperti principali');
  });

  it('FALLBACK conservativo: documento grande con reperti importanti ma SENZA source_pages → intero', () => {
    const out = formatDocumentazioneSanitaria(
      [bigDoc('d', 10)],
      [ev({ document_id: 'd', event_type: 'diagnosi', diagnosis: 'x', source_pages: null, event_date: '2024-01-01' })],
    );
    for (let p = 1; p <= 10; p++) expect(out).toContain(`CONTENUTO_PAGINA_${p}`);
    expect(out).not.toContain('reperti principali');
  });

  it('parse robusto: source_pages come STRINGA JSON del DB', () => {
    const out = formatDocumentazioneSanitaria(
      [bigDoc('d', 10)],
      [ev({ document_id: 'd', event_type: 'diagnosi', diagnosis: 'x', source_pages: '[3]' as unknown as number[], event_date: '2024-01-01' })],
    );
    expect(out).toContain('CONTENUTO_PAGINA_3');
    expect(out).not.toContain('CONTENUTO_PAGINA_1');
  });
});
