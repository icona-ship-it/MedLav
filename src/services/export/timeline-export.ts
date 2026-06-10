import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, Header, Footer, PageNumber,
} from 'docx';
import { formatDate } from '@/lib/format';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
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
  /** Non più renderizzato (benchmark gold passaniti 2026-06-10 + GDPR): il
   * meta-block di testa con la riga Paziente è stato eliminato. Mantenuto
   * nell'interfaccia per compatibilità con i call-site. */
  patientInitials: string | null;
  events: TimelineEvent[];
  /** Non più renderizzato (dicitura interna dell'app). */
  moduleName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the paragraphs for a single event, in NARRATIVE form (not a table).
 * Benchmark gold passaniti (2026-06-10): il perito elimina il tipo evento e le
 * etichette FONTE — la testata è "DATA — TITOLO", l'attribuzione resta
 * "Dr. — Struttura":
 *   **DATA — TITOLO**          (intestazione in grassetto)
 *   Descrizione
 *   Diagnosi: ...              (se presente)
 *   Medico — Struttura         (riga meta, piccola)
 */
function buildEventBlock(ev: TimelineEvent): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Intestazione "DATA — TITOLO". Documento professionale: NESSUN flag interno
  // di lavoro (DA VERIFICARE / confidenza). La revisione avviene a schermo.
  paragraphs.push(new Paragraph({
    children: [new TextRun({
      text: ev.title ? `${formatDate(ev.event_date)} — ${ev.title}` : formatDate(ev.event_date),
      bold: true,
      size: 22,
      font: 'Calibri',
      color: '1B3A6B',
    })],
    spacing: { before: 180, after: 40 },
  }));

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

  // Riga meta: medico — struttura (niente etichetta FONTE, eliminata dal perito)
  const meta: string[] = [];
  if (ev.doctor) meta.push(ev.doctor.startsWith('Dr') ? ev.doctor : `Dr. ${ev.doctor}`);
  if (ev.facility) meta.push(ev.facility);
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
  const { caseCode, events: allEvents } = params;

  // Fix audit 2026-05-11: le spese senza data (eventDate='1900-01-01') non hanno
  // posto nella cronologia temporale (sono nella tabella spese). Inoltre filtriamo
  // gli eventi che il perito ha escluso dalla cronologia (is_relevant_for_chronology
  // === false). Default: incluso. Poi ordina cronologicamente (difensivo).
  const SENTINEL_DATE = '1900-01-01';
  // Difesa in profondità (oltre al filtro nelle route): mai eventi non clinici
  // (spese/amministrativi) nella cronistoria — il perito li cancella sempre.
  const events = sortEventsChrono(
    allEvents.filter((ev) =>
      ev.event_date !== SENTINEL_DATE &&
      ev.is_relevant_for_chronology !== false &&
      !NON_CLINICAL_EVENT_TYPES.has(ev.event_type)),
  );

  // Benchmark gold passaniti (2026-06-10): niente titolo grande né meta-block
  // (Caso/Paziente/Modulo/Data/Numero eventi — la riga Paziente era anche
  // un'esposizione GDPR inutile). Il documento parte direttamente dagli eventi
  // sotto l'header RISERVATO; il codice caso resta nel footer.
  const children: Paragraph[] = [];

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
