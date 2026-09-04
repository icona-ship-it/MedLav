import { describe, it, expect } from 'vitest';
import { buildVerificationAppendix } from './verification-appendix';
import { EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA, EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA_REASONS } from '@/lib/document-type-labels';

/**
 * Appendice di verifica (valutazione 2026-09-04): le reti anti-errore
 * esistono ma il medico non le vede; il concorrente chiude con una riga
 * "nessuna omissione rilevata" non verificabile. Qui ogni numero è calcolato
 * dai dati del caso e dice cosa è stato trascritto, cosa no e perché, e cosa
 * resta da controllare. Dati interamente fittizi.
 */
const docs = [
  { id: 'd1', fileName: 'referto.jpg', documentType: 'referto_specialistico', pages: [{ pageNumber: 1, ocrText: 'Visita del 22/05/2026' }, { pageNumber: 2, ocrText: 'Storia clinica' }] },
  { id: 'd2', fileName: 'fattura.pdf', documentType: 'spese_mediche', pages: [{ pageNumber: 1, ocrText: 'Fattura n. 1' }] },
  { id: 'd3', fileName: 'vuoto.pdf', documentType: 'altro', pages: [] },
  { id: 'd4', fileName: 'ctu.pdf', documentType: 'perizia_ctu', pages: [{ pageNumber: 1, ocrText: 'Relazione' }] },
];
const events = [
  { document_id: 'd1', event_date: '2026-05-22', event_type: 'visita', requires_verification: false, temporal_scope: 'corrente', is_relevant_for_chronology: true },
  { document_id: 'd1', event_date: '2026-02-27', event_type: 'esame', requires_verification: false, temporal_scope: 'retrospettivo', is_relevant_for_chronology: true },
  { document_id: 'd1', event_date: '2026-06-18', event_type: 'esame', requires_verification: true, temporal_scope: 'programmato', is_relevant_for_chronology: true },
  { document_id: 'd2', event_date: '2026-03-01', event_type: 'spesa_medica', requires_verification: false, temporal_scope: 'corrente', is_relevant_for_chronology: true },
  { document_id: 'd1', event_date: '2026-05-22', event_type: 'visita', requires_verification: true, temporal_scope: 'corrente', is_relevant_for_chronology: false },
];
const coverage = new Map([['d1', { rendered: 2, total: 2, withText: 2 }]]);

describe('buildVerificationAppendix — cronistoria', () => {
  const out = buildVerificationAppendix({ mode: 'cronistoria', documents: docs, events, transcription: coverage });

  it('conta documenti ricevuti, trascritti e non trascritti con il motivo dalla stessa sorgente del renderer; mai nomi file', () => {
    expect(out).toContain('Documenti ricevuti: 4');
    expect(out).toContain('Trascritti integralmente: 1');
    expect(out).toContain('Non trascritti: 3');
    expect(out).toMatch(/Spese Mediche: giustificativo di spesa/);
    expect(out).toMatch(/\(CTU\): atto peritale/);
    expect(out).toMatch(/nessuna pagina letta/);
    expect(out).not.toContain('referto.jpg');
    expect(out).not.toContain('fattura.pdf');
  });

  it('conta pagine lette e pagine senza testo', () => {
    expect(out).toContain('Pagine lette: 4');
    expect(out).toContain('Pagine senza testo leggibile: 0');
  });

  it('riassume gli eventi: in cronistoria, riferiti, programmati, da verificare, esclusi dal perito; ignora i non clinici', () => {
    expect(out).toContain('Eventi clinici in cronistoria: 3');
    expect(out).toContain('di cui riferiti in anamnesi: 1');
    expect(out).toContain('di cui programmati: 1');
    expect(out).toContain('Eventi da verificare: 1');
    expect(out).toContain('Eventi esclusi dal perito: 1');
  });

  it('trascrizione PARZIALE (filtro per-pagina sui documenti grandi) è dichiarata, mai spacciata per integrale', () => {
    const big = { id: 'big', fileName: 'cartella.pdf', documentType: 'cartella_clinica', pages: Array.from({ length: 20 }, (_, i) => ({ pageNumber: i + 1, ocrText: `p${i + 1}` })) };
    const out2 = buildVerificationAppendix({ mode: 'cronistoria', documents: [big], events: [], transcription: new Map([['big', { rendered: 6, total: 20, withText: 6 }]]) });
    expect(out2).toContain('Trascritti integralmente: 0');
    expect(out2).toContain('Trascritti parzialmente: 1');
    expect(out2).toContain('Cartella Clinica: 6 pagine su 20');
  });

  it('un evento corrente SENZA data non è "in cronistoria": riga dedicata, conteggio coerente col rendering', () => {
    const out3 = buildVerificationAppendix({
      mode: 'cronistoria',
      documents: [docs[0]],
      events: [
        { document_id: 'd1', event_date: '2026-05-22', event_type: 'visita', temporal_scope: 'corrente' },
        { document_id: 'd1', event_date: '1900-01-01', event_type: 'esame', temporal_scope: 'corrente' },
      ],
      transcription: coverage,
    });
    expect(out3).toContain('Eventi clinici in cronistoria: 1');
    expect(out3).toContain('Eventi senza data, non collocati in cronistoria: 1');
  });

  it('segnala i documenti trascritti senza eventi e gli eventi da documenti non trascritti', () => {
    const out4 = buildVerificationAppendix({
      mode: 'cronistoria',
      documents: [
        { id: 'x', fileName: 'ref.pdf', documentType: 'referto_specialistico', pages: [{ pageNumber: 1, ocrText: 'testo' }] },
        { id: 'y', fileName: 'fatt.pdf', documentType: 'spese_mediche', pages: [{ pageNumber: 1, ocrText: 'fattura' }] },
      ],
      events: [{ document_id: 'y', event_date: '2026-03-01', event_type: 'visita', temporal_scope: 'corrente' }],
      transcription: new Map([['x', { rendered: 1, total: 1, withText: 1 }]]),
    });
    expect(out4).toMatch(/senza eventi estratti: 1/);
    expect(out4).toContain('Eventi provenienti da documenti non trascritti: 1');
  });

  it('file uniti: assorbiti (0 pagine) = non documenti; con pagine proprie = "non ancora rielaborati"', () => {
    const out5 = buildVerificationAppendix({
      mode: 'cronistoria',
      documents: [
        { id: 'p', fileName: 'a.jpg', documentType: 'referto_specialistico', pages: [{ pageNumber: 1, ocrText: 'p1' }, { pageNumber: 2, ocrText: 'p2' }] },
        { id: 's2', fileName: 'b.jpg', documentType: 'altro', pages: [], mergedIntoDocumentId: 'p' },
        { id: 's3', fileName: 'c.jpg', documentType: 'altro', pages: [{ pageNumber: 1, ocrText: 'ancora qui' }], mergedIntoDocumentId: 'p' },
      ],
      events: [{ document_id: 'p', event_date: '2026-05-22', event_type: 'visita', temporal_scope: 'corrente' }],
      transcription: new Map([['p', { rendered: 2, total: 2, withText: 2 }], ['s3', { rendered: 1, total: 1, withText: 1 }]]),
    });
    expect(out5).toContain('Documenti ricevuti: 2 (3 file: 1 uniti come pagine di un documento multi-pagina)');
    expect(out5).toContain('File uniti ma non ancora rielaborati: 1');
    expect(out5).toContain('Pagine lette: 3');
  });

  it('input vuoto → appendice comunque valida, nessun crash', () => {
    const out6 = buildVerificationAppendix({ mode: 'cronistoria', documents: [], events: [] });
    expect(out6).toContain('Documenti ricevuti: 0');
  });
});

describe('buildVerificationAppendix — spese', () => {
  it('modulo spese: documenti (giustificativi/altri), pagine e voci; niente righe di trascrizione né eventi', () => {
    const out = buildVerificationAppendix({ mode: 'spese', documents: docs, events, expenses: { items: 8, excludedFromTotal: 1 } });
    expect(out).toContain('Giustificativi di spesa: 1');
    expect(out).toContain('Altri documenti (referti, cartelle, atti): 3');
    expect(out).toContain('Voci di spesa estratte: 8');
    expect(out).toContain('non sommate al totale (acconti già assorbiti): 1');
    expect(out).not.toContain('Trascritti');
    expect(out).not.toContain('Eventi clinici');
  });
});

describe('motivi di esclusione — stessa sorgente del renderer (invariante)', () => {
  it('ogni tipo escluso dalla doc-sanitaria ha un motivo, e nessun motivo per tipi non esclusi', () => {
    for (const t of EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA) expect(EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA_REASONS[t]).toBeTruthy();
    for (const t of Object.keys(EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA_REASONS)) expect(EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA.has(t)).toBe(true);
  });
});

describe('pagine senza testo (giro avversariale 2026-09-04)', () => {
  const blankDoc = {
    id: 'blank', fileName: 'b.pdf', documentType: 'cartella_clinica',
    pages: [{ pageNumber: 1, ocrText: '' }, { pageNumber: 2, ocrText: '   ' }],
  };
  it('un documento le cui pagine sono tutte senza testo NON è "trascritto integralmente"', () => {
    const out = buildVerificationAppendix({
      mode: 'cronistoria', documents: [blankDoc], events: [],
      transcription: new Map([['blank', { rendered: 2, total: 2, withText: 0 }]]),
    });
    expect(out).toContain('Trascritti integralmente: 0');
    expect(out).toContain('Non trascritti: 1');
    expect(out).toContain('senza testo leggibile');
  });
  it('un documento con alcune pagine illeggibili è "parziale" e lo dice', () => {
    const doc = { ...blankDoc, id: 'mixed', pages: [{ pageNumber: 1, ocrText: 'testo' }, { pageNumber: 2, ocrText: '' }] };
    const out = buildVerificationAppendix({
      mode: 'cronistoria', documents: [doc], events: [],
      transcription: new Map([['mixed', { rendered: 2, total: 2, withText: 1 }]]),
    });
    expect(out).toContain('Trascritti integralmente: 0');
    expect(out).toContain('Trascritti parzialmente');
    expect(out).toContain('1 pagine leggibili su 2');
  });
});
