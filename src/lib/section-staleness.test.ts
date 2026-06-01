import { describe, it, expect } from 'vitest';
import { eventTypeToDomain, computeStaleSections, type SectionStalenessInput } from './section-staleness';

describe('eventTypeToDomain', () => {
  it('maps expense / admin / clinical correctly', () => {
    expect(eventTypeToDomain('spesa_medica')).toBe('expenses');
    expect(eventTypeToDomain('documento_amministrativo')).toBe('admin');
    expect(eventTypeToDomain('certificato')).toBe('admin');
    expect(eventTypeToDomain('visita')).toBe('clinical');
    expect(eventTypeToDomain('intervento')).toBe('clinical');
    expect(eventTypeToDomain('altro')).toBe('clinical');
  });
});

describe('computeStaleSections', () => {
  const sections: SectionStalenessInput[] = [
    { canonicalId: 'documentazione_sanitaria', status: 'auto' },
    { canonicalId: 'il_fatto_e_storia_clinica', status: 'edited' },
    { canonicalId: 'epicrisi', status: 'locked' },
    { canonicalId: 'documentazione_atti', status: 'auto' },
    { canonicalId: 'spese_mediche', status: 'auto' },     // deterministic → never stale
    { canonicalId: 'considerazioni_ml', status: 'auto' }, // placeholder → never stale
    { canonicalId: 'intestazione', status: 'auto' },      // header → never stale
  ];

  it('returns nothing when no events were mutated', () => {
    expect(computeStaleSections(sections, new Set())).toEqual([]);
  });

  it('flags clinical narrative sections when a clinical event changed', () => {
    const stale = computeStaleSections(sections, new Set(['visita']));
    const ids = stale.map((s) => s.canonicalId);
    expect(ids).toContain('documentazione_sanitaria');
    expect(ids).toContain('il_fatto_e_storia_clinica');
    // never-stale / placeholder / deterministic excluded
    expect(ids).not.toContain('spese_mediche');
    expect(ids).not.toContain('considerazioni_ml');
    expect(ids).not.toContain('intestazione');
    // locked excluded
    expect(ids).not.toContain('epicrisi');
    // admin-only section not affected by a clinical change
    expect(ids).not.toContain('documentazione_atti');
  });

  it('marks edited sections with the edited flag (warn before overwrite)', () => {
    const stale = computeStaleSections(sections, new Set(['diagnosi']));
    const fatto = stale.find((s) => s.canonicalId === 'il_fatto_e_storia_clinica');
    expect(fatto?.edited).toBe(true);
    const docSan = stale.find((s) => s.canonicalId === 'documentazione_sanitaria');
    expect(docSan?.edited).toBe(false);
  });

  it('an admin document change flags only admin-dependent sections', () => {
    const stale = computeStaleSections(sections, new Set(['documento_amministrativo']));
    const ids = stale.map((s) => s.canonicalId);
    expect(ids).toContain('documentazione_atti');
    expect(ids).not.toContain('documentazione_sanitaria'); // clinical-only, unaffected
  });

  it('an expense change does not flag the deterministic spese section', () => {
    const stale = computeStaleSections(sections, new Set(['spesa_medica']));
    expect(stale.map((s) => s.canonicalId)).not.toContain('spese_mediche');
  });
});
