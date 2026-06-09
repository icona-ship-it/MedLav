import { describe, it, expect } from 'vitest';
import { redactMaterializedDocSanitariaForPublic } from './shared-redaction';
import { DETERMINISTIC_MARKERS } from '../calculations/deterministic-tables';

describe('redactMaterializedDocSanitariaForPublic (GDPR)', () => {
  it('strips a MATERIALIZED (AI-variant) documentazione sanitaria body', () => {
    const synthesis = [
      '## Documentazione Sanitaria',
      '',
      'In data 12.03.2024 il Dott. Rossi presso Ospedale San Luca rileva «frattura composta del radio».',
      '',
      '## Conclusioni',
      '',
      'Testo conclusioni.',
    ].join('\n');

    const out = redactMaterializedDocSanitariaForPublic(synthesis);

    // No verbatim clinical content / names survive on the public surface.
    expect(out).not.toContain('Dott. Rossi');
    expect(out).not.toContain('Ospedale San Luca');
    expect(out).not.toContain('frattura composta del radio');
    expect(out).toContain('consultabile nella perizia completa');
    // Other sections are untouched.
    expect(out).toContain('Testo conclusioni.');
  });

  it('leaves the DETERMINISTIC placeholder (sentinel) untouched — expand handles it', () => {
    const synthesis = [
      '## Documentazione Sanitaria',
      '',
      `Di seguito la documentazione.\n\n${DETERMINISTIC_MARKERS.DOC_SANITARIA}`,
      '',
      '## Conclusioni',
      '',
      'X.',
    ].join('\n');

    const out = redactMaterializedDocSanitariaForPublic(synthesis);
    expect(out).toContain(DETERMINISTIC_MARKERS.DOC_SANITARIA);
  });

  it('is a no-op when there is no documentazione sanitaria section', () => {
    const synthesis = '## Conclusioni\n\nSolo conclusioni, nessuna doc sanitaria.';
    expect(redactMaterializedDocSanitariaForPublic(synthesis)).toBe(synthesis);
  });

  it('handles empty/missing synthesis', () => {
    expect(redactMaterializedDocSanitariaForPublic('')).toBe('');
  });
});
