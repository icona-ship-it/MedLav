import Papa from 'papaparse';

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

const sourceLabels: Record<string, string> = {
  cartella_clinica: 'Cartella Clinica',
  referto_controllo: 'Referto Controllo',
  esame_strumentale: 'Esame Strumentale',
  esame_ematochimico: 'Esami Ematochimici',
  altro: 'Altro',
};

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
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
