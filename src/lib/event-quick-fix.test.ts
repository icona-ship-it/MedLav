import { describe, it, expect } from 'vitest';
import { detectQuickFixes, stripResolvedNoteSegments } from './event-quick-fix';

const base = { facility: 'Ospedale di Prova', doctor: 'Dott. Mario Esempi', event_date: '2026-03-10', reliability_notes: null };

describe('detectQuickFixes', () => {
  it('struttura rimossa per verifica + campo vuoto → quick-fix Struttura', () => {
    const fixes = detectQuickFixes({
      ...base,
      facility: null,
      reliability_notes: 'Nome struttura non riscontrato nel documento originale — rimosso per verifica',
    });
    expect(fixes).toHaveLength(1);
    expect(fixes[0].field).toBe('facility');
  });

  it('nota struttura ma campo GIÀ pieno → nessun quick-fix (niente doppioni)', () => {
    const fixes = detectQuickFixes({
      ...base,
      reliability_notes: 'Nome struttura non riscontrato — rimosso per verifica',
    });
    expect(fixes).toHaveLength(0);
  });

  it('nota mista con separatore | → trova comunque la struttura', () => {
    const fixes = detectQuickFixes({
      ...base,
      facility: null,
      reliability_notes: 'Esame tecnicamente limitato, reperti parziali. | Nome struttura non riscontrato nel documento originale — rimosso per verifica',
    });
    expect(fixes.map((f) => f.field)).toEqual(['facility']);
  });

  it('data mancante → quick-fix Data anche senza note', () => {
    const fixes = detectQuickFixes({ ...base, event_date: null });
    expect(fixes.map((f) => f.field)).toEqual(['eventDate']);
  });

  it('la nota sulla CITAZIONE non attiva quick-fix (non è un campo compilabile)', () => {
    const fixes = detectQuickFixes({
      ...base,
      reliability_notes: 'Testo sorgente non riscontrato nel documento — verificare.',
    });
    expect(fixes).toHaveLength(0);
  });

  it('medico rimosso → quick-fix Medico', () => {
    const fixes = detectQuickFixes({
      ...base,
      doctor: null,
      reliability_notes: 'Nome medico non riscontrato nel testo OCR — rimosso per verifica',
    });
    expect(fixes.map((f) => f.field)).toEqual(['doctor']);
  });
});

describe('stripResolvedNoteSegments', () => {
  it('rimuove SOLO il segmento risolto, conserva il resto', () => {
    const out = stripResolvedNoteSegments(
      'Esame tecnicamente limitato, reperti parziali. | Nome struttura non riscontrato nel documento originale — rimosso per verifica',
      ['facility'],
    );
    expect(out).toBe('Esame tecnicamente limitato, reperti parziali.');
  });

  it('tutte le note risolte → null (niente riga vuota)', () => {
    const out = stripResolvedNoteSegments(
      'Nome struttura non riscontrato — rimosso per verifica',
      ['facility'],
    );
    expect(out).toBeNull();
  });

  it('campo non risolto → note intatte', () => {
    const notes = 'Nome struttura non riscontrato — rimosso per verifica';
    expect(stripResolvedNoteSegments(notes, ['eventDate'])).toBe(notes);
  });
});
