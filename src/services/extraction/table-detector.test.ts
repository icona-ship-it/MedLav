import { describe, it, expect } from 'vitest';
import { annotateTablesInText } from './table-detector';

describe('annotateTablesInText', () => {
  it('should return unchanged text when no tables found', () => {
    const text = 'Paziente si presenta con dolore al ginocchio sinistro.\nVisita ortopedica completata.';
    const result = annotateTablesInText(text);

    expect(result.annotatedText).toBe(text);
    expect(result.tableCount).toBe(0);
  });

  it('should detect markdown tables with pipe separators', () => {
    const text = `Risultati esami:

| Parametro | Valore | Unita |
|-----------|--------|-------|
| Emoglobina | 13.5 | g/dL |
| Leucociti | 8200 | /uL |
| Piastrine | 245000 | /uL |

Conclusioni: valori nella norma.`;

    const result = annotateTablesInText(text);

    expect(result.tableCount).toBe(1);
    expect(result.annotatedText).toContain('[TABLE_START]');
    expect(result.annotatedText).toContain('[TABLE_END]');
    expect(result.annotatedText).toContain('Emoglobina');
  });

  it('should detect aligned numeric tables (lab results)', () => {
    const text = `Esami ematochimici del 15/01/2024:

Emoglobina      13.5 g/dL
Leucociti       8200 /uL
Piastrine       245000 /uL
Creatinina      0.9 mg/dL

Firma del medico.`;

    const result = annotateTablesInText(text);

    expect(result.tableCount).toBe(1);
    expect(result.annotatedText).toContain('[TABLE_START]');
    expect(result.annotatedText).toContain('Emoglobina');
  });

  it('should detect repeated structure blocks', () => {
    const text = `Parametri vitali:

PA 140/85 mmHg ore 08:00
PA 135/80 mmHg ore 12:00
PA 130/78 mmHg ore 16:00
PA 128/75 mmHg ore 20:00

Decorso regolare.`;

    const result = annotateTablesInText(text);

    expect(result.tableCount).toBe(1);
    expect(result.annotatedText).toContain('[TABLE_START]');
  });

  it('should not double-annotate already annotated text', () => {
    const text = '[TABLE_START]\n| A | B |\n[TABLE_END]';
    const result = annotateTablesInText(text);

    expect(result.tableCount).toBe(1);
    expect(result.annotatedText).toBe(text);
  });

  it('should handle very short text without errors', () => {
    const result = annotateTablesInText('Breve.');

    expect(result.tableCount).toBe(0);
    expect(result.annotatedText).toBe('Breve.');
  });

  it('should detect multiple tables in one text', () => {
    const text = `Emocromo:

| Param | Val | Unit |
|-------|-----|------|
| Hb | 12.0 | g/dL |
| WBC | 7500 | /uL |
| PLT | 200000 | /uL |

Biochimica:

| Param | Val | Unit |
|-------|-----|------|
| Glicemia | 95 | mg/dL |
| Creatinina | 0.8 | mg/dL |
| AST | 22 | U/L |`;

    const result = annotateTablesInText(text);

    expect(result.tableCount).toBe(2);
  });
});
