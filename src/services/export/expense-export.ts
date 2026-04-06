/**
 * DOCX export for the "Analisi spese mediche" module.
 * Generates a professional expense report with category summary and detailed table.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, ShadingType,
  Header, Footer, PageNumber, Table, TableRow, TableCell,
  WidthType, BorderStyle,
} from 'docx';
import { formatDate } from '@/lib/format';
import type { TimelineEvent } from './timeline-export';
import type {
  ExpenseAnalysisResult,
  ExpenseCategory,
} from '@/services/expenses/expense-analyzer';
import { EXPENSE_CATEGORY_LABELS } from '@/services/expenses/expense-analyzer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpenseDocxParams {
  caseCode: string;
  patientInitials: string | null;
  expenseResult: ExpenseAnalysisResult;
  events: TimelineEvent[];
  moduleName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEADER_FILL = '2B579A';
const EVEN_ROW_FILL = 'F2F6FC';
const FONT = 'Calibri';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} \u20AC`;
}

// ---------------------------------------------------------------------------
// Summary section — category totals
// ---------------------------------------------------------------------------

function buildSummarySection(result: ExpenseAnalysisResult): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [new TextRun({
      text: 'RIEPILOGO PER CATEGORIA',
      bold: true,
      size: 28,
      font: FONT,
      color: HEADER_FILL,
    })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 200 },
  }));

  // Summary table: Category | Voci | Totale
  const headerShading = { type: ShadingType.SOLID, fill: HEADER_FILL, color: HEADER_FILL };
  const headerStyle = { bold: true, size: 20, color: 'FFFFFF', font: FONT };

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ ...headerStyle, text: 'Categoria' })], alignment: AlignmentType.CENTER })],
        shading: headerShading,
        width: { size: 4000, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ ...headerStyle, text: 'N. Voci' })], alignment: AlignmentType.CENTER })],
        shading: headerShading,
        width: { size: 1500, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ ...headerStyle, text: 'Totale' })], alignment: AlignmentType.CENTER })],
        shading: headerShading,
        width: { size: 2500, type: WidthType.DXA },
      }),
    ],
  });

  const categories: ExpenseCategory[] = [
    'farmaci', 'visite_specialistiche', 'esami_diagnostici', 'interventi',
    'riabilitazione', 'ausili_protesi', 'trasporti', 'altro',
  ];

  const dataRows: TableRow[] = [];
  let rowIdx = 0;
  for (const cat of categories) {
    const data = result.totalsByCategory[cat];
    if (data.count === 0) continue;

    const shading = rowIdx % 2 === 0
      ? { type: ShadingType.SOLID, fill: EVEN_ROW_FILL, color: EVEN_ROW_FILL }
      : undefined;

    dataRows.push(new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: EXPENSE_CATEGORY_LABELS[cat], size: 20, font: FONT })], spacing: { after: 20 } })],
          ...(shading ? { shading } : {}),
          width: { size: 4000, type: WidthType.DXA },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(data.count), size: 20, font: FONT })], alignment: AlignmentType.CENTER })],
          ...(shading ? { shading } : {}),
          width: { size: 1500, type: WidthType.DXA },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: data.total !== null ? formatCurrency(data.total) : 'N/D',
              size: 20,
              font: FONT,
            })],
            alignment: AlignmentType.RIGHT,
          })],
          ...(shading ? { shading } : {}),
          width: { size: 2500, type: WidthType.DXA },
        }),
      ],
    }));
    rowIdx++;
  }

  // Total row
  const totalShading = { type: ShadingType.SOLID, fill: 'D6E4F0', color: 'D6E4F0' };
  dataRows.push(new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: 'TOTALE', bold: true, size: 22, font: FONT })], spacing: { after: 20 } })],
        shading: totalShading,
        width: { size: 4000, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(result.totalItems), bold: true, size: 22, font: FONT })], alignment: AlignmentType.CENTER })],
        shading: totalShading,
        width: { size: 1500, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: result.totalAmount !== null ? formatCurrency(result.totalAmount) : 'N/D',
            bold: true,
            size: 22,
            font: FONT,
          })],
          alignment: AlignmentType.RIGHT,
        })],
        shading: totalShading,
        width: { size: 2500, type: WidthType.DXA },
      }),
    ],
  }));

  children.push(new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 8000, type: WidthType.DXA },
  }));

  return children;
}

// ---------------------------------------------------------------------------
// Detail table — all expense items
// ---------------------------------------------------------------------------

function buildDetailSection(result: ExpenseAnalysisResult): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [new TextRun({
      text: 'DETTAGLIO SPESE',
      bold: true,
      size: 28,
      font: FONT,
      color: HEADER_FILL,
    })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 200 },
  }));

  if (result.items.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Nessuna spesa individuata.', italics: true, size: 22, font: FONT })],
      alignment: AlignmentType.CENTER,
    }));
    return children;
  }

  const headerShading = { type: ShadingType.SOLID, fill: HEADER_FILL, color: HEADER_FILL };
  const headerStyle = { bold: true, size: 18, color: 'FFFFFF', font: FONT };

  const cols = [
    { text: 'N.', width: 500 },
    { text: 'Data', width: 1200 },
    { text: 'Descrizione', width: 3200 },
    { text: 'Categoria', width: 1800 },
    { text: 'Importo', width: 1300 },
    { text: 'Struttura', width: 1500 },
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: cols.map((c) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ ...headerStyle, text: c.text })],
        alignment: AlignmentType.CENTER,
      })],
      shading: headerShading,
      width: { size: c.width, type: WidthType.DXA },
    })),
  });

  const dataRows = result.items.map((item, idx) => {
    const shading = idx % 2 === 0
      ? { type: ShadingType.SOLID, fill: EVEN_ROW_FILL, color: EVEN_ROW_FILL }
      : undefined;

    const cellOpts = (width: number) => ({
      width: { size: width, type: WidthType.DXA },
      ...(shading ? { shading } : {}),
    });

    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 18, font: FONT })], alignment: AlignmentType.CENTER })],
          ...cellOpts(500),
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: formatDate(item.date), size: 18, font: FONT })], alignment: AlignmentType.CENTER })],
          ...cellOpts(1200),
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: item.description, size: 18, font: FONT })], spacing: { after: 20 } })],
          ...cellOpts(3200),
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: EXPENSE_CATEGORY_LABELS[item.category], size: 16, font: FONT })], alignment: AlignmentType.CENTER })],
          ...cellOpts(1800),
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: item.amount !== null ? formatCurrency(item.amount) : '-',
              size: 18,
              font: FONT,
            })],
            alignment: AlignmentType.RIGHT,
          })],
          ...cellOpts(1300),
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: item.facility ?? '-', size: 16, font: FONT, italics: true })], spacing: { after: 20 } })],
          ...cellOpts(1500),
        }),
      ],
    });
  });

  // Total row
  const totalShading = { type: ShadingType.SOLID, fill: 'D6E4F0', color: 'D6E4F0' };
  const totalRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [] })],
        shading: totalShading,
        width: { size: 500, type: WidthType.DXA },
        columnSpan: 4,
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: result.totalAmount !== null ? formatCurrency(result.totalAmount) : 'N/D',
            bold: true,
            size: 20,
            font: FONT,
          })],
          alignment: AlignmentType.RIGHT,
        })],
        shading: totalShading,
        width: { size: 1300, type: WidthType.DXA },
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: 'TOTALE', bold: true, size: 20, font: FONT })],
        })],
        shading: totalShading,
        width: { size: 1500, type: WidthType.DXA },
      }),
    ],
  });

  children.push(new Table({
    rows: [headerRow, ...dataRows, totalRow],
    width: { size: 9500, type: WidthType.DXA },
  }));

  return children;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Generate an "Analisi Spese Mediche" DOCX report.
 * Returns a Buffer ready for download.
 */
export async function generateExpenseDocx(params: ExpenseDocxParams): Promise<Buffer> {
  const { caseCode, patientInitials, expenseResult, moduleName } = params;

  const now = new Date().toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({
      text: 'ANALISI SPESE MEDICHE',
      bold: true,
      size: 36,
      font: FONT,
      color: HEADER_FILL,
    })],
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  // Metadata lines
  const metaLines: string[] = [`Caso: ${caseCode}`];
  if (patientInitials) metaLines.push(`Paziente: ${patientInitials}`);
  if (moduleName) metaLines.push(`Modulo: ${moduleName}`);
  metaLines.push(`Data generazione: ${now}`);
  metaLines.push(`Voci analizzate: ${expenseResult.totalItems}`);
  if (expenseResult.totalAmount !== null) {
    metaLines.push(`Totale documentato: ${formatCurrency(expenseResult.totalAmount)}`);
  }

  for (const line of metaLines) {
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 22, font: FONT, color: '333333' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }));
  }

  // Horizontal rule
  children.push(new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HEADER_FILL, space: 1 } },
    spacing: { before: 200, after: 300 },
  }));

  // Summary section
  children.push(...buildSummarySection(expenseResult));

  // Detail section
  children.push(...buildDetailSection(expenseResult));

  // Notes
  const itemsWithoutAmount = expenseResult.items.filter((i) => i.amount === null).length;
  if (itemsWithoutAmount > 0) {
    children.push(new Paragraph({
      children: [],
      spacing: { before: 300 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({
        text: `Nota: ${itemsWithoutAmount} ${itemsWithoutAmount === 1 ? 'voce non presenta' : 'voci non presentano'} importo esplicitamente documentato. Gli importi sono stati estratti automaticamente dal testo della documentazione e richiedono verifica.`,
        size: 18,
        italics: true,
        color: '666666',
        font: FONT,
      })],
      spacing: { after: 100 },
    }));
  }

  // Footer
  const footer = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'Generato con LegMed — ', size: 16, color: '999999', font: FONT }),
          new TextRun({ text: `${caseCode} — Pagina `, size: 16, color: '999999', font: FONT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999', font: FONT }),
          new TextRun({ text: ' di ', size: 16, color: '999999', font: FONT }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '999999', font: FONT }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

  // Header
  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'RISERVATO', color: 'C0C0C0', size: 18, italics: true, font: FONT }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
