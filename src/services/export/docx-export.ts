import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, ShadingType,
} from 'docx';
import { sourceLabelsExport as sourceLabels, anomalyTypeLabels as anomalyLabels } from '@/lib/constants';
import { formatDate } from '@/lib/format';

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

interface DocxExportParams {
  caseCode: string;
  caseType: string;
  caseRole: string;
  patientInitials: string | null;
  synthesis: string | null;
  events: DocxEvent[];
  anomalies: DocxAnomaly[];
  missingDocs: DocxMissingDoc[];
}

/**
 * Generate a DOCX report document.
 * Returns a Buffer ready for download.
 */
export async function generateDocxReport(params: DocxExportParams): Promise<Buffer> {
  const { caseCode, caseType, caseRole, patientInitials, synthesis, events, anomalies, missingDocs } = params;

  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });

  const children: Paragraph[] = [];

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
    new Paragraph({ children: [new TextRun({ text: `Tipo: ${caseType} | Ruolo: ${caseRole.toUpperCase()}` })] }),
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

  // Section 3: Anomalies
  children.push(
    new Paragraph({
      text: '3. ANOMALIE RILEVATE',
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
      text: '4. DOCUMENTAZIONE MANCANTE',
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
