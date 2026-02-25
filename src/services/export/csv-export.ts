import Papa from 'papaparse';
import { sourceLabels } from '@/lib/constants';
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
 */
export function generateCsvExport(events: CsvEvent[]): string {
  const rows = events.map((e) => ({
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
    'Richiede Verifica': e.requires_verification ? 'Si' : 'No',
  }));

  const csv = Papa.unparse(rows, {
    delimiter: ';',
    header: true,
  });

  // UTF-8 BOM for Excel
  return '\uFEFF' + csv;
}
