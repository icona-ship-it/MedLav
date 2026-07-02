import { describe, it, expect, vi } from 'vitest';

// generate-report.ts pulls in supabase/mistral at import time; stub the heavy
// chains. buildPlaceholderContent now embeds the ITT/ITP deterministic
// SENTINEL (B3), expanded at read time — no calculations dependency.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { buildPlaceholderContent, assembleSectionBlock } from './generate-report';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import { STIMA_DANNO_MARKER_PREFIX, buildStimaDannoMarker } from '@/services/calculations/stima-danno-block';
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

describe('buildPlaceholderContent — Sprint 4.3 stima tabellare del danno biologico', () => {
  it('embeds the parameterized STIMA_DANNO sentinel (with case type) below the ITT/ITP block', () => {
    const content = buildPlaceholderContent(spec('considerazioni_ml'), { caseType: 'rc_auto' });
    expect(content).toContain(buildStimaDannoMarker('rc_auto'));
    expect(content).toContain('Stima tabellare del danno biologico');
    expect(content).toContain('proposta automatica');
    // ITT/ITP block first, stima below it (segue il pattern dei benchmark)
    expect(content.indexOf(DETERMINISTIC_MARKERS.ITT_ITP)).toBeLessThan(content.indexOf(buildStimaDannoMarker('rc_auto')));
  });

  it('without a caseType keeps the legacy behavior (ITT/ITP only, no stima)', () => {
    const content = buildPlaceholderContent(spec('considerazioni_ml'));
    expect(content).toContain(DETERMINISTIC_MARKERS.ITT_ITP);
    expect(content).not.toContain(STIMA_DANNO_MARKER_PREFIX);
  });

  it('non-target placeholder sections never receive the stima sentinel', () => {
    const content = buildPlaceholderContent(spec('osservazioni_bozza'), { caseType: 'rc_auto' });
    expect(content).not.toContain(STIMA_DANNO_MARKER_PREFIX);
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
