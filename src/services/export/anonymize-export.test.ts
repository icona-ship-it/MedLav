/**
 * Invarianti anonimizzazione input export DOCX (audit 2026-08-11, E-1/H-2).
 * Universo fittizio: Demprova / Cittàdemo / via degli Esempi.
 */
import { describe, it, expect } from 'vitest';
import type { PeriziaMetadata } from '@/types';
import {
  anonymizeEventsForExport,
  anonymizeDocsForExport,
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
