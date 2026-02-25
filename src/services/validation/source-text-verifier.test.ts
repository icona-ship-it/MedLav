import { describe, it, expect } from 'vitest';
import { verifySourceTexts } from './source-text-verifier';
import type { ExtractedEvent } from '../extraction/extraction-schemas';

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
      sourceText: 'Paziente presenta dolore al ginocchio sinistro con tumefazione e limitazione funzionale',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.verifications[0].verified).toBe(true);
    expect(result.verifications[0].matchLevel).toBe('lcs');
    expect(result.verifications[0].lcsRatio).toBeGreaterThanOrEqual(0.70);
  });

  it('should mark fabricated sourceText as unverified', () => {
    const events = [makeEvent({
      sourceText: 'Il paziente ha subito un trapianto di cuore presso il Policlinico Gemelli di Roma il 15 marzo 2024',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.unverifiedCount).toBe(1);
    expect(result.verifications[0].verified).toBe(false);
    expect(result.events[0].requiresVerification).toBe(true);
    expect(result.events[0].reliabilityNotes).toContain('sourceText non verificato');
  });

  it('should handle empty sourceText', () => {
    const events = [makeEvent({ sourceText: '' })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.unverifiedCount).toBe(1);
    expect(result.events[0].requiresVerification).toBe(true);
    expect(result.events[0].reliabilityNotes).toContain('sourceText assente');
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
      sourceText: 'Testo completamente inventato che non esiste da nessuna parte nel documento',
      reliabilityNotes: 'Testo manoscritto',
    })];

    const result = verifySourceTexts(events, FULL_TEXT);

    expect(result.events[0].reliabilityNotes).toContain('Testo manoscritto');
    expect(result.events[0].reliabilityNotes).toContain('sourceText non verificato');
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
