import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, ShadingType,
} from 'docx';
import { sourceLabelsExport as sourceLabels, anomalyTypeLabels as anomalyLabels } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';

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
}

interface PeriziaMetadataExport {
  tribunale?: string;
  sezione?: string;
  rgNumber?: string;
  judgeName?: string;
  ctuName?: string;
  ctuTitle?: string;
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
}

/**
 * Generate a DOCX report document.
 * Returns a Buffer ready for download.
 */
export async function generateDocxReport(params: DocxExportParams): Promise<Buffer> {
  const { caseCode, caseType, caseRole, patientInitials, synthesis, events, anomalies, missingDocs, calculations, periziaMetadata } = params;

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
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
