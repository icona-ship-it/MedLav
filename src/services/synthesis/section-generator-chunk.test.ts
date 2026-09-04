import { describe, it, expect } from 'vitest';
import { chunkArray, buildAttiIndex, chunkEventsByDocument, buildDocSanitariaChunkSpec, stripClassifierCodeFromDocSanitariaTitles, stripBracketedDocRefs, stripCodeFences, stripGuardMarkersInsideQuotes, capEventsForNarrativeSection, stripGuardFormulaFromDocSanitariaTitles, demoteStrayBoldParagraphs } from './section-generator';
import { buildDocSanitariaBlockHeader } from './synthesis-prompts';
import { EPICRISI_COMPLETAMENTO_GUIDE } from './section-placeholders';
import type { SectionSpec } from './section-generation-types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

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

describe('chunkArray', () => {
  it('returns empty for an empty input', () => {
    expect(chunkArray([], 50)).toEqual([]);
  });

  it('splits an exact multiple into equal blocks', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('puts the remainder in a shorter last block', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single block when size >= length', () => {
    expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('degrades to a single block when size <= 0 (never loses items)', () => {
    expect(chunkArray([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });

  it('NEVER loses or duplicates items — concatenation reconstitutes the original', () => {
    const items = Array.from({ length: 217 }, (_, i) => i); // il caso Lavini
    const flat = chunkArray(items, 50).flat();
    expect(flat).toEqual(items);
    expect(chunkArray(items, 50).length).toBe(5); // 50+50+50+50+17
  });
});

describe('buildAttiIndex', () => {
  it('reports the total count and one line per event', () => {
    const events = [makeEvent(), makeEvent({ orderNumber: 2 }), makeEvent({ orderNumber: 3 })];
    const idx = buildAttiIndex(events);
    expect(idx).toContain('(3,');
    expect(idx.split('\n').filter((l) => l.startsWith('- ')).length).toBe(3);
  });

  it('formats the date as DD.MM.YYYY', () => {
    const idx = buildAttiIndex([makeEvent({ eventDate: '2024-03-15' })]);
    expect(idx).toContain('(15.03.2024)');
  });

  it('prefers facility, falls back to doctor, then to bare type', () => {
    expect(buildAttiIndex([makeEvent({ facility: 'Ospedale X', doctor: 'Dr. Y' })])).toContain('— Ospedale X');
    expect(buildAttiIndex([makeEvent({ facility: null, doctor: 'Dr. Y' })])).toContain('— Dr. Y');
    const bare = buildAttiIndex([makeEvent({ facility: null, doctor: null, eventType: 'ricovero' })]);
    expect(bare).toContain('- Ricovero (');
    expect(bare).not.toContain('—');
  });

  it('renders the 1900-01-01 sentinel as "s.d." (never the validator-blocked 01.01.1900)', () => {
    const idx = buildAttiIndex([makeEvent({ eventDate: '1900-01-01', eventType: 'spesa_medica' })]);
    expect(idx).toContain('(s.d.)');
    expect(idx).not.toMatch(/01[./]01[./]1900/);
  });

  it('datePrecision "anno" → solo l\'anno, mai il 01.01 fabbricato (fix Bigon)', () => {
    const idx = buildAttiIndex([makeEvent({ eventDate: '2002-01-01', datePrecision: 'anno' })]);
    expect(idx).toContain('(2002)');
    expect(idx).not.toContain('01.01.2002');
  });
});

describe('chunkEventsByDocument — non spezza i documenti (fix Bigon chunked)', () => {
  it('impacchetta i gruppi-documento senza spezzarli tra blocchi', () => {
    const evs = [
      makeEvent({ documentId: 'A' }), makeEvent({ documentId: 'A' }), makeEvent({ documentId: 'A' }),
      makeEvent({ documentId: 'B' }), makeEvent({ documentId: 'B' }),
      makeEvent({ documentId: 'C' }),
    ];
    const chunks = chunkEventsByDocument(evs, 4); // soglia 4
    // ogni documento sta TUTTO in un solo chunk (nessun documentId attraversa due chunk)
    for (const id of ['A', 'B', 'C']) {
      const chunksWith = chunks.filter((c) => c.some((e) => e.documentId === id));
      expect(chunksWith).toHaveLength(1);
    }
    // tutti gli eventi sono preservati
    expect(chunks.flat()).toHaveLength(6);
  });

  it('input vuoto → un blocco vuoto, non crash', () => {
    expect(chunkEventsByDocument([], 50)).toEqual([[]]);
  });
});

describe('stripClassifierCodeFromDocSanitariaTitles — toglie il codice A-D dai titoli (fix Bigon tag leak)', () => {
  it('toglie il codice classificatore in testa a un titolo grassetto', () => {
    expect(stripClassifierCodeFromDocSanitariaTitles('**B - Referto di controllo medico, in data 01.01.2002:**'))
      .toBe('**Referto di controllo medico, in data 01.01.2002:**');
    expect(stripClassifierCodeFromDocSanitariaTitles('**A - Cartella clinica, Ospedale X, in data 14.11.2024:**'))
      .toBe('**Cartella clinica, Ospedale X, in data 14.11.2024:**');
  });

  it('tollera en-dash e spazi extra', () => {
    expect(stripClassifierCodeFromDocSanitariaTitles('**C – Referto RX:**')).toBe('**Referto RX:**');
    expect(stripClassifierCodeFromDocSanitariaTitles('**D  -  Esame:**')).toBe('**Esame:**');
  });

  it('NON tocca un titolo grassetto legittimo (nessun codice)', () => {
    const ok = '**Cartella clinica, Ospedale X, in data 14.11.2024:**';
    expect(stripClassifierCodeFromDocSanitariaTitles(ok)).toBe(ok);
    const esame = '**Esame strumentale, in data 12.03.2024:**';
    expect(stripClassifierCodeFromDocSanitariaTitles(esame)).toBe(esame);
  });

  it('NON tocca prosa che inizia con una lettera+trattino (non è un titolo grassetto)', () => {
    const prosa = 'A - destra evidenzia una tumefazione.';
    expect(stripClassifierCodeFromDocSanitariaTitles(prosa)).toBe(prosa);
  });

  it('NON tocca lettere fuori dal range A-D (solo i 4 codici)', () => {
    const e = '**E - Sezione finale:**';
    expect(stripClassifierCodeFromDocSanitariaTitles(e)).toBe(e);
  });

  it('agisce su tutte le righe-titolo del blocco (multiline)', () => {
    const md = '**A - Cartella, in data 14.11.2024:**\n«contenuto»\n**B - Referto, in data 22.11.2024:**\n«altro»';
    const out = stripClassifierCodeFromDocSanitariaTitles(md);
    expect(out).not.toContain('A - ');
    expect(out).not.toContain('B - ');
    expect(out).toContain('«contenuto»');
    expect(out).toContain('«altro»');
  });
});

describe('stripBracketedDocRefs — toglie le citazioni [Tipo, data] in prosa (fix Bigon Epicrisi ~58)', () => {
  it('rimuove i riferimenti [Tipo, dd.mm.yyyy]', () => {
    expect(stripBracketedDocRefs('Il quadro è documentato [Ricovero, 13.11.2024] in cartella.'))
      .toBe('Il quadro è documentato in cartella.');
    expect(stripBracketedDocRefs('Ultimo accertamento [Altro, 14.04.2026].'))
      .toBe('Ultimo accertamento.');
  });

  it('tollera separatori . / - e i range di date', () => {
    expect(stripBracketedDocRefs('come da [Visita, 14/04/2026] referto'))
      .toBe('come da referto');
    expect(stripBracketedDocRefs('nel periodo [Ricovero, 13.11.2024–20.11.2024] indicato'))
      .toBe('nel periodo indicato');
  });

  it('NON tocca i placeholder dello scaffold perito ([N], [DATA], [X], MAIUSCOLO)', () => {
    for (const ph of ['[N]', '[X]', '[DATA]', '[DIAGNOSI IN MAIUSCOLO]', '[classe/voce]']) {
      expect(stripBracketedDocRefs(`valore ${ph} qui`)).toBe(`valore ${ph} qui`);
    }
  });

  it('NON tocca [da compilare], [DA VERIFICARE], [Sezione non producibile: ...]', () => {
    for (const ph of ['[da compilare dal perito]', '[DA VERIFICARE]', '[Sezione non producibile: dati insufficienti]']) {
      expect(stripBracketedDocRefs(`x ${ph} y`)).toBe(`x ${ph} y`);
    }
  });

  it('NON tocca le citazioni scientifiche con anno nudo [Autore, Rivista, 2020]', () => {
    expect(stripBracketedDocRefs('come da [Smith, JBJS, 2020] e [SIMLA, 2016]'))
      .toBe('come da [Smith, JBJS, 2020] e [SIMLA, 2016]');
  });

  it('NON tocca i marker deterministici <!--MEDLAV:...-->', () => {
    const m = 'Tabella: <!--MEDLAV:ITT_ITP--> sotto.';
    expect(stripBracketedDocRefs(m)).toBe(m);
  });

  it('lo scaffold Epicrisi sopravvive byte-identico (nessun [Parola, data] al suo interno)', () => {
    expect(stripBracketedDocRefs(EPICRISI_COMPLETAMENTO_GUIDE)).toBe(EPICRISI_COMPLETAMENTO_GUIDE);
  });
});

describe('stripCodeFences — toglie il code-fence che avvolge una sezione (fix Bigon v4 Epicrisi monospace)', () => {
  it('toglie il wrapper ``` completo', () => {
    expect(stripCodeFences('```\nDalla disamina complessiva emerge che...\n```'))
      .toBe('Dalla disamina complessiva emerge che...');
  });

  it('toglie il wrapper con language tag', () => {
    expect(stripCodeFences('```markdown\ntesto del report\n```')).toBe('testo del report');
  });

  it('toglie fence sparse / non chiuse', () => {
    expect(stripCodeFences('```\nfoo senza chiusura')).toBe('foo senza chiusura');
  });

  it('NON tocca prosa normale (nessun fence)', () => {
    const prosa = 'Dalla documentazione in atti risulta che il periziando...';
    expect(stripCodeFences(prosa)).toBe(prosa);
  });

  it('è idempotente (riapplicabile dopo CoVe senza danni)', () => {
    const fenced = '```\nDalla disamina...\n```';
    const once = stripCodeFences(fenced);
    expect(stripCodeFences(once)).toBe(once);
  });
});

describe('stripGuardMarkersInsideQuotes — integrità del virgolettato verbatim (fix depositabile)', () => {
  it('toglie "[non documentato]" DENTRO le «...»', () => {
    expect(stripGuardMarkersInsideQuotes('«frattura composta [non documentato] del radio»'))
      .toBe('«frattura composta del radio»');
  });

  it('toglie "[dato non risultante…]" dentro le «...»', () => {
    expect(stripGuardMarkersInsideQuotes('«lesione [dato non risultante dalla documentazione] grave»'))
      .toBe('«lesione grave»');
  });

  it('NON tocca i marker FUORI dalle «...» (la cautela resta valida fuori)', () => {
    const t = '«testo fedele» [non documentato] nel resto della prosa';
    expect(stripGuardMarkersInsideQuotes(t)).toBe(t);
  });

  it('NON tocca prosa senza caporali', () => {
    const t = 'Il dato [non documentato] resta nella prosa normale.';
    expect(stripGuardMarkersInsideQuotes(t)).toBe(t);
  });

  it('gestisce più citazioni nello stesso testo', () => {
    expect(stripGuardMarkersInsideQuotes('«a [non documentato] b» e «c [non documentato] d»'))
      .toBe('«a b» e «c d»');
  });

  // Panel RC 2026-07-02 (Motta, P1): annotazioni editoriali schedate tipo
  // "[Diagnosi: ...]" iniettate dall'LLM DENTRO il virgolettato — testo non
  // del medico in un atto depositabile.
  it('toglie le annotazioni schedate "[Diagnosi: ...]" dentro le «...»', () => {
    expect(stripGuardMarkersInsideQuotes('«rima di frattura in consolidamento [Diagnosi: frattura radio distale]»'))
      .toBe('«rima di frattura in consolidamento»');
  });

  it('toglie le etichette-schema note (Raccomandazioni/Follow-up/Terapia/Prognosi) dentro le «...»', () => {
    expect(stripGuardMarkersInsideQuotes('«prosegue FKT [Raccomandazioni: controllo a 30 giorni] come da programma»'))
      .toBe('«prosegue FKT come da programma»');
    expect(stripGuardMarkersInsideQuotes('«quadro stabile [Follow-up: RX di controllo]»'))
      .toBe('«quadro stabile»');
  });

  it('NON tocca parentesi quadre generiche dentro le «...» (potrebbero essere del documento)', () => {
    const t = '«valore fuori range [v.n. 4.0-10.0]»';
    expect(stripGuardMarkersInsideQuotes(t)).toBe(t);
  });

  it('NON tocca le annotazioni schedate FUORI dalle «...»', () => {
    const t = 'Nella prosa [Diagnosi: frattura] resta com\'è.';
    expect(stripGuardMarkersInsideQuotes(t)).toBe(t);
  });
});

describe('buildDocSanitariaChunkSpec — nota RC vs non-RC', () => {
  const base = { id: 'documentazione_sanitaria', promptDirective: 'BASE' } as SectionSpec;
  it('RC (excludeLabTests): nota VERBATIM per-documento, NON "selettiva", niente inventario', () => {
    const rc = buildDocSanitariaChunkSpec({ ...base, excludeLabTests: true }, 0, 3);
    expect(rc.promptDirective).toMatch(/VERBATIM/);
    expect(rc.promptDirective).toMatch(/un blocco per documento/i);
    expect(rc.promptDirective).not.toMatch(/narrazione cronologica selettiva/i);
  });
  it('non-RC: mantiene la nota selettiva storica', () => {
    const ctu = buildDocSanitariaChunkSpec({ ...base, excludeLabTests: false }, 0, 3);
    expect(ctu.promptDirective).toMatch(/narrazione cronologica selettiva/i);
  });
});

describe('capEventsForNarrativeSection — budget eventi per sezioni narrative (CASO-2026-219, 857 eventi)', () => {
  const mk = (i: number, eventType = 'visita', diagnosis: string | null = null) => ({
    eventType, eventDate: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    diagnosis, sourceType: null, discrepancyNote: null,
  });

  it('non tocca liste sotto budget', () => {
    const events = Array.from({ length: 50 }, (_, i) => mk(i));
    const r = capEventsForNarrativeSection(events, 'anamnesi');
    expect(r.capped).toBe(false);
    expect(r.events).toHaveLength(50);
  });

  it('cappa una lista da 900 eventi al budget della sezione preservando ordine', () => {
    const events = Array.from({ length: 900 }, (_, i) => mk(i));
    const r = capEventsForNarrativeSection(events, 'anamnesi');
    expect(r.capped).toBe(true);
    expect(r.events.length).toBeLessThanOrEqual(120);
    // ordine cronologico originale preservato (indici crescenti)
    const idx = r.events.map((e) => events.indexOf(e));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('include SEMPRE i primi e gli ultimi 10 eventi (evento indice + stato attuale)', () => {
    const events = Array.from({ length: 900 }, (_, i) => mk(i));
    const r = capEventsForNarrativeSection(events, 'il_fatto_e_storia_clinica');
    for (let i = 0; i < 10; i++) expect(r.events).toContain(events[i]);
    for (let i = 890; i < 900; i++) expect(r.events).toContain(events[i]);
  });

  it('prioritizza i T1 (diagnosi documentate) dentro il budget', () => {
    // 900 eventi di routine (T3) con UN SOLO T1 in mezzo: deve sopravvivere al cap.
    const events = Array.from({ length: 900 }, (_, i) =>
      mk(i, 'visita', i === 500 ? 'frattura femore' : null));
    const r = capEventsForNarrativeSection(events, 'anamnesi');
    expect(r.events).toContain(events[500]); // T1 per diagnosi
  });

  it('quando i T1 superano il budget, li prende in ordine cronologico (dal fronte)', () => {
    const events = Array.from({ length: 900 }, (_, i) => mk(i, 'intervento')); // tutti T1
    const r = capEventsForNarrativeSection(events, 'anamnesi');
    expect(r.events.length).toBeLessThanOrEqual(120);
    expect(r.events).toContain(events[0]);
    expect(r.events).toContain(events[899]); // ultimi 10 garantiti comunque
  });
});

describe('stripGuardFormulaFromDocSanitariaTitles — via la formula di cautela dai TITOLI (CASO-2026-219)', () => {
  it('toglie "[dato non risultante...]" dallo slot struttura del titolo', () => {
    const md = '**Cartella clinica, [dato non risultante dalla documentazione in atti], in data 05.03.2024:**\nTesto del blocco.';
    const out = stripGuardFormulaFromDocSanitariaTitles(md);
    expect(out).toContain('**Cartella clinica, in data 05.03.2024:**');
    expect(out).not.toContain('dato non risultante');
    expect(out).toContain('Testo del blocco.');
  });

  it('NON tocca la formula nella PROSA (solo i titoli grassetto che finiscono con :**)', () => {
    const md = 'La struttura [dato non risultante dalla documentazione in atti] ha erogato la prestazione.';
    expect(stripGuardFormulaFromDocSanitariaTitles(md)).toBe(md);
  });

  it('è idempotente e lascia intatti i titoli già puliti', () => {
    const md = '**Referto RX femore destro, Ospedale di Prova, in data 22.09.2025:**';
    expect(stripGuardFormulaFromDocSanitariaTitles(md)).toBe(md);
    expect(stripGuardFormulaFromDocSanitariaTitles(stripGuardFormulaFromDocSanitariaTitles(md))).toBe(md);
  });
});

describe('demoteStrayBoldParagraphs — il grassetto resta solo sulle intestazioni (formato gold)', () => {
  it('de-emfatizza un intero paragrafo narrativo reso in bold', () => {
    const long = 'Il paziente presentava un quadro clinico complesso caratterizzato da dolore persistente e limitazione funzionale, con necessità di trattamento riabilitativo prolungato nel tempo secondo indicazione specialistica.';
    const md = `**${long}**`;
    expect(demoteStrayBoldParagraphs(md)).toBe(long);
  });

  it('NON tocca una riga-intestazione legittima (breve, termina con ":")', () => {
    const h = '**Cartella clinica, Ospedale di Verona, in data 16.07.2023:**';
    expect(demoteStrayBoldParagraphs(h)).toBe(h);
  });

  it('NON tocca grassetti inline brevi dentro il testo', () => {
    const md = 'Diagnosi di **frattura del femore** con indicazione chirurgica.';
    expect(demoteStrayBoldParagraphs(md)).toBe(md);
  });

  it('è idempotente', () => {
    const long = 'x'.repeat(200);
    const once = demoteStrayBoldParagraphs(`**${long}**`);
    expect(demoteStrayBoldParagraphs(once)).toBe(once);
  });
});

describe('buildDocSanitariaBlockHeader — intestazione canonica formato gold', () => {
  it('include struttura quando presente', () => {
    expect(buildDocSanitariaBlockHeader('Cartella clinica', 'Ospedale X', '16.07.2023'))
      .toBe('**Cartella clinica, Ospedale X, in data 16.07.2023:**');
  });
  it('omette struttura quando assente (niente virgola doppia)', () => {
    expect(buildDocSanitariaBlockHeader('Referto di esame strumentale', null, '05.03.2024'))
      .toBe('**Referto di esame strumentale, in data 05.03.2024:**');
  });
});
