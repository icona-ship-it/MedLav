import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, ShadingType,
  Header, Footer, PageNumber, Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';
import { sourceLabelsExport as sourceLabels, anomalyTypeLabels as anomalyLabels } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import type { DocumentWithPages } from './load-case-data';
import { assembleFullReport, type PeriziaMetadataExport as AssemblerPeriziaMetadata } from './report-assembler';

const DOCX_ROLE_DESCRIPTIONS: Record<string, string> = {
  ctu: 'CTU - Consulente Tecnico d\'Ufficio (prospettiva neutrale)',
  ctp: 'CTP - Consulente Tecnico di Parte (prospettiva del paziente)',
  stragiudiziale: 'Perito Stragiudiziale (valutazione di merito)',
};

interface DocxEvent {
  order_number: number;
  event_date: string;
  date_precision: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
  confidence: number;
  requires_verification: boolean;
  expert_notes: string | null;
}

interface DocxAnomaly {
  anomaly_type: string;
  severity: string;
  description: string;
  suggestion: string | null;
}

interface DocxMissingDoc {
  document_name: string;
  reason: string;
  related_event: string | null;
}

interface PeriziaMetadataExport {
  tribunale?: string;
  sezione?: string;
  rgNumber?: string;
  judgeName?: string;
  ctuName?: string;
  ctuTitle?: string;
  collaboratoreName?: string;
  collaboratoreTitle?: string;
  ctpRicorrente?: string;
  ctpResistente?: string;
  parteRicorrente?: string;
  parteResistente?: string;
  dataIncarico?: string;
  dataOperazioni?: string;
  dataDeposito?: string;
  quesiti?: string[];
  fondoSpese?: string;
  [key: string]: unknown;
}

interface DocxExportParams {
  caseCode: string;
  caseType: string;
  caseRole: string;
  patientInitials: string | null;
  synthesis: string | null;
  events: DocxEvent[];
  anomalies: DocxAnomaly[];
  missingDocs: DocxMissingDoc[];
  calculations?: MedicoLegalCalculation[];
  periziaMetadata?: PeriziaMetadataExport | null;
  reportStatus?: string;
}

/**
 * Determine the watermark text based on report status.
 */
function getDocxWatermarkText(reportStatus?: string): string {
  if (reportStatus === 'bozza') return 'RISERVATO — BOZZA';
  return 'CONFIDENZIALE';
}

/**
 * Build a DOCX Header containing the watermark text.
 */
function buildWatermarkHeader(reportStatus?: string): Header {
  const watermarkText = getDocxWatermarkText(reportStatus);
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: watermarkText,
            color: 'C0C0C0',
            size: 18,
            italics: true,
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
  });
}

/**
 * Generate a DOCX report document.
 * Returns a Buffer ready for download.
 */
export async function generateDocxReport(params: DocxExportParams): Promise<Buffer> {
  const { caseCode, caseType, caseRole, patientInitials, synthesis, events, anomalies, missingDocs, calculations, periziaMetadata, reportStatus } = params;

  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });

  const children: Paragraph[] = [];

  // Formal perizia header (if metadata present)
  if (periziaMetadata && (periziaMetadata.tribunale || periziaMetadata.ctuName)) {
    const roleTitle = caseRole === 'ctu' ? 'CONSULENZA TECNICA D\'UFFICIO'
      : caseRole === 'ctp' ? 'CONSULENZA TECNICA DI PARTE'
      : 'PERIZIA STRAGIUDIZIALE';

    if (periziaMetadata.tribunale) {
      children.push(new Paragraph({
        children: [new TextRun({ text: periziaMetadata.tribunale.toUpperCase(), bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    if (periziaMetadata.sezione) {
      children.push(new Paragraph({
        children: [new TextRun({ text: periziaMetadata.sezione, size: 24 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    if (periziaMetadata.rgNumber) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `n. R.G. ${periziaMetadata.rgNumber}`, size: 24 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({
      children: [new TextRun({ text: roleTitle, bold: true, size: 26 })],
      alignment: AlignmentType.CENTER,
    }));
    if (patientInitials) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `relativa alla vicenda clinica del/della sig. ${patientInitials}`, size: 24 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    children.push(new Paragraph({ text: '' }));

    const details: Array<{ label: string; value: string }> = [];
    if (periziaMetadata.ctuName) details.push({ label: 'CTU', value: `${periziaMetadata.ctuName}${periziaMetadata.ctuTitle ? ` — ${periziaMetadata.ctuTitle}` : ''}` });
    if (periziaMetadata.judgeName) details.push({ label: 'Giudice', value: periziaMetadata.judgeName });
    if (periziaMetadata.parteRicorrente) details.push({ label: 'Parte Ricorrente', value: periziaMetadata.parteRicorrente });
    if (periziaMetadata.parteResistente) details.push({ label: 'Parte Resistente', value: periziaMetadata.parteResistente });
    if (periziaMetadata.ctpRicorrente) details.push({ label: 'CTP Ricorrente', value: periziaMetadata.ctpRicorrente });
    if (periziaMetadata.ctpResistente) details.push({ label: 'CTP Resistente', value: periziaMetadata.ctpResistente });
    if (periziaMetadata.dataIncarico) details.push({ label: 'Data incarico', value: periziaMetadata.dataIncarico });
    if (periziaMetadata.dataOperazioni) details.push({ label: 'Data operazioni', value: periziaMetadata.dataOperazioni });
    if (periziaMetadata.dataDeposito) details.push({ label: 'Termine deposito', value: periziaMetadata.dataDeposito });
    if (periziaMetadata.fondoSpese) details.push({ label: 'Fondo spese', value: periziaMetadata.fondoSpese });

    for (const detail of details) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${detail.label}: `, bold: true }),
          new TextRun({ text: detail.value }),
        ],
      }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  // Title
  children.push(
    new Paragraph({
      text: 'REPORT MEDICO-LEGALE',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
  );

  // Header info
  children.push(
    new Paragraph({ children: [new TextRun({ text: `Caso: ${caseCode}`, bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: `Paziente: ${patientInitials ?? 'N/D'}` })] }),
    new Paragraph({ children: [new TextRun({ text: `Tipo: ${caseType} | Ruolo: ${DOCX_ROLE_DESCRIPTIONS[caseRole] ?? caseRole.toUpperCase()}` })] }),
    new Paragraph({ children: [new TextRun({ text: `Data report: ${now}` })] }),
    new Paragraph({
      children: [new TextRun({ text: `Eventi: ${events.length} | Anomalie: ${anomalies.length} | Doc. Mancanti: ${missingDocs.length}` })],
    }),
    new Paragraph({ text: '' }),
  );

  // Section 1: Synthesis
  children.push(
    new Paragraph({
      text: '1. SINTESI MEDICO-LEGALE',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  );

  if (synthesis) {
    const paragraphs = synthesis.split('\n').filter((l) => l.trim());
    for (const para of paragraphs) {
      const isHeading = para.startsWith('##');
      if (isHeading) {
        children.push(new Paragraph({
          text: para.replace(/^#+\s*/, ''),
          heading: HeadingLevel.HEADING_2,
        }));
      } else {
        children.push(new Paragraph({ text: para }));
      }
    }
  } else {
    children.push(new Paragraph({ text: 'Sintesi non ancora generata.' }));
  }

  children.push(new Paragraph({ text: '' }));

  // Section 2: Timeline
  children.push(
    new Paragraph({
      text: '2. CRONOLOGIA EVENTI CLINICI',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  );

  for (const event of events) {
    const datePrecNote = event.date_precision !== 'giorno' ? ` [${event.date_precision}]` : '';
    const source = sourceLabels[event.source_type] ?? event.source_type;

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${formatDate(event.event_date)}${datePrecNote} `, bold: true }),
          new TextRun({ text: `[${source}]`, bold: true, color: '1E40AF' }),
          event.requires_verification ? new TextRun({ text: ' [DA VERIFICARE]', color: 'DC2626', bold: true }) : new TextRun({ text: '' }),
        ],
        spacing: { before: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: event.title, bold: true })],
      }),
      new Paragraph({ text: event.description }),
    );

    if (event.diagnosis) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Diagnosi: ', bold: true }),
          new TextRun({ text: event.diagnosis }),
        ],
      }));
    }

    if (event.doctor) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Medico: ', bold: true }),
          new TextRun({ text: event.doctor }),
        ],
      }));
    }

    if (event.expert_notes) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Note perito: ', bold: true, italics: true }),
          new TextRun({ text: event.expert_notes, italics: true }),
        ],
        shading: { type: ShadingType.SOLID, color: 'EFF6FF' },
      }));
    }
  }

  children.push(new Paragraph({ text: '' }));

  // Section 3: Calculations (if available)
  if (calculations && calculations.length > 0) {
    children.push(
      new Paragraph({
        text: '3. PERIODI MEDICO-LEGALI CALCOLATI',
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: '' }),
    );

    for (const calc of calculations) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${calc.label}: `, bold: true }),
            new TextRun({ text: calc.value, bold: true, color: '1E40AF' }),
          ],
          spacing: { before: 150 },
        }),
      );
      if (calc.startDate && calc.endDate) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `${formatDate(calc.startDate)} — ${formatDate(calc.endDate)}`, color: '64748B', size: 22 })],
        }));
      }
      children.push(new Paragraph({
        children: [new TextRun({ text: calc.notes, italics: true, color: '64748B', size: 22 })],
      }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  // Section: Anomalies
  const anomalySectionNum = calculations && calculations.length > 0 ? '4' : '3';
  children.push(
    new Paragraph({
      text: `${anomalySectionNum}. ANOMALIE RILEVATE`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  );

  if (anomalies.length === 0) {
    children.push(new Paragraph({ text: 'Nessuna anomalia rilevata.' }));
  } else {
    for (const anomaly of anomalies) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${anomaly.severity.toUpperCase()}] `, bold: true, color: anomaly.severity === 'critica' || anomaly.severity === 'alta' ? 'DC2626' : 'CA8A04' }),
            new TextRun({ text: anomalyLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type, bold: true }),
          ],
          spacing: { before: 150 },
        }),
        new Paragraph({ text: anomaly.description }),
      );
      if (anomaly.suggestion) {
        children.push(new Paragraph({
          children: [new TextRun({ text: anomaly.suggestion, italics: true, color: '64748B' })],
        }));
      }
    }
  }

  children.push(new Paragraph({ text: '' }));

  // Section 4: Missing Docs
  children.push(
    new Paragraph({
      text: `${calculations && calculations.length > 0 ? '5' : '4'}. DOCUMENTAZIONE MANCANTE`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  );

  if (missingDocs.length === 0) {
    children.push(new Paragraph({ text: 'Nessuna documentazione mancante rilevata.' }));
  } else {
    for (const doc of missingDocs) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: doc.document_name, bold: true })],
          spacing: { before: 100 },
        }),
        new Paragraph({ text: doc.reason }),
      );
    }
  }

  // Footer
  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({ text: `Report generato da MedLav il ${now}`, color: '94A3B8', size: 18 })],
      alignment: AlignmentType.CENTER,
    }),
  );

  const doc = new Document({
    sections: [{
      properties: {},
      headers: {
        default: buildWatermarkHeader(reportStatus),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ── Professional DOCX Export ──

interface ProfessionalDocxExportParams {
  caseCode: string;
  caseType: string;
  caseRole: string;
  patientInitials: string | null;
  synthesis: string | null;
  events: DocxEvent[];
  anomalies: DocxAnomaly[];
  missingDocs: DocxMissingDoc[];
  calculations?: MedicoLegalCalculation[];
  periziaMetadata: PeriziaMetadataExport;
  documentsWithPages: DocumentWithPages[];
  reportStatus?: string;
}

/**
 * Parse a markdown pipe table into rows of cells.
 */
function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return null;
  // Filter separator rows
  const dataLines = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
  if (dataLines.length === 0) return null;
  return dataLines.map((line) =>
    line.split('|').slice(1, -1).map((c) => c.trim()),
  );
}

/**
 * Convert a section's markdown content to DOCX paragraphs.
 * Handles headings, bold/italic, lists, tables, and plain text.
 */
function markdownToDocxParagraphs(content: string): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') { i++; continue; }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      result.push(new Paragraph({
        children: [new TextRun({ text: '————————————————————', color: '999999', size: 18 })],
        spacing: { before: 100, after: 100 },
      }));
      i++;
      continue;
    }

    // Table block
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableData = parseMarkdownTable(tableLines.join('\n'));
      if (tableData && tableData.length > 0) {
        const noBorder = { style: BorderStyle.SINGLE, size: 1, color: '666666' };
        const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
        const rows = tableData.map((row, rowIdx) =>
          new TableRow({
            children: row.map((cell) =>
              new TableCell({
                children: [new Paragraph({
                  children: [new TextRun({ text: cell, bold: rowIdx === 0, size: 20 })],
                })],
                borders,
                width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
              }),
            ),
          }),
        );
        result.push(new Table({ rows, width: { size: 9000, type: WidthType.DXA } }));
        result.push(new Paragraph({ text: '' }));
      }
      continue;
    }

    // Headings
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      result.push(new Paragraph({
        text: h3Match[1],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200 },
      }));
      i++;
      continue;
    }

    const h4Match = line.match(/^####\s+(.+)$/);
    if (h4Match) {
      result.push(new Paragraph({
        children: [new TextRun({ text: h4Match[1], bold: true })],
        spacing: { before: 150 },
      }));
      i++;
      continue;
    }

    // List items
    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    if (ulMatch) {
      result.push(new Paragraph({
        children: parseInlineFormatting(ulMatch[1]),
        bullet: { level: 0 },
      }));
      i++;
      continue;
    }

    const olMatch = line.match(/^[\s]*(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      result.push(new Paragraph({
        children: [
          new TextRun({ text: `${olMatch[1]}. ` }),
          ...parseInlineFormatting(olMatch[2]),
        ],
        spacing: { before: 50 },
      }));
      i++;
      continue;
    }

    // Regular paragraph
    result.push(new Paragraph({
      children: parseInlineFormatting(line),
    }));
    i++;
  }

  return result;
}

/**
 * Parse inline markdown formatting (bold, italic) into TextRun array.
 */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Split on bold (**text**) and italic (*text*)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else if (part.length > 0) {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/**
 * Build 2-column header for DOCX: CTU on left, collaborator on right,
 * separated by a dotted bottom border. Uses a borderless table for layout.
 */
function buildDocxHeaderContent(
  pm: AssemblerPeriziaMetadata,
  hasCollaboratore: boolean,
): (Paragraph | Table)[] {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const cellBorders = { top: noBorder, left: noBorder, right: noBorder, bottom: noBorder };

  const leftCellChildren: Paragraph[] = [];
  if (pm.ctuName) {
    leftCellChildren.push(new Paragraph({
      children: [new TextRun({ text: pm.ctuName, bold: true, italics: true, size: 19, allCaps: true })],
    }));
  }
  if (pm.ctuTitle) {
    leftCellChildren.push(new Paragraph({
      children: [new TextRun({ text: pm.ctuTitle, size: 16, allCaps: true, color: '333333' })],
    }));
  }

  const rightCellChildren: Paragraph[] = [];
  if (hasCollaboratore && pm.collaboratoreName) {
    rightCellChildren.push(new Paragraph({
      children: [new TextRun({ text: pm.collaboratoreName, bold: true, italics: true, size: 19, allCaps: true })],
      alignment: AlignmentType.RIGHT,
    }));
    if (pm.collaboratoreTitle) {
      rightCellChildren.push(new Paragraph({
        children: [new TextRun({ text: pm.collaboratoreTitle, size: 16, allCaps: true, color: '333333' })],
        alignment: AlignmentType.RIGHT,
      }));
    }
  }

  // If no content, return empty
  if (leftCellChildren.length === 0 && rightCellChildren.length === 0) {
    return [];
  }

  // Ensure cells have at least one paragraph
  if (leftCellChildren.length === 0) leftCellChildren.push(new Paragraph({ text: '' }));
  if (rightCellChildren.length === 0) rightCellChildren.push(new Paragraph({ text: '' }));

  const headerTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: leftCellChildren,
            borders: cellBorders,
            width: { size: 4500, type: WidthType.DXA },
          }),
          new TableCell({
            children: rightCellChildren,
            borders: cellBorders,
            width: { size: 4500, type: WidthType.DXA },
          }),
        ],
      }),
    ],
    width: { size: 9000, type: WidthType.DXA },
  });

  return [
    headerTable,
    new Paragraph({
      text: '',
      border: { bottom: { style: BorderStyle.DOTTED, size: 3, color: '444444', space: 4 } },
    }),
  ];
}

/**
 * Generate a court-quality professional DOCX report with headers, footers,
 * full OCR documentation, and assembled sections.
 */
export async function generateProfessionalDocxReport(params: ProfessionalDocxExportParams): Promise<Buffer> {
  const { caseRole, patientInitials, periziaMetadata, documentsWithPages, synthesis, anomalies, missingDocs, calculations, reportStatus } = params;

  const pm = periziaMetadata as AssemblerPeriziaMetadata;
  const assembled = assembleFullReport({
    periziaMetadata: pm,
    caseRole,
    documentsWithPages,
    synthesis,
    anomalies,
    missingDocs,
    calculations,
    events: (params.events ?? []).map((e) => ({
      event_date: e.event_date,
      event_type: e.event_type,
      title: e.title,
      description: e.description,
      source_type: e.source_type,
      source_text: (e as unknown as Record<string, unknown>).source_text as string | null ?? null,
      diagnosis: e.diagnosis ?? null,
      doctor: e.doctor ?? null,
      facility: e.facility ?? null,
    })),
  });

  const patientInfo = patientInitials ?? '';
  const hasCollaboratore = Boolean(pm.collaboratoreName);
  const roleTitle = caseRole === 'ctu' ? 'CONSULENZA TECNICA D\'UFFICIO'
    : caseRole === 'ctp' ? 'CONSULENZA TECNICA DI PARTE'
    : 'PERIZIA STRAGIUDIZIALE';

  const children: (Paragraph | Table)[] = [];

  // Cover page
  if (pm.tribunale) {
    children.push(new Paragraph({
      children: [new TextRun({ text: pm.tribunale.toUpperCase(), bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    }));
  }
  if (pm.sezione) {
    children.push(new Paragraph({
      children: [new TextRun({ text: pm.sezione, size: 24 })],
      alignment: AlignmentType.CENTER,
    }));
  }
  if (pm.rgNumber) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `n. R.G. ${pm.rgNumber}`, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
  }
  children.push(new Paragraph({
    children: [new TextRun({ text: roleTitle, bold: true, size: 28, underline: {} })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
  }));
  if (patientInitials) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `relativa alla vicenda clinica del/della sig. ${patientInitials}`, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
  }

  // Cover details
  const coverDetails: Array<{ label: string; value: string }> = [];
  if (pm.ctuName) coverDetails.push({ label: caseRole === 'ctu' ? 'CTU' : 'CTP', value: `${pm.ctuName}${pm.ctuTitle ? ` — ${pm.ctuTitle}` : ''}` });
  if (pm.judgeName) coverDetails.push({ label: 'Giudice', value: pm.judgeName });
  if (pm.parteRicorrente) coverDetails.push({ label: 'Parte Ricorrente', value: pm.parteRicorrente });
  if (pm.parteResistente) coverDetails.push({ label: 'Parte Resistente', value: pm.parteResistente });
  if (pm.dataIncarico) coverDetails.push({ label: 'Data incarico', value: pm.dataIncarico });
  if (pm.dataDeposito) coverDetails.push({ label: 'Termine deposito', value: pm.dataDeposito });
  if (pm.fondoSpese) coverDetails.push({ label: 'Fondo spese', value: pm.fondoSpese });

  for (const detail of coverDetails) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${detail.label}: `, bold: true }),
        new TextRun({ text: detail.value }),
      ],
    }));
  }

  children.push(new Paragraph({ text: '', spacing: { after: 400 } }));

  // Table of Contents
  children.push(new Paragraph({
    children: [new TextRun({ text: 'INDICE', bold: true, size: 26, underline: {} })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
  }));
  for (const item of assembled.tableOfContents) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${item.number}. ${item.title}` })],
      spacing: { before: 50 },
    }));
  }
  children.push(new Paragraph({ text: '', spacing: { after: 400 } }));

  // Sections
  for (const section of assembled.sections) {
    children.push(new Paragraph({
      text: `${section.number}. ${section.title}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 100 },
    }));

    const sectionParagraphs = markdownToDocxParagraphs(section.content);
    children.push(...sectionParagraphs);
    children.push(new Paragraph({ text: '' }));
  }

  // Footer timestamp
  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
  children.push(new Paragraph({
    children: [new TextRun({ text: `Report generato da MedLav il ${now}`, color: '94A3B8', size: 18 })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
  }));

  const doc = new Document({
    sections: [{
      properties: {},
      headers: {
        default: new Header({
          children: [
            ...buildDocxHeaderContent(pm, hasCollaboratore),
            new Paragraph({
              children: [
                new TextRun({
                  text: getDocxWatermarkText(reportStatus),
                  color: 'C0C0C0',
                  size: 18,
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${pm.rgNumber ? `${pm.rgNumber} N.R.G.` : ''} – ${patientInfo}${pm.parteResistente ? ` // ${pm.parteResistente}` : ''}`, size: 17, color: '444444', italics: true }),
              ],
              alignment: AlignmentType.LEFT,
              border: { top: { style: BorderStyle.DOTTED, size: 3, color: '444444', space: 4 } },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: '', size: 17, color: '444444' }),
              ],
              alignment: AlignmentType.RIGHT,
              // Page number in same footer paragraph
            }),
            new Paragraph({
              children: [
                new TextRun({ children: [PageNumber.CURRENT], size: 17, color: '444444' }),
                new TextRun({ text: '/', size: 17, color: '444444' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: '444444' }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      },
      children: children as Paragraph[],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
