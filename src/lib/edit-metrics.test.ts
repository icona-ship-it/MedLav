import { describe, it, expect } from 'vitest';
import { computeEditRatePercent, sha256Hex, stableEventsFingerprint } from './edit-metrics';

describe('edit-metrics — computeEditRatePercent', () => {
  it('should be 0 for identical text', () => {
    const text = 'Il paziente riferisce dolore alla spalla destra dopo il trauma.';
    expect(computeEditRatePercent(text, text)).toBe(0);
  });

  it('should be 0 when both are empty', () => {
    expect(computeEditRatePercent('', '')).toBe(0);
  });

  it('should be 100 when the edited text replaces everything', () => {
    expect(computeEditRatePercent('testo originale generato', 'contenuto completamente diverso scritto ex novo')).toBe(100);
  });

  it('should be 100 when original was empty and text was written', () => {
    expect(computeEditRatePercent('', 'nuovo contenuto del perito')).toBe(100);
  });

  it('should be small for a light touch-up', () => {
    const original = 'Il paziente riferisce dolore alla spalla destra insorto dopo il trauma stradale del 12 marzo.';
    const edited = 'Il paziente riferisce dolore alla spalla destra insorto dopo il trauma stradale del 12 marzo 2024.';
    const rate = computeEditRatePercent(original, edited);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(15);
  });

  it('should be substantial for a rewritten paragraph', () => {
    const original = 'Il paziente riferisce dolore alla spalla destra insorto dopo il trauma.';
    const edited = 'In esito al sinistro occorso, la persona esaminata lamenta sintomatologia algica persistente al cingolo scapolare.';
    expect(computeEditRatePercent(original, edited)).toBeGreaterThan(60);
  });

  it('should ignore whitespace-only differences', () => {
    const original = 'Prima riga.\n\nSeconda riga.';
    const edited = 'Prima   riga. Seconda riga.';
    expect(computeEditRatePercent(original, edited)).toBe(0);
  });
});

describe('edit-metrics — sha256Hex', () => {
  it('should produce a stable 64-char hex digest', () => {
    const a = sha256Hex('contenuto');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('contenuto')).toBe(a);
    expect(sha256Hex('contenuto ')).not.toBe(a);
  });
});

describe('edit-metrics — stableEventsFingerprint', () => {
  const events = [
    { orderNumber: 2, eventDate: '2024-01-02', eventType: 'visita', title: 'B', description: 'db', sourceText: 'sb' },
    { orderNumber: 1, eventDate: '2024-01-01', eventType: 'esame', title: 'A', description: 'da', sourceText: 'sa' },
  ];

  it('should be order-independent (sorted by orderNumber internally)', () => {
    const reversed = [...events].reverse();
    expect(stableEventsFingerprint(events)).toBe(stableEventsFingerprint(reversed));
  });

  it('should change when a load-bearing field changes', () => {
    const modified = [{ ...events[0], description: 'MODIFICATA' }, events[1]];
    expect(stableEventsFingerprint(modified)).not.toBe(stableEventsFingerprint(events));
  });

  it('should ignore fields that are not part of the fingerprint', () => {
    const withExtra = events.map((e) => ({ ...e, confidence: 42 }));
    expect(stableEventsFingerprint(withExtra)).toBe(stableEventsFingerprint(events));
  });
});
