import { describe, it, expect } from 'vitest';
import { estimateAnalysisTime } from './analysis-time-estimate';

describe('estimateAnalysisTime — pesa numero documenti E dimensione (CASO-2026-235)', () => {
  it('pochi documenti piccoli → "pochi minuti" (invariato)', () => {
    expect(estimateAnalysisTime(2, 3_000_000)).toContain('pochi minuti');
  });

  it('2 documenti ma 50MB (301 pagine) → fascia massima, MAI "pochi minuti"', () => {
    // Lo scenario reale del caso annullato: 32MB + 19MB, 2 soli documenti.
    const est = estimateAnalysisTime(2, 52_000_000);
    expect(est).not.toContain('pochi minuti');
    expect(est).toContain('1–2 ore');
    expect(est).toContain('prosegue sul server');
  });

  it('vince la fascia più pesante tra conteggio e dimensione', () => {
    expect(estimateAnalysisTime(60, 1_000_000)).toContain('1–2 ore'); // tanti doc piccoli
    expect(estimateAnalysisTime(3, 30_000_000)).toContain('15–35'); // pochi doc, 30MB
  });

  it('senza dimensione (default 0) resta la vecchia scala per documenti', () => {
    expect(estimateAnalysisTime(10)).toContain('5–15');
  });
});
