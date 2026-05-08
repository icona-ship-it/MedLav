import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, ShadingType,
  Header, Footer, PageNumber, Table, TableRow, TableCell,
  WidthType, BorderStyle,
} from 'docx';
import { formatDate } from '@/lib/format';
import { sourceLabelsExport as sourceLabels } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  order_number: number;
  event_date: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  doctor: string | null;
  facility: string | null;
  /** Optional — preserved when present so the perito sees confidence + verification flags. */
  confidence?: number;
  requires_verification?: boolean;
}

interface TimelineDocxParams {
  caseCode: string;
  patientInitials: string | null;
  events: TimelineEvent[];
  moduleName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS: Record<string, string> = {
  visita: 'Visita',
  esame: 'Esame',
  intervento: 'Intervento',
  diagnosi: 'Diagnosi',
  terapia: 'Terapia',
  ricovero: 'Ricovero',
  dimissione: 'Dimissione',
  prognosi: 'Prognosi',
  certificato: 'Certificato',
  altro: 'Altro',
};

function eventTypeLabel(raw: string): string {
  return EVENT_TYPE_LABELS[raw] ?? raw;
}

function sourceLabel(raw: string): string {
  return sourceLabels[raw] ?? raw;
}

/** Build a description cell combining title, description, doctor & facility. */
function buildDescriptionParagraphs(ev: TimelineEvent): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const isLowConfidence = typeof ev.confidence === 'number' && ev.confidence < 60;

  // Wave B.1/B.2: prefix DA VERIFICARE flag + low-confidence italics
  const titleChildren: TextRun[] = [];
  if (ev.requires_verification) {
    titleChildren.push(new TextRun({ text: '⚠ DA VERIFICARE — ', bold: true, color: 'DC2626', size: 20, font: 'Calibri' }));
  }
  titleChildren.push(new TextRun({ text: ev.title, bold: true, italics: isLowConfidence, size: 20, font: 'Calibri' }));
  paragraphs.push(new Paragraph({
    children: titleChildren,
    spacing: { after: 40 },
  }));

  if (ev.description) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: ev.description, italics: isLowConfidence, size: 18, font: 'Calibri' })],
      spacing: { after: 40 },
    }));
  }

  const meta: string[] = [];
  if (ev.doctor) meta.push(`Dr. ${ev.doctor}`);
  if (ev.facility) meta.push(ev.facility);
  if (isLowConfidence) meta.push(`Confidenza ${Math.round(ev.confidence ?? 0)}%`);
  if (meta.length > 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: meta.join(' — '),
        size: 16,
        italics: true,
        color: isLowConfidence ? 'B91C1C' : '555555',
        font: 'Calibri',
      })],
    }));
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Header row for the table
// ---------------------------------------------------------------------------

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'B0B0B0' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'B0B0B0' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'B0B0B0' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'B0B0B0' },
};

const COLUMN_WIDTHS = [
  { text: 'N.', pct: 500 },       // 5%
  { text: 'Data', pct: 1200 },    // 12%
  { text: 'Tipo', pct: 1200 },    // 12%
  { text: 'Titolo / Descrizione', pct: 5600 }, // 56%
  { text: 'Fonte', pct: 1500 },   // 15%
];

function buildHeaderRow(): TableRow {
  const headerStyle = { bold: true, size: 20, color: 'FFFFFF', font: 'Calibri' };
  const shading = { type: ShadingType.SOLID, fill: '1B3A6B', color: '1B3A6B' };

  return new TableRow({
    tableHeader: true,
    children: COLUMN_WIDTHS.map((c) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ ...headerStyle, text: c.text })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 40 },
      })],
      shading,
      width: { size: c.pct, type: WidthType.PERCENTAGE },
      borders: TABLE_BORDERS,
    })),
  });
}

// ---------------------------------------------------------------------------
// Event row
// ---------------------------------------------------------------------------

function buildEventRow(ev: TimelineEvent, isEven: boolean): TableRow {
  const shading = isEven
    ? { type: ShadingType.SOLID, fill: 'F2F6FC', color: 'F2F6FC' }
    : undefined;

  const cellOpts = (pct: number) => ({
    width: { size: pct, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    ...(shading ? { shading } : {}),
  });

  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: String(ev.order_number), size: 18, font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        })],
        ...cellOpts(COLUMN_WIDTHS[0].pct),
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: formatDate(ev.event_date), size: 18, font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        })],
        ...cellOpts(COLUMN_WIDTHS[1].pct),
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: eventTypeLabel(ev.event_type), size: 18, font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        })],
        ...cellOpts(COLUMN_WIDTHS[2].pct),
      }),
      new TableCell({
        children: buildDescriptionParagraphs(ev),
        ...cellOpts(COLUMN_WIDTHS[3].pct),
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: sourceLabel(ev.source_type), size: 16, font: 'Calibri' })],
        })],
        ...cellOpts(COLUMN_WIDTHS[4].pct),
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Generate a "Cronistoria Documentale" DOCX for extraction_only / expenses_only cases.
 * Returns a Buffer ready for download.
 */
export async function generateTimelineDocx(params: TimelineDocxParams): Promise<Buffer> {
  const { caseCode, patientInitials, events, moduleName } = params;

  const now = new Date().toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // -- Document header paragraphs --
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [new TextRun({
      text: 'CRONISTORIA DOCUMENTALE',
      bold: true,
      size: 36,
      font: 'Calibri',
      color: '2B579A',
    })],
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  // Metadata lines
  const metaLines: string[] = [
    `Caso: ${caseCode}`,
  ];
  if (patientInitials) metaLines.push(`Paziente: ${patientInitials}`);
  if (moduleName) metaLines.push(`Modulo: ${moduleName}`);
  metaLines.push(`Data generazione: ${now}`);
  metaLines.push(`Numero eventi: ${events.length}`);

  for (const line of metaLines) {
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 22, font: 'Calibri', color: '333333' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }));
  }

  // Horizontal rule
  children.push(new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2B579A', space: 1 } },
    spacing: { before: 200, after: 300 },
  }));

  // -- Events table --
  if (events.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Nessun evento estratto.', italics: true, size: 22, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
    }));
  } else {
    const tableRows = [
      buildHeaderRow(),
      ...events.map((ev, idx) => buildEventRow(ev, idx % 2 === 0)),
    ];

    children.push(new Table({
      rows: tableRows,
      width: { size: 10000, type: WidthType.PERCENTAGE },
    }));
  }

  // -- Footer --
  const footer = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'Generato con LegMed — ', size: 16, color: '999999', font: 'Calibri' }),
          new TextRun({ text: `${caseCode} — Pagina `, size: 16, color: '999999', font: 'Calibri' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999', font: 'Calibri' }),
          new TextRun({ text: ' di ', size: 16, color: '999999', font: 'Calibri' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '999999', font: 'Calibri' }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

  // -- Header (watermark) --
  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'RISERVATO', color: 'C0C0C0', size: 18, italics: true, font: 'Calibri' }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });

  // -- Build document --
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,    // 1 inch
            right: 1440,
            bottom: 1440,
            left: 1440,
          },
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
