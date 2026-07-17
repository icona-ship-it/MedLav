import { describe, it, expect } from 'vitest';
import { verifySourceTexts, groundCitation } from './source-text-verifier';
import type { ExtractedEvent } from '../extraction/extraction-schemas';

describe('groundCitation — marker markdown (audit 2026-06-09 #4: no fusione parole)', () => {
  it('una citazione fedele combacia anche quando l\'OCR ha il grassetto', () => {
    const ocr = 'Diagnosi: frattura **composta** del radio distale destro, conservativa.';
    expect(groundCitation('frattura composta del radio distale destro', ocr)).not.toBe('absent');
  });

  it('i marker NON fondono parole adiacenti → niente falso match "normalized"', () => {
    // Con strip→'' (bug) "**alfa**beta" diventerebbe "alfabeta" e "alfabeta"
    // risulterebbe presente. Con strip→' ' resta "alfa beta": nessun match.
    const ocr = 'Referto: **alfa**beta gamma delta.';
    expect(groundCitation('alfabeta', ocr)).toBe('absent');
  });
});

function makeEvent(overrides: Partial<ExtractedEvent> = {}): ExtractedEvent {
  return {
    eventDate: '2024-01-15',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Visita ortopedica',
    description: 'Paziente si presenta con dolore al ginocchio sinistro',
    sourceType: 'referto_controllo',
    confidence: 80,
    requiresVerification: false,
    diagnosis: null,
    doctor: null,
    facility: null,
    reliabilityNotes: null,
    sourceText: 'Paziente si presenta con dolore al ginocchio sinistro',
    sourcePages: [1],
    ...overrides,
  };
}

const FULL_TEXT = `[PAGE_START:1]
Paziente si presenta con dolore al ginocchio sinistro.
Esame obiettivo: ginocchio tumefatto, limitazione funzionale.
RX ginocchio sinistro: frattura del piatto tibiale laterale.
[PAGE_END:1]
[PAGE_START:2]
Diagnosi: frattura del piatto tibiale laterale tipo Schatzker II.
Si consiglia intervento chirurgico di osteosintesi.
[PAGE_END:2]`;

describe('verifySourceTexts', () => {
  it('should verify exact match of sourceText', () => {
    const events = [makeEvent({
      sourceText: 'Paziente si presenta con dolore al ginocchio sinistro.',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.unverifiedCount).toBe(0);
    expect(result.verifications[0].matchLevel).toBe('exact');
    expect(result.verifications[0].verified).toBe(true);
  });

  it('should verify normalized match (whitespace differences)', () => {
    const events = [makeEvent({
      sourceText: 'paziente  si  presenta  con  dolore  al  ginocchio  sinistro.',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.unverifiedCount).toBe(0);
    expect(result.verifications[0].matchLevel).toBe('normalized');
    expect(result.verifications[0].verified).toBe(true);
  });

  it('should verify LCS match for slightly modified sourceText', () => {
    const events = [makeEvent({
      sourceText: 'Paziente si presenta dolore ginocchio sinistro, esame obiettivo ginocchio tumefatto limitazione funzionale',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.verifications[0].verified).toBe(true);
    expect(result.verifications[0].matchLevel).toBe('lcs');
    expect(result.verifications[0].lcsRatio).toBeGreaterThanOrEqual(0.80);
  });

  it('anchor fabbricata su evento di ROUTINE (visita): cap morbido + nota, NIENTE coda di verifica', () => {
    // Proporzionalità (caso 225: 95/180 flaggati = coda inutilizzabile): la
    // parafrasi dell anchor non rende falsi i fatti di un evento di routine.
    const events = [makeEvent({
      eventType: 'visita',
      sourceText: 'Il paziente ha subito un trapianto di cuore presso il Policlinico Gemelli di Roma il 15 marzo 2024',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.unverifiedCount).toBe(1);
    expect(result.verifications[0].verified).toBe(false);
    expect(result.events[0].requiresVerification).toBe(false);
    expect(result.events[0].confidence).toBe(55); // ROUTINE_ANCHOR_MISS_CAP
    expect(result.events[0].reliabilityNotes).toContain('possibile parafrasi');
  });

  it('anchor fabbricata su evento LOAD-BEARING (diagnosi): cap 30 + coda di verifica', () => {
    const events = [makeEvent({
      eventType: 'diagnosi',
      sourceText: 'Il paziente ha subito un trapianto di cuore presso il Policlinico Gemelli di Roma il 15 marzo 2024',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.unverifiedCount).toBe(1);
    expect(result.events[0].requiresVerification).toBe(true);
    expect(result.events[0].confidence).toBe(30);
    expect(result.events[0].reliabilityNotes).toContain('Testo sorgente non riscontrato');
  });

  it('sourceText vuoto su routine: nota morbida senza coda; su intervento: flag', () => {
    const routine = verifySourceTexts([makeEvent({ eventType: 'visita', sourceText: '' })], FULL_TEXT);
    expect(routine.unverifiedCount).toBe(1);
    expect(routine.events[0].requiresVerification).toBe(false);
    expect(routine.events[0].reliabilityNotes).toContain('Citazione sorgente assente');

    const loadBearing = verifySourceTexts([makeEvent({ eventType: 'intervento', sourceText: '' })], FULL_TEXT);
    expect(loadBearing.events[0].requiresVerification).toBe(true);
    expect(loadBearing.events[0].reliabilityNotes).toContain('Testo sorgente assente');
  });

  it('should skip LCS for very short sourceText', () => {
    const events = [makeEvent({ sourceText: 'dolore ginocchio' })];

    const result = verifySourceTexts(events, FULL_TEXT);

    // Short text — only exact/normalized checked, both fail
    expect(result.verifications[0].lcsRatio).toBeNull();
  });

  it('should handle empty full text', () => {
    const events = [makeEvent()];
    const result = verifySourceTexts(events, '');

    expect(result.unverifiedCount).toBe(1);
  });

  it('should preserve existing reliability notes when appending', () => {
    const events = [makeEvent({
      eventType: 'diagnosi', // nota "dura" solo sui load-bearing (policy 2026-07-17)
      sourceText: 'Testo completamente inventato che non esiste da nessuna parte nel documento',
      reliabilityNotes: 'Testo manoscritto',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.events[0].reliabilityNotes).toContain('Testo manoscritto');
    expect(result.events[0].reliabilityNotes).toContain('Testo sorgente non riscontrato');
  });

  it('should not modify verified events', () => {
    const events = [makeEvent({
      sourceText: 'frattura del piatto tibiale laterale tipo Schatzker II',
      requiresVerification: false,
      reliabilityNotes: null,
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.events[0].requiresVerification).toBe(false);
    expect(result.events[0].reliabilityNotes).toBeNull();
  });
});

describe('verifySourceTexts — gate di confidenza (anchor non riscontrato)', () => {
  it('should cap confidence for an event whose sourceText is absent from the OCR', () => {
    const events = [makeEvent({
      eventType: 'diagnosi', // gate duro: solo tipi load-bearing (policy 2026-07-17)
      confidence: 90,
      sourceText: 'citazione completamente inventata che non esiste nel documento originale',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.unverifiedCount).toBe(1);
    expect(result.events[0].confidence).toBeLessThanOrEqual(30);
    expect(result.events[0].requiresVerification).toBe(true);
  });

  it('should cap confidence when sourceText is empty', () => {
    const events = [makeEvent({ eventType: 'diagnosi', confidence: 85, sourceText: '' })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.events[0].confidence).toBeLessThanOrEqual(30);
  });

  it('should not raise a confidence already below the cap', () => {
    const events = [makeEvent({ confidence: 15, sourceText: 'testo inventato mai presente nel documento sorgente' })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.events[0].confidence).toBe(15);
  });

  it('should NOT touch confidence of verified events', () => {
    const events = [makeEvent({
      confidence: 90,
      sourceText: 'Paziente si presenta con dolore al ginocchio sinistro.',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.events[0].confidence).toBe(90);
  });
});
