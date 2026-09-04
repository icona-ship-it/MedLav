/**
 * Invarianti anonimizzazione input export DOCX (audit 2026-08-11, E-1/H-2).
 * Universo fittizio: Demprova / Cittàdemo / via degli Esempi.
 */
import { describe, it, expect } from 'vitest';
import type { PeriziaMetadata } from '@/types';
import {
  anonymizeEventsForExport,
  anonymizeDocsForExport,
  collectKnownIdentityNames,
  anonymizePmForExport,
} from './anonymize-export';

const PM: PeriziaMetadata = {
  patientFullName: 'Demprova Testina',
  ctuName: 'Dott. Mario Esempi',
  esameObiettivo:
    'Paziente Demprova Testina, nata il 15/05/1985, residente in via degli Esempi 1, Cittàdemo. Obiettività: dolore al ginocchio destro.',
} as PeriziaMetadata;

describe('anonymizeEventsForExport — redige il testo, preserva i campi strutturati', () => {
  it('redige i campi testuali ma lascia intatta event_date (parsata dal generatore)', () => {
    const events = [
      {
        order_number: 1,
        event_date: '2024-03-15',
        event_type: 'visita',
        title: 'Visita di Demprova Testina',
        description: 'La paziente Demprova Testina riferisce dolore.',
        diagnosis: 'Distorsione',
        doctor: 'Dott. Mario Esempi',
        facility: 'Ospedale Civile di Cittàdemo',
        source_text: 'refertata da Demprova Testina il 15/05/1985',
      },
    ];
    const [out] = anonymizeEventsForExport(events, PM);
    // Strutturati: invariati (niente [DATA] al posto di una data che verrà formattata).
    expect(out.event_date).toBe('2024-03-15');
    expect(out.event_type).toBe('visita');
    expect(out.order_number).toBe(1);
    // Testuali: il nome del periziando NON deve comparire.
    expect(out.title).not.toContain('Demprova');
    expect(out.title).not.toContain('Testina');
    expect(out.description).not.toContain('Demprova');
    expect(out.source_text).not.toContain('Demprova');
    // Campi-identità: redatti per intero (anche un nome medico "nudo").
    expect(out.doctor).toBe('[MEDICO]');
    expect(out.facility).toBe('[STRUTTURA]');
  });

  it('redige anche expert_notes (nota libera del perito) — leak trovato dal 2° giro', () => {
    const [out] = anonymizeEventsForExport(
      [{ event_date: '2026-03-15', expert_notes: 'Il sig. Demprova Testina riferisce dolore al risveglio.' }],
      PM,
    );
    expect(String(out.expert_notes)).not.toContain('Demprova');
    expect(String(out.expert_notes)).not.toContain('Testina');
  });

  it('redige anche un nome medico NUDO (senza titolo, che l\'anonimizzatore-prosa non cattura)', () => {
    const [out] = anonymizeEventsForExport(
      [{ event_date: '2026-03-15', doctor: 'Carlo Demprovetti', facility: 'Ospedale di Cittàdemo' }],
      undefined,
    );
    expect(out.doctor).toBe('[MEDICO]');
    expect(out.doctor).not.toContain('Demprovetti');
  });
});

describe('anonymizeDocsForExport — redige fileName e OCR', () => {
  it('redige il nome nel filename e nel testo OCR delle pagine', () => {
    const docs = [
      {
        id: 'doc-1',
        documentType: 'referto',
        pageCount: 1,
        fileName: 'cartella_demprova_testina.pdf',
        pages: [{ ocrText: 'Intestazione: DEMPROVA TESTINA nato il 15/05/1985 a Cittàdemo' }],
      },
    ];
    const [out] = anonymizeDocsForExport(docs, PM);
    expect(out.id).toBe('doc-1');
    expect(out.documentType).toBe('referto');
    expect(String(out.fileName).toLowerCase()).not.toContain('demprova');
    const pages = out.pages as Array<{ ocrText: string }>;
    expect(pages[0].ocrText).not.toContain('DEMPROVA');
    expect(pages[0].ocrText).not.toContain('TESTINA');
  });
});

describe('anonymizePmForExport — redige nomi/date/indirizzi, preserva i non-PII', () => {
  it('esame obiettivo senza PII, perito → [PERITO], campo non-PII invariato', () => {
    const pmRaw: Record<string, unknown> = {
      ...PM,
      sezione: 'Sezione Prima',
      quesiti: ['Accerti il consulente le lesioni riportate da Demprova Testina.'],
    };
    const out = anonymizePmForExport(pmRaw, PM)!;
    const esame = String(out.esameObiettivo);
    expect(esame).not.toContain('Demprova');
    expect(esame).not.toContain('Testina');
    expect(esame).not.toContain('via degli Esempi');
    expect(esame).not.toContain('15/05/1985');
    // Il perito è redatto (placeholder generico dell'anonimizzatore, come nell'HTML).
    expect(String(out.ctuName)).not.toContain('Mario');
    expect(String(out.ctuName)).not.toContain('Esempi');
    expect(String(out.ctuName)).toMatch(/\[[A-Z_]+\d*\]/);
    // Campo strutturale non-PII: invariato.
    expect(out.sezione).toBe('Sezione Prima');
    // Array di stringhe: redatto elemento per elemento.
    const quesiti = out.quesiti as string[];
    expect(quesiti[0]).not.toContain('Demprova');
  });

  it('null → null', () => {
    expect(anonymizePmForExport(null, PM)).toBeNull();
  });
});

describe('anonymizeDocsForExport — propagazione cross-pagina (giro avversariale 2026-09-04)', () => {
  it('redige a pagina 5 la forma minuscola/invertita del nome rilevato a pagina 1', () => {
    const docs = [
      {
        id: 'doc-x',
        fileName: 'referto.pdf',
        pages: [
          { pageNumber: 1, ocrText: 'Paziente: DEMPROVA MARIO\nvisita del giorno' },
          { pageNumber: 2, ocrText: 'pagina intermedia senza nomi' },
          { pageNumber: 5, ocrText: 'consegnato a demprova mario in data 12/03/2026.' },
        ],
      },
    ];
    const [out] = anonymizeDocsForExport(docs, PM);
    const texts = (out.pages as Array<{ ocrText: string }>).map((p) => p.ocrText);
    expect(texts).toHaveLength(3);
    expect(texts[1]).toBe('pagina intermedia senza nomi');
    expect(texts.join('\n').toLowerCase()).not.toContain('demprova');
    expect(texts.join('\n').toLowerCase()).not.toContain('mario');
  });

  it('usa placeholder coerenti tra pagine dello stesso documento (stessa data → stesso placeholder)', () => {
    const docs = [
      {
        id: 'doc-y',
        fileName: 'referto.pdf',
        pages: [
          { pageNumber: 1, ocrText: 'Data esame 12/03/2026' },
          { pageNumber: 2, ocrText: 'Data esame 12/03/2026 e controllo 20/04/2026' },
        ],
      },
    ];
    const [out] = anonymizeDocsForExport(docs, PM);
    const texts = (out.pages as Array<{ ocrText: string }>).map((p) => p.ocrText);
    const first = texts[0].match(/\[DATA_\d+\]/)?.[0];
    expect(first).toBeTruthy();
    expect(texts[1]).toContain(first!);
    expect(texts[1]).toMatch(/\[DATA_\d+\].*\[DATA_\d+\]/);
    const [a, b] = texts[1].match(/\[DATA_\d+\]/g)!;
    expect(a).not.toBe(b);
  });

  it('non tocca le pagine senza ocrText e conserva il numero di pagine', () => {
    const docs = [
      { id: 'doc-z', fileName: 'x.pdf', pages: [{ pageNumber: 1 }, { pageNumber: 2, ocrText: '' }, { pageNumber: 3, ocrText: 'Sig. Mario Demprova' }] },
    ];
    const [out] = anonymizeDocsForExport(docs, PM);
    const pages = out.pages as Array<Record<string, unknown>>;
    expect(pages).toHaveLength(3);
    expect(pages[0]).toEqual({ pageNumber: 1 });
    expect(pages[1].ocrText).toBe('');
    expect(String(pages[2].ocrText).toLowerCase()).not.toContain('demprova');
  });
});

describe('anonymizeDocsForExport — medici/strutture noti dagli eventi', () => {
  it('redige nel corpo OCR il medico e la struttura degli eventi anche senza titolo e in minuscolo', () => {
    const known = collectKnownIdentityNames([
      { doctor: 'Dott. Bianchi Luca', facility: 'Studio Fisioterapico Esempi' },
      { doctor: 'Rossi', facility: null },
    ]);
    const docs = [{ id: 'd', fileName: 'x.pdf', pages: [{ pageNumber: 1, ocrText: 'refertato da Bianchi   Luca presso lo studio fisioterapico esempi; il dott. Rossi non c\'era. Il costato è integro.' }] }];
    const [out] = anonymizeDocsForExport(docs, PM, known);
    const text = String((out.pages as Array<{ ocrText: string }>)[0].ocrText);
    expect(text).not.toContain('Bianchi');
    expect(text).not.toContain('esempi');
    expect(text).toContain('[MEDICO]');
    expect(text).toContain('[STRUTTURA]');
    // cognome singolo: NON redatto qui (resta al passaggio-prosa), parole comuni intatte
    expect(text).toContain('costato');
  });
});

describe('anonymizeDocsForExport — nomi noti: forme invertite e valori generici', () => {
  it('redige anche l\'ordine invertito di un nome a 2 token e NON i valori generici', () => {
    const known = collectKnownIdentityNames([
      { doctor: 'Dott.ssa Anna Verdi', facility: 'Pronto Soccorso' },
      { doctor: 'Medico curante', facility: 'Non specificato' },
    ]);
    const docs = [{ id: 'd', fileName: 'x.pdf', pages: [{ pageNumber: 1, ocrText: 'Visita con Verdi Anna; accesso in pronto soccorso; il medico curante non è specificato.' }] }];
    const [out] = anonymizeDocsForExport(docs, PM, known);
    const text = String((out.pages as Array<{ ocrText: string }>)[0].ocrText);
    expect(text).not.toContain('Verdi');
    expect(text).toContain('pronto soccorso');
    expect(text).toContain('medico curante');
  });
});
