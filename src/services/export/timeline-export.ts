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

  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: ev.title, bold: true, size: 20, font: 'Calibri' })],
    spacing: { after: 40 },
  }));

  if (ev.description) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: ev.description, size: 18, font: 'Calibri' })],
      spacing: { after: 40 },
    }));
  }

  const meta: string[] = [];
  if (ev.doctor) meta.push(`Dr. ${ev.doctor}`);
  if (ev.facility) meta.push(ev.facility);
  if (meta.length > 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: meta.join(' — '), size: 16, italics: true, color: '555555', font: 'Calibri' })],
    }));
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Header row for the table
// ---------------------------------------------------------------------------

function buildHeaderRow(): TableRow {
  const headerStyle = { bold: true, size: 20, color: 'FFFFFF', font: 'Calibri' };
  const shading = { type: ShadingType.SOLID, fill: '2B579A', color: '2B579A' };

  const cells = [
    { text: 'N.', width: 600 },
    { text: 'Data', width: 1400 },
    { text: 'Tipo', width: 1400 },
    { text: 'Titolo / Descrizione', width: 4200 },
    { text: 'Fonte', width: 1900 },
  ];

  return new TableRow({
    tableHeader: true,
    children: cells.map((c) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ ...headerStyle, text: c.text })],
        alignment: AlignmentType.CENTER,
      })],
      shading,
      width: { size: c.width, type: WidthType.DXA },
      verticalAlign: 'center' as unknown as undefined,
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

  const cellOpts = (width: number) => ({
    width: { size: width, type: WidthType.DXA },
    ...(shading ? { shading } : {}),
  });

  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: String(ev.order_number), size: 18, font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        })],
        ...cellOpts(600),
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: formatDate(ev.event_date), size: 18, font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        })],
        ...cellOpts(1400),
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: eventTypeLabel(ev.event_type), size: 18, font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        })],
        ...cellOpts(1400),
      }),
      new TableCell({
        children: buildDescriptionParagraphs(ev),
        ...cellOpts(4200),
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: sourceLabel(ev.source_type), size: 16, font: 'Calibri' })],
        })],
        ...cellOpts(1900),
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
      width: { size: 9500, type: WidthType.DXA },
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
