/**
 * Shared formatting utilities used across the application.
 */
import { FileText, Image, FileSpreadsheet, File } from 'lucide-react';

/**
 * Format ISO date string (YYYY-MM-DD) to Italian medical-legal format (DD.MM.YYYY).
 * Returns the original string if parsing fails.
 */
export function formatDate(isoDate: string): string {
  if (!isoDate || isoDate === '') return 'Data non disponibile';
  if (isoDate === '1900-01-01') return 'Data non documentata';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
}

/**
 * Formatta una data ISO rispettando la PRECISIONE estratta, così non si stampa MAI
 * un giorno/mese FABBRICATO quando è noto solo l'anno (es. "colecistectomia nel 2002",
 * estratto come 2002-01-01 con datePrecision="anno" → "2002", non "01.01.2002": era il
 * leak su Bigon, menzioni anamnestiche promosse ad atti datati 01.01.20XX).
 * SOLO la sentinella 1900-01-01 → "s.d." (mai 01.01.1900). NB: un evento davvero
 * senza data porta SEMPRE la sentinella; "sconosciuta" su una data VALIDA è una data
 * approssimata desunta dal contesto (inferMissingDates) e va mostrata, non soppressa —
 * sopprimerla scarterebbe una data reale (regressione vs il comportamento precedente).
 * Precisione assente/"giorno"/"sconosciuta" → DD.MM.YYYY (un vero 1° gennaio NON viene
 * ridotto: il gate è la PRECISIONE, mai il literal -01-01).
 */
export function formatEventDateByPrecision(isoDate: string, precision?: string): string {
  if (!isoDate || isoDate.startsWith('1900-01-01')) return 's.d.';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const [, year, month, day] = m;
  if (precision === 'anno') return year;
  if (precision === 'mese') return `${month}.${year}`;
  return `${day}.${month}.${year}`;
}

/**
 * Format file size in bytes to human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get appropriate lucide icon component for a file MIME type.
 */
export function getFileIcon(type: string) {
  if (type.startsWith('image/') || type.includes('image')) return Image;
  if (type.includes('pdf')) return FileText;
  if (type.includes('sheet') || type.includes('excel')) return FileSpreadsheet;
  return File;
}

/**
 * Format confidence percentage to human-readable label.
 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'Alta affidabilità';
  if (confidence >= 50) return 'Affidabilità media';
  return 'Bassa affidabilità';
}

/**
 * Get Tailwind color class for confidence percentage.
 */
export function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-600';
  if (confidence >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Safely parse JSON string, returning fallback on failure.
 */
export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Euro IT deterministico e indipendente dal locale di sistema: "7.225,50 €".
 * NON usa Intl.NumberFormat perché i dati ICU variano fra macchine (il runner
 * CI formattava senza separatore delle migliaia → output del report diverso
 * fra ambienti, inaccettabile per un documento depositabile).
 */
export function formatEuro(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const [int, dec] = Math.abs(amount).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${dec} €`;
}
