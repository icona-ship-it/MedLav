import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Header, Footer, PageNumber, BorderStyle,
} from 'docx';
import { formatDate } from '@/lib/format';
import { sourceLabelsExport as sourceLabels } from '@/lib/constants';
import { sortEventsChrono } from '@/lib/event-order';

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
  diagnosis?: string | null;
  /** Inclusione nella cronologia esportata. Assente o true = incluso. */
  is_relevant_for_chronology?: boolean;
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

/**
 * Build the paragraphs for a single event, in NARRATIVE form (not a table):
 *   **DATA — TIPO**            (intestazione in grassetto)
 *   Titolo
 *   Descrizione
 *   Diagnosi: ...              (se presente)
 *   Medico — Struttura — Fonte (riga meta, piccola)
 */
function buildEventBlock(ev: TimelineEvent): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Intestazione "DATA — TIPO". Documento professionale: NESSUN flag interno di
  // lavoro (DA VERIFICARE / confidenza). La revisione avviene a schermo.
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: `${formatDate(ev.event_date)} — ${eventTypeLabel(ev.event_type)}`,
      bold: true,
      size: 22,
      font: 'Calibri',
      color: '1B3A6B',
    })],
    spacing: { before: 180, after: 40 },
  }));

  // Titolo
  if (ev.title) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: ev.title, bold: true, size: 20, font: 'Calibri' })],
      spacing: { after: 30 },
    }));
  }

  // Descrizione
  if (ev.description) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: ev.description, size: 20, font: 'Calibri' })],
      spacing: { after: 30 },
    }));
  }

  // Diagnosi
  if (ev.diagnosis) {
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: 'Diagnosi: ', bold: true, size: 20, font: 'Calibri' }),
        new TextRun({ text: ev.diagnosis, size: 20, font: 'Calibri' }),
      ],
      spacing: { after: 30 },
    }));
  }

  // Riga meta: medico — struttura — fonte
  const meta: string[] = [];
  if (ev.doctor) meta.push(ev.doctor.startsWith('Dr') ? ev.doctor : `Dr. ${ev.doctor}`);
  if (ev.facility) meta.push(ev.facility);
  if (ev.source_type) meta.push(sourceLabel(ev.source_type));
  if (meta.length > 0) {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: meta.join(' — '), size: 16, italics: true, color: '777777', font: 'Calibri' })],
      spacing: { after: 80 },
    }));
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Generate a "Cronistoria Documentale" DOCX for extraction_only / expenses_only cases.
 * Documento scritto (non tabella). Returns a Buffer ready for download.
 */
export async function generateTimelineDocx(params: TimelineDocxParams): Promise<Buffer> {
  const { caseCode, patientInitials, events: allEvents, moduleName } = params;

  // Fix audit 2026-05-11: le spese senza data (eventDate='1900-01-01') non hanno
  // posto nella cronologia temporale (sono nella tabella spese). Inoltre filtriamo
  // gli eventi che il perito ha escluso dalla cronologia (is_relevant_for_chronology
  // === false). Default: incluso. Poi ordina cronologicamente (difensivo).
  const SENTINEL_DATE = '1900-01-01';
  const events = sortEventsChrono(
    allEvents.filter((ev) => ev.event_date !== SENTINEL_DATE && ev.is_relevant_for_chronology !== false),
  );

  const now = new Date().toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const children: Paragraph[] = [];

  // Titolo
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

  // Metadati
  const metaLines: string[] = [`Caso: ${caseCode}`];
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

  // Riga orizzontale
  children.push(new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2B579A', space: 1 } },
    spacing: { before: 200, after: 300 },
  }));

  // Eventi in forma narrativa
  if (events.length === 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Nessun evento estratto.', italics: true, size: 22, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
    }));
  } else {
    for (const ev of events) {
      children.push(...buildEventBlock(ev));
    }
  }

  // Footer con numeri pagina
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

  const header = new Header({
    children: [
      new Paragraph({
        children: [new TextRun({ text: 'RISERVATO', color: 'C0C0C0', size: 18, italics: true, font: 'Calibri' })],
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
