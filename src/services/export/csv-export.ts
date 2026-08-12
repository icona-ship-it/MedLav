import Papa from 'papaparse';
import { sourceLabels, NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { formatDate } from '@/lib/format';

interface CsvEvent {
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
}

/**
 * Generate CSV export of events.
 * Semicolon separator for Italian Excel compatibility.
 * UTF-8 with BOM.
 *
 * Filters out non-clinical events (SSN cost notices, ticket payments, admin
 * documents) — Passaniti regression. The cronistoria CSV is intended as a
 * clinical timeline, not a billing log.
 */
export function generateCsvExport(events: CsvEvent[]): string {
  const rows = events
    .filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type))
    .map((e) => ({
      Ordine: e.order_number,
      Tipo: e.event_type,
      Data: formatDate(e.event_date),
      Precisione: e.date_precision,
      Fonte: sourceLabels[e.source_type] ?? e.source_type,
      Titolo: e.title,
      Descrizione: e.description,
      Diagnosi: e.diagnosis ?? '',
      Medico: e.doctor ?? '',
      Struttura: e.facility ?? '',
      Confidenza: e.confidence,
      'Bassa Confidenza': e.confidence < 60 ? 'Si' : 'No',
      'Richiede Verifica': e.requires_verification ? 'Si' : 'No',
    }));

  const csv = Papa.unparse(rows, {
    delimiter: ';',
    header: true,
    // CSV formula injection (audit 2026-08-11): una cella che inizia con = + - @
    // viene eseguita come formula aprendo il file in Excel (esfiltrazione via
    // HYPERLINK/WEBSERVICE). I contenuti vengono dall'estrazione LLM su OCR di
    // documenti anche di controparte → non fidati. escapeFormulae le neutralizza.
    escapeFormulae: true,
  });

  // UTF-8 BOM for Excel
  return '\uFEFF' + csv;
}
