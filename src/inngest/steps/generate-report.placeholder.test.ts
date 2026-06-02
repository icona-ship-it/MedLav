import { describe, it, expect, vi } from 'vitest';

// generate-report.ts pulls in supabase/mistral/synthesis at import time; stub the
// heavy chains. buildPlaceholderContent now embeds the ITT/ITP deterministic
// SENTINEL (B3), expanded at read time — no calculations dependency.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/services/synthesis/synthesis-service', () => ({
  generateSynthesis: vi.fn(),
  generateSynthesisChronology: vi.fn(),
  generateSynthesisSummary: vi.fn(),
  shouldSplitSynthesis: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { buildPlaceholderContent, assembleSectionBlock } from './generate-report';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import type { SectionSpec } from '@/services/synthesis/section-generation-types';

function spec(id: string): SectionSpec {
  return {
    id,
    title: 'Considerazioni Medico-Legali',
    isPlaceholder: true,
    placeholderText: '*[Inserire qui le considerazioni medico-legali e le risposte ai quesiti.]*',
  } as unknown as SectionSpec;
}

describe('buildPlaceholderContent — B3 ITT/ITP deterministic sentinel', () => {
  it('embeds the ITT/ITP sentinel in the considerazioni_ml placeholder', () => {
    const content = buildPlaceholderContent(spec('considerazioni_ml'));
    expect(content).toContain('Inserire qui le considerazioni'); // placeholder preserved
    expect(content).toContain(DETERMINISTIC_MARKERS.ITT_ITP); // live sentinel, not a frozen table
    expect(content).not.toContain('| Periodo | Dal | Al |'); // table is expanded at read time, not baked in
  });

  it('does not inject the sentinel into non-target placeholder sections', () => {
    const base = spec('osservazioni_bozza').placeholderText;
    const content = buildPlaceholderContent(spec('osservazioni_bozza'));
    expect(content).toBe(base);
    expect(content).not.toContain(DETERMINISTIC_MARKERS.ITT_ITP);
  });
});

describe('assembleSectionBlock — heading assembly', () => {
  it('intestazione CTU: heading singolo "## Intestazione" (no doppione)', () => {
    const out = assembleSectionBlock('intestazione', 'Intestazione', '## Intestazione\n\n**TRIBUNALE DI X**');
    const h2 = (out.match(/^## /gm) || []).length;
    expect(h2).toBe(1);
    expect(out).toContain('## Intestazione');
  });

  it('intestazione stragiudiziale: PRESERVA il titolo benchmark, non lo riscrive', () => {
    const content = '## VALUTAZIONE MEDICO-LEGALE STRAGIUDIZIALE\n\n**Lavini dott. Franco**';
    const out = assembleSectionBlock('intestazione_stragiudiziale', 'Intestazione', content);
    expect(out).toContain('## VALUTAZIONE MEDICO-LEGALE STRAGIUDIZIALE');
    expect(out).not.toContain('## Intestazione'); // NON sostituito con il titolo generico
    expect((out.match(/^## /gm) || []).length).toBe(1); // heading singolo
  });

  it('sezione non-header: strippa un heading ## iniziale e antepone il titolo canonico', () => {
    const out = assembleSectionBlock('documentazione_sanitaria', 'I Dati della Documentazione Sanitaria in Atti', '## Doc Sanitaria\n\nContenuto.');
    expect(out.startsWith('## I Dati della Documentazione Sanitaria in Atti')).toBe(true);
    expect(out).not.toContain('## Doc Sanitaria');
    expect(out).toContain('Contenuto.');
  });
});
