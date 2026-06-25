import { describe, it, expect } from 'vitest';
import { buildVisibleSections, COURT_ONLY_SECTION_IDS } from './perizia-form-sections';

/**
 * La stragiudiziale (schema Antoniazzi) non ha contesto giudiziario: niente
 * giudice/quesiti, niente intestazione del tribunale, niente termini processuali.
 * Questi campi devono sparire dal form quando il ruolo è 'stragiudiziale'.
 */
describe('buildVisibleSections', () => {
  it('should hide court-only sections when role is stragiudiziale', () => {
    const ids = buildVisibleSections({ role: 'stragiudiziale', isRC: true }).map((s) => s.id);
    for (const courtId of COURT_ONLY_SECTION_IDS) {
      expect(ids).not.toContain(courtId);
    }
  });

  it('should keep paziente, parti, esameObiettivo and report-picker for stragiudiziale', () => {
    const ids = buildVisibleSections({ role: 'stragiudiziale', isRC: true }).map((s) => s.id);
    expect(ids).toContain('paziente');
    expect(ids).toContain('parti');
    expect(ids).toContain('esameObiettivo');
    expect(ids).toContain('sezioniReport');
  });

  it('should include court-only sections for ctu', () => {
    const ids = buildVisibleSections({ role: 'ctu', isRC: true }).map((s) => s.id);
    expect(ids).toContain('intestazione');
    expect(ids).toContain('date');
    expect(ids).toContain('quesiti');
  });

  it('should include court-only sections for ctp', () => {
    const ids = buildVisibleSections({ role: 'ctp', isRC: false }).map((s) => s.id);
    expect(ids).toContain('intestazione');
    expect(ids).toContain('quesiti');
  });

  it('should append RC perito sections (anamnesi + il fatto) only when isRC', () => {
    const rc = buildVisibleSections({ role: 'stragiudiziale', isRC: true }).map((s) => s.id);
    expect(rc).toContain('ilFatto');
    expect(rc).toContain('anamnesi');

    const nonRc = buildVisibleSections({ role: 'ctu', isRC: false }).map((s) => s.id);
    expect(nonRc).not.toContain('ilFatto');
    expect(nonRc).not.toContain('anamnesi');
  });

  it('should always place the report-section picker last', () => {
    for (const params of [
      { role: 'ctu', isRC: false },
      { role: 'ctu', isRC: true },
      { role: 'stragiudiziale', isRC: true },
    ] as const) {
      const sections = buildVisibleSections(params);
      expect(sections[sections.length - 1].id).toBe('sezioniReport');
    }
  });

  it('should never mutate the underlying constants (immutability)', () => {
    const a = buildVisibleSections({ role: 'ctu', isRC: true });
    const b = buildVisibleSections({ role: 'stragiudiziale', isRC: true });
    // CTU is unaffected by a later stragiudiziale build
    expect(a.map((s) => s.id)).toContain('quesiti');
    expect(b.map((s) => s.id)).not.toContain('quesiti');
  });
});
