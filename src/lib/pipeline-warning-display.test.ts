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

  // Feedback beta 2026-07-20 (CASO-2026-027): 5 divergenze DENTRO le «...» sono
  // arrivate al DOCX in silenzio — il verificatore le contava ma il conteggio
  // restava solo nei log server. Ora sono una voce del pannello, drillabile.
  it('citazioni non riscontrate (quote-verification) → WARNING con azione verso la doc-sanitaria e citazioni nel dettaglio', () => {
    const out = groupPipelineWarnings([
      w({
        step: 'quote-verification',
        message: '3 citazioni non corrispondono al testo OCR',
        failedCount: 3,
        failedItems: ['piacca+ vite 2022', 'artroscopia di caviglia', 'riesce a deambulare'],
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].title).toContain('3 citazioni');
    expect(out[0].title.toLowerCase()).toContain('non corrispond');
    expect(out[0].action).toBe('goto-docsanitaria');
    expect(out[0].sources[0].failedItems).toContain('piacca+ vite 2022');
  });

  it('quote-verification singolare: "1 citazione ... non corrisponde"', () => {
    const out = groupPipelineWarnings([
      w({ step: 'quote-verification', message: '1 citazione non riscontrata', failedCount: 1, failedItems: ['solo una'] }),
    ]);
    expect(out[0].title).toContain('1 citazione');
    expect(out[0].title).toContain('non corrisponde esattamente');
  });

  it('quote-verification: il titolo usa failedCount (totale vero), non la lista troncata', () => {
    const out = groupPipelineWarnings([
      w({
        step: 'quote-verification',
        message: '30 citazioni non riscontrate',
        failedCount: 30,
        failedItems: Array.from({ length: 24 }, (_, i) => `citazione ${i + 1}`),
      }),
    ]);
    expect(out[0].title).toContain('30 citazioni');
  });
});
