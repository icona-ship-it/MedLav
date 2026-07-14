import { describe, it, expect } from 'vitest';
import { groupPipelineWarnings, type RawPipelineWarning } from './pipeline-warning-display';

const w = (o: Partial<RawPipelineWarning>): RawPipelineWarning => ({
  step: 'extraction', severity: 'warning', message: '', ...o,
});

describe('groupPipelineWarnings — copy calmo e gravità corretta per il perito', () => {
  it('vuoto → nessuna voce', () => {
    expect(groupPipelineWarnings([])).toEqual([]);
  });

  it('sezione non generata → CRITICAL, non appiattita in "documenti non letti"', () => {
    const out = groupPipelineWarnings([
      w({ step: 'synthesis', severity: 'critical', message: '2 sezioni non sono state generate per un errore tecnico (Anamnesi, Il Fatto)', failedCount: 2 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('critical');
    expect(out[0].title).toContain('2 sezioni del report');
    expect(out[0].action).toBe('goto-section');
    expect(out[0].title).not.toContain('non sono stati letti');
  });

  it('documenti troncati → WARNING drillabile con conteggio aggregato', () => {
    const out = groupPipelineWarnings([
      w({ step: 'extraction', message: 'troncato pp 145-154', failedItems: ['doc1.pdf'] }),
      w({ step: 'ocr', message: 'ocr fallito', failedItems: ['doc2.pdf', 'doc3.pdf'] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].title).toContain('3 documenti');
    expect(out[0].action).toBe('view-documents');
    expect(out[0].sources).toHaveLength(2);
  });

  it('dedup → INFO (rassicurazione, non allarme)', () => {
    const out = groupPipelineWarnings([
      w({ step: 'dedup', message: '1 documento duplicato escluso', failedCount: 1 }),
    ]);
    expect(out[0].severity).toBe('info');
    expect(out[0].title).toContain('conteggiato una volta sola');
    expect(out[0].action).toBeUndefined();
  });

  it('calcoli falliti → CRITICAL con azione rielabora', () => {
    const out = groupPipelineWarnings([
      w({ step: 'calculations', severity: 'critical', message: 'analisi fallita' }),
    ]);
    expect(out[0].severity).toBe('critical');
    expect(out[0].action).toBe('reprocess');
  });

  it('ordina critical → warning → info', () => {
    const out = groupPipelineWarnings([
      w({ step: 'dedup', message: 'dup', failedCount: 1 }),
      w({ step: 'extraction', message: 'trunc', failedItems: ['a.pdf'] }),
      w({ step: 'synthesis', severity: 'critical', message: '1 sezione non generata', failedCount: 1 }),
    ]);
    expect(out.map((o) => o.severity)).toEqual(['critical', 'warning', 'info']);
  });

  it('warning sconosciuto → mai perso, cade nel default con il suo message', () => {
    const out = groupPipelineWarnings([
      w({ step: 'qualcosa_di_nuovo', severity: 'warning', message: 'Messaggio inatteso' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Messaggio inatteso');
  });
});
