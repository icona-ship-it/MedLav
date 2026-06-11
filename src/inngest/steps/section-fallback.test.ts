import { describe, it, expect } from 'vitest';
import { buildFailedSectionFallback, FAILED_SECTION_MARKER } from './section-fallback';

describe('buildFailedSectionFallback', () => {
  it('should produce a structurally valid section with an explicit technical marker', () => {
    const section = buildFailedSectionFallback({ id: 'documentazione_atti', title: 'I Dati della Documentazione in Atti' });
    expect(section.id).toBe('documentazione_atti');
    expect(section.title).toBe('I Dati della Documentazione in Atti');
    expect(section.content).toContain(FAILED_SECTION_MARKER);
    expect(section.content).toContain('Rigenera sezione');
    expect(section.wordCount).toBeGreaterThan(10);
    expect(section.contextSummary).toBe('');
    expect(section.usage).toBeUndefined();
  });

  it('marker must be unmistakably technical, never confusable with perito placeholders', () => {
    const section = buildFailedSectionFallback({ id: 'x', title: 'X' });
    expect(section.content).toContain('errore tecnico');
    expect(section.content).not.toContain('a tua cura');
  });

  it('intestazione fallback must carry its own ## heading (assembled as-is, validator requires it)', () => {
    const ctu = buildFailedSectionFallback({ id: 'intestazione', title: 'Intestazione' });
    expect(ctu.content.startsWith('## Intestazione')).toBe(true);
    const strag = buildFailedSectionFallback({ id: 'intestazione_stragiudiziale', title: 'Intestazione' });
    expect(strag.content.startsWith('## ')).toBe(true);
    // Normal sections get the heading from assembleSectionBlock — no double heading
    const other = buildFailedSectionFallback({ id: 'quesiti', title: 'I Quesiti' });
    expect(other.content.startsWith('## ')).toBe(false);
  });
});
