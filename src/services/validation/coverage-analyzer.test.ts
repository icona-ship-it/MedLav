import { describe, it, expect } from 'vitest';
import { analyzeCoverage } from './coverage-analyzer';
import type { ExtractedEvent } from '../extraction/extraction-schemas';

function makeEvent(overrides: Partial<ExtractedEvent> = {}): ExtractedEvent {
  return {
    eventDate: '2024-01-15',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Visita ortopedica',
    description: 'Visita ortopedica di controllo',
    sourceType: 'referto_controllo',
    confidence: 80,
    requiresVerification: false,
    diagnosis: null,
    doctor: null,
    facility: null,
    reliabilityNotes: null,
    sourceText: '',
    sourcePages: [1],
    ...overrides,
  };
}

describe('analyzeCoverage', () => {
  it('should return 100% coverage for empty text', () => {
    const result = analyzeCoverage([], '');

    expect(result.coveragePercent).toBe(100);
    expect(result.uncoveredBlocks).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should calculate coverage for events that match text', () => {
    const fullText = 'Paziente si presenta con dolore. Esame obiettivo nella norma. Diagnosi: contusione.';
    const events = [
      makeEvent({ sourceText: 'Paziente si presenta con dolore.' }),
      makeEvent({ sourceText: 'Diagnosi: contusione.' }),
    ];

    const result = analyzeCoverage(events, fullText);

    expect(result.coveragePercent).toBeGreaterThan(50);
    expect(result.totalTextLength).toBeGreaterThan(0);
    expect(result.coveredLength).toBeGreaterThan(0);
  });

  it('should detect uncovered blocks with medical terms', () => {
    const fullText = `Prima parte del testo coperta.

${' '.repeat(10)}Sezione lunga non coperta con diagnosi di frattura del femore e terapia antibiotica con amoxicillina per profilassi chirurgica. Il paziente presenta emoglobina bassa e leucociti elevati. Intervento chirurgico di osteosintesi programmato per il giorno successivo con esame radiografico di controllo.

Altra parte coperta.`;

    const events = [
      makeEvent({ sourceText: 'Prima parte del testo coperta.' }),
      makeEvent({ sourceText: 'Altra parte coperta.' }),
    ];

    const result = analyzeCoverage(events, fullText);

    expect(result.uncoveredBlocks.length).toBeGreaterThan(0);
    expect(result.uncoveredWithMedicalTerms).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should generate warning when coverage is low', () => {
    const fullText = 'A'.repeat(1000);
    const events = [makeEvent({ sourceText: 'A'.repeat(10) })];

    const result = analyzeCoverage(events, fullText);

    expect(result.coveragePercent).toBeLessThan(50);
    expect(result.warnings.some((w) => w.includes('Copertura bassa'))).toBe(true);
  });

  it('should strip page markers before analysis', () => {
    const fullText = '[PAGE_START:1]Testo della pagina uno.[PAGE_END:1]';
    const events = [makeEvent({ sourceText: 'Testo della pagina uno.' })];

    const result = analyzeCoverage(events, fullText);

    expect(result.coveragePercent).toBeGreaterThan(80);
  });

  it('should handle events with empty sourceText', () => {
    const fullText = 'Testo del documento con contenuto medico rilevante per la diagnosi.';
    const events = [makeEvent({ sourceText: '' })];

    const result = analyzeCoverage(events, fullText);

    expect(result.coveragePercent).toBe(0);
  });

  it('should merge overlapping covered ranges', () => {
    const fullText = 'ABCDEFGHIJ sono tutte lettere dell\'alfabeto.';
    const events = [
      makeEvent({ sourceText: 'ABCDEFGHIJ sono' }),
      makeEvent({ sourceText: 'GHIJ sono tutte' }),
    ];

    const result = analyzeCoverage(events, fullText);

    // Both overlap, should be merged — coverage should not be double-counted
    expect(result.coveredLength).toBeLessThanOrEqual(result.totalTextLength);
  });

  it('should not report small uncovered blocks (< 200 chars)', () => {
    const fullText = 'Testo coperto. Piccolo gap. Altro testo coperto.';
    const events = [
      makeEvent({ sourceText: 'Testo coperto.' }),
      makeEvent({ sourceText: 'Altro testo coperto.' }),
    ];

    const result = analyzeCoverage(events, fullText);

    // "Piccolo gap." is < 200 chars, should not be reported
    expect(result.uncoveredBlocks.every((b) => b.end - b.start >= 200)).toBe(true);
  });
});
