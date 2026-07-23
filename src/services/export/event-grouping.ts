/**
 * Raggruppamento della cronistoria PER DOCUMENTO (feedback beta 2026-07-20:
 * "non mette i dati di un documento in un unico riferimento ma divide in tante
 * piccole intestazioni"). Un verbale di PS estratto in 6 eventi resta UN blocco
 * con le sue sotto-voci, come nei documenti del concorrente.
 *
 * L'etichetta del blocco usa il TIPO documento classificato e l'intervallo
 * date, MAI il nome file (può contenere il nome del paziente → deve restare
 * fuori dagli export, incluso l'anonimizzato).
 *
 * Puro e testabile; eventi senza document_id finiscono in un gruppo residuo
 * che i renderer trattano come lista piatta (comportamento storico).
 */

import { getDocumentTypeLabel } from '@/lib/document-type-labels';
import { formatDate } from '@/lib/format';

const SENTINEL_DATE = '1900-01-01';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface GroupableEvent {
  document_id?: string | null;
  event_date: string;
  facility?: string | null;
}

export interface DocumentGroup<T> {
  /** '' per il gruppo residuo (eventi senza document_id). */
  documentId: string;
  events: T[];
  /** Intestazione pronta per il renderer ('' per il gruppo residuo). */
  heading: string;
}

/** Date valide (ISO, non sentinella) di un gruppo, ordinate. */
function validDates(events: ReadonlyArray<GroupableEvent>): string[] {
  return events
    .map((e) => e.event_date)
    .filter((d) => !!d && d !== SENTINEL_DATE && ISO_DATE_RE.test(d))
    .sort();
}

/** Intestazione-blocco: "Tipo documento — Struttura — in data X / dal X al Y". */
export function buildDocumentGroupHeading(
  documentType: string | null | undefined,
  events: ReadonlyArray<GroupableEvent>,
): string {
  const label = getDocumentTypeLabel(documentType ?? 'altro');
  const facility = events.find((e) => e.facility)?.facility;
  const dates = validDates(events);
  const dateClause = dates.length === 0
    ? 's.d.'
    : dates[0] === dates[dates.length - 1]
      ? `in data ${formatDate(dates[0])}`
      : `dal ${formatDate(dates[0])} al ${formatDate(dates[dates.length - 1])}`;
  return [label, facility, dateClause].filter(Boolean).join(' — ');
}

/**
 * Raggruppa gli eventi per documento, ordinando i gruppi per data più antica
 * (cronologia a livello di documento, stile Docsy). L'ordine degli eventi
 * DENTRO il gruppo è quello di input (già cronologico).
 */
export function groupEventsByDocument<T extends GroupableEvent>(
  events: T[],
  documents?: ReadonlyArray<{ id: string; documentType?: string | null }>,
): Array<DocumentGroup<T>> {
  const typeByDoc = new Map((documents ?? []).map((d) => [d.id, d.documentType ?? null]));
  const byDoc = new Map<string, T[]>();
  for (const e of events) {
    const key = e.document_id ?? '';
    const arr = byDoc.get(key);
    if (arr) arr.push(e);
    else byDoc.set(key, [e]);
  }

  const earliest = (evs: T[]): string => {
    const dates = validDates(evs);
    return dates[0] ?? '9999-12-31';
  };

  return Array.from(byDoc.entries())
    .sort(([, a], [, b]) => earliest(a).localeCompare(earliest(b)))
    .map(([documentId, evs]) => ({
      documentId,
      events: evs,
      heading: documentId === '' ? '' : buildDocumentGroupHeading(typeByDoc.get(documentId), evs),
    }));
}
