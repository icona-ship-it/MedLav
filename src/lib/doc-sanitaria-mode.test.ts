import { describe, it, expect } from 'vitest';
import { DEFAULT_DOC_SANITARIA_MODE, isDocSanitariaMode, resolveDocSanitariaModeForStart } from './doc-sanitaria-mode';

describe('resolveDocSanitariaModeForStart — default rubriche reso esplicito all\'avvio (ADR-027)', () => {
  it('should return rubriche when the case has no stored mode (new case, pipeline full)', () => {
    expect(resolveDocSanitariaModeForStart({}, 'full')).toBe('rubriche');
    expect(resolveDocSanitariaModeForStart(null, 'full')).toBe('rubriche');
    expect(resolveDocSanitariaModeForStart(undefined, 'full')).toBe('rubriche');
    expect(DEFAULT_DOC_SANITARIA_MODE).toBe('rubriche');
  });

  it('should keep the mode chosen by the perito, whatever it is', () => {
    expect(resolveDocSanitariaModeForStart({ docSanitariaMode: 'selettiva' }, 'full')).toBe('selettiva');
    expect(resolveDocSanitariaModeForStart({ docSanitariaMode: 'integrale' }, 'full')).toBe('integrale');
    expect(resolveDocSanitariaModeForStart({ docSanitariaMode: 'rubriche' }, 'full')).toBe('rubriche');
  });

  it('should fall back to the default on a malformed stored value (never propagate garbage)', () => {
    expect(resolveDocSanitariaModeForStart({ docSanitariaMode: 'RUBRICHE' }, 'full')).toBe('rubriche');
    expect(resolveDocSanitariaModeForStart({ docSanitariaMode: 42 }, 'full')).toBe('rubriche');
    expect(resolveDocSanitariaModeForStart({ docSanitariaMode: '' }, 'full')).toBe('rubriche');
  });

  it('should return null for pipelines without the section (cronistoria, spese, anonimizzatore)', () => {
    for (const mode of ['extraction_only', 'expenses_only', 'anonymize_only', undefined, null]) {
      expect(resolveDocSanitariaModeForStart({}, mode)).toBeNull();
    }
  });

  it('isDocSanitariaMode accepts only the three known values', () => {
    expect(isDocSanitariaMode('rubriche')).toBe(true);
    expect(isDocSanitariaMode('Rubriche')).toBe(false);
    expect(isDocSanitariaMode(null)).toBe(false);
  });
});
