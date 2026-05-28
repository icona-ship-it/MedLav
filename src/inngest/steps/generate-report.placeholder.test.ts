import { describe, it, expect, vi } from 'vitest';

// generate-report.ts pulls in supabase/mistral/synthesis at import time; stub the
// heavy chains. We deliberately do NOT mock medico-legal-calc — buildPlaceholderContent
// must exercise the REAL formatITTITPTable / calculationsToITTITPSegments.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/services/synthesis/synthesis-service', () => ({
  generateSynthesis: vi.fn(),
  generateSynthesisChronology: vi.fn(),
  generateSynthesisSummary: vi.fn(),
  shouldSplitSynthesis: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { buildPlaceholderContent } from './generate-report';
import type { SectionSpec } from '@/services/synthesis/section-generation-types';
import type { SynthesisParams } from '@/services/synthesis/synthesis-service';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';

function spec(id: string): SectionSpec {
  return {
    id,
    title: 'Considerazioni Medico-Legali',
    isPlaceholder: true,
    placeholderText: '*[Inserire qui le considerazioni medico-legali e le risposte ai quesiti.]*',
  } as unknown as SectionSpec;
}

function params(calculations?: MedicoLegalCalculation[]): SynthesisParams {
  return { calculations } as unknown as SynthesisParams;
}

const ITT_ITP_CALCS: MedicoLegalCalculation[] = [
  { label: 'Invalidità Temporanea Totale (ITT) al 100%', value: '10 giorni', days: 10, startDate: '2024-01-10', endDate: '2024-01-20', notes: '' },
  { label: 'ITP al 75%', value: '5 giorni', days: 5, startDate: '2024-01-20', endDate: '2024-01-25', notes: '' },
];

describe('buildPlaceholderContent — A2 ITT/ITP injection', () => {
  it('appends the ITT/ITP table to the considerazioni_ml placeholder', () => {
    const content = buildPlaceholderContent(spec('considerazioni_ml'), params(ITT_ITP_CALCS));
    expect(content).toContain('Inserire qui le considerazioni'); // placeholder preserved
    expect(content).toContain('| Periodo | Dal | Al | Giorni | Invalidità |'); // table present
    expect(content).toContain('100%');
    expect(content).toContain('75%');
  });

  it('returns the bare placeholder when no calculations are provided', () => {
    const base = spec('considerazioni_ml').placeholderText;
    expect(buildPlaceholderContent(spec('considerazioni_ml'), params(undefined))).toBe(base);
  });

  it('does not inject the table into non-target placeholder sections', () => {
    const base = spec('osservazioni_bozza').placeholderText;
    expect(buildPlaceholderContent(spec('osservazioni_bozza'), params(ITT_ITP_CALCS))).toBe(base);
  });

  it('does not append an empty table when calculations have no ITT/ITP segments', () => {
    const nonItpCalcs: MedicoLegalCalculation[] = [
      { label: 'Giorni di ricovero', value: '10 giorni', days: 10, startDate: '2024-01-10', endDate: '2024-01-20', notes: '' },
      { label: 'Periodo totale malattia', value: '30 giorni', days: 30, startDate: '2024-01-10', endDate: '2024-02-09', notes: '' },
    ];
    const base = spec('considerazioni_ml').placeholderText;
    expect(buildPlaceholderContent(spec('considerazioni_ml'), params(nonItpCalcs))).toBe(base);
  });
});
