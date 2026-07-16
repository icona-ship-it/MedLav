import { describe, it, expect } from 'vitest';
import { parseMarkdownTable, markdownToDocxParagraphs, getImageDimensions, scaleToFit, isPlaceholderBlockStart, validateDepositableExport, computeTableColumnWidths } from './docx-export';

describe('docx-export — parseMarkdownTable', () => {
  it('parses a standard pipe table, filtering the separator row', () => {
    const md = ['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n');
    expect(parseMarkdownTable(md)).toEqual([['A', 'B'], ['1', '2']]);
  });

  it('treats an escaped pipe as a literal cell character (not a column split)', () => {
    const md = ['| Periodo | Val |', '|---|---|', '| ITT \\| 100 | x |'].join('\n');
    const rows = parseMarkdownTable(md);
    expect(rows).not.toBeNull();
    // The body row must have exactly 2 cells, with the pipe un-escaped.
    expect(rows![1]).toEqual(['ITT | 100', 'x']);
  });

  it('returns null for a single non-table pipe line', () => {
    expect(parseMarkdownTable('| nota sciolta |')).toBeNull();
  });
});

describe('docx-export — computeTableColumnWidths', () => {
  it('somma esattamente il totale richiesto', () => {
    const data = [['Data', 'Descrizione', 'Importo'], ['01.01.2024', 'Visita ortopedica di controllo', '€ 120,00']];
    const widths = computeTableColumnWidths(data, 9000);
    expect(widths).toHaveLength(3);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(9000);
  });

  it('dà PIÙ spazio alla colonna col testo più lungo (Descrizione > Data/Importo)', () => {
    const data = [['Data', 'Descrizione', 'Importo'], ['01.01.2024', 'Intervento di osteosintesi con placca e viti al femore', '€ 3.400,00']];
    const [dataW, descW, impW] = computeTableColumnWidths(data, 9000);
    expect(descW).toBeGreaterThan(dataW);
    expect(descW).toBeGreaterThan(impW);
  });

  it('non riduce a filo le colonne corte (rispetta un minimo)', () => {
    const data = [['#', 'Testo molto molto lungo che domina la larghezza della tabella intera'], ['1', 'x']];
    const [shortW] = computeTableColumnWidths(data, 9000);
    expect(shortW).toBeGreaterThanOrEqual(900);
  });

  it('colonna singola → tutta la larghezza', () => {
    expect(computeTableColumnWidths([['Solo']], 9000)).toEqual([9000]);
  });
});

describe('docx-export — markdownToDocxParagraphs', () => {
  it('does NOT drop a stray pipe line that is not a real table', () => {
    // Regression: a lone "| nota |" was collected as a table, parsed to null, and
    // silently dropped. It must now be preserved as a paragraph.
    const out = markdownToDocxParagraphs('| nota sciolta importante |');
    expect(out.length).toBeGreaterThan(0);
  });

  it('renders the A2 ITT/ITP table without dropping content', () => {
    const md = [
      '| Periodo | Dal | Al | Giorni | Invalidità |',
      '|---|---|---|---|---|',
      '| ITT al 100% | 10.01.2024 | 20.01.2024 | 10 | 100% |',
    ].join('\n');
    const out = markdownToDocxParagraphs(md);
    expect(out.length).toBeGreaterThan(0); // a Table is emitted
  });

  it('produces a paragraph for every non-empty content line (no silent loss)', () => {
    const md = '## Titolo\n\nPrimo paragrafo.\n\nSecondo paragrafo.';
    const out = markdownToDocxParagraphs(md);
    // heading + 2 paragraphs = 3 blocks (empty lines skipped)
    expect(out.length).toBe(3);
  });

  it('non crasha su un blocco-placeholder multi-riga (lo evidenzia)', () => {
    const md = '*[Inserire qui i risultati della visita:\n- esame locale\n- deambulazione]*\n\nParagrafo dopo.';
    const out = markdownToDocxParagraphs(md);
    expect(out.length).toBeGreaterThan(0); // 3 righe placeholder + 1 paragrafo
  });
});

describe('docx-export — getImageDimensions', () => {
  it('legge le dimensioni reali da un header PNG', () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0); // firma PNG
    png.writeUInt32BE(200, 16); // width
    png.writeUInt32BE(100, 20); // height
    expect(getImageDimensions(png, 'png')).toEqual({ width: 200, height: 100 });
  });

  it('legge le dimensioni da un header JPEG (SOF0)', () => {
    const jpg = Buffer.alloc(13);
    jpg.writeUInt16BE(0xffd8, 0); // SOI
    jpg[2] = 0xff; jpg[3] = 0xc0; // SOF0
    jpg.writeUInt16BE(11, 4); // segment length
    jpg[6] = 8; // precision
    jpg.writeUInt16BE(150, 7); // height
    jpg.writeUInt16BE(300, 9); // width
    expect(getImageDimensions(jpg, 'jpg')).toEqual({ width: 300, height: 150 });
  });

  it('ritorna null su buffer non parsabile', () => {
    expect(getImageDimensions(Buffer.from([1, 2, 3]), 'png')).toBeNull();
    expect(getImageDimensions(Buffer.alloc(0), 'jpg')).toBeNull();
  });
});

describe('docx-export — scaleToFit (no distorsione)', () => {
  it('scala dentro il box conservando l\'aspect ratio', () => {
    // 300x150 (2:1) dentro 450x600 → limite è la larghezza → 450x225 (resta 2:1)
    expect(scaleToFit(300, 150, 450, 600)).toEqual({ width: 450, height: 225 });
    // 1000x800 (5:4) → scala 0.45 → 450x360
    expect(scaleToFit(1000, 800, 450, 600)).toEqual({ width: 450, height: 360 });
  });

  it('immagine verticale: il limite è l\'altezza', () => {
    // 400x1200 (1:3) dentro 450x600 → limite altezza → 200x600
    expect(scaleToFit(400, 1200, 450, 600)).toEqual({ width: 200, height: 600 });
  });

  it('dimensioni invalide → fallback al box', () => {
    expect(scaleToFit(0, 0, 450, 600)).toEqual({ width: 450, height: 600 });
  });
});

describe('docx-export — validateDepositableExport', () => {
  it('BLOCCA il depositabile senza nome perito', () => {
    expect(validateDepositableExport(null, 'stragiudiziale', 'depositabile')).toMatch(/Nome del perito/i);
    expect(validateDepositableExport({ tribunale: 'Tribunale X' }, 'stragiudiziale', 'depositabile')).toMatch(/Nome del perito/i);
  });

  it('AMMETTE la stragiudiziale depositabile con il solo nome perito', () => {
    expect(validateDepositableExport({ ctuName: 'Dott. Rossi' }, 'stragiudiziale', 'depositabile')).toBeNull();
  });

  it('per CTU/CTP depositabile richiede anche Tribunale e RG', () => {
    expect(validateDepositableExport({ ctuName: 'Dott. Rossi' }, 'ctu', 'depositabile')).toMatch(/Tribunale.*RG|RG/i);
    expect(validateDepositableExport({ ctuName: 'Dott. Rossi', tribunale: 'Trib. X', rgNumber: '123/2025' }, 'ctu', 'depositabile')).toBeNull();
  });

  it('in modalità lavoro (bozza) ammette i dati parziali', () => {
    expect(validateDepositableExport(null, 'stragiudiziale', 'lavoro')).toBeNull();
    expect(validateDepositableExport({}, 'ctu', 'lavoro')).toBeNull();
  });
});

describe('docx-export — isPlaceholderBlockStart', () => {
  it('riconosce i placeholder del perito', () => {
    expect(isPlaceholderBlockStart('*[Inserire qui i risultati della visita]*')).toBe(true);
    expect(isPlaceholderBlockStart('[da compilare dal perito]')).toBe(true);
    expect(isPlaceholderBlockStart('  *[Il perito ricostruisca il fatto]*')).toBe(true);
  });

  it('NON scambia per placeholder il corsivo o le citazioni normali', () => {
    expect(isPlaceholderBlockStart('*testo in corsivo*')).toBe(false);
    expect(isPlaceholderBlockStart('Paragrafo normale.')).toBe(false);
    expect(isPlaceholderBlockStart('[Ev. 3]')).toBe(false); // bracket senza keyword
  });
});
