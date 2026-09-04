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
  /** Ambito temporale (migration 0034): assente/null = 'corrente' (righe legacy). */
  temporal_scope?: string | null;
}

export interface DocumentGroup<T> {
  /** '' per il gruppo residuo (eventi senza document_id). */
  documentId: string;
  /** TUTTI gli eventi del gruppo, nell'ordine di input (compatibilità). */
  events: T[];
  /** Ciò che accade nel documento: le voci principali del blocco. */
  current: T[];
  /** Riferito nel documento come già avvenuto (anamnesi/storia): sotto-elenco. */
  retrospective: T[];
  /** Previsto per il futuro (controlli programmati): sotto-elenco. */
  scheduled: T[];
  /** Intestazione pronta per il renderer ('' per il gruppo residuo). */
  heading: string;
}

/** Etichette dei sotto-elenchi, condivise da HTML/DOCX/UI. */
export const RETROSPECTIVE_SUBLIST_LABEL = 'Riferito nel documento (anamnesi / storia clinica)';
export const SCHEDULED_SUBLIST_LABEL = 'Programmato / previsto nel documento';

function isRetrospective(e: GroupableEvent): boolean {
  return e.temporal_scope === 'retrospettivo';
}
function isScheduled(e: GroupableEvent): boolean {
  return e.temporal_scope === 'programmato';
}

/** Date valide (ISO, non sentinella) di un gruppo, ordinate. */
function validDates(events: ReadonlyArray<GroupableEvent>): string[] {
  return events
    .map((e) => e.event_date)
    .filter((d) => !!d && d !== SENTINEL_DATE && ISO_DATE_RE.test(d))
    .sort();
}

/** Eventi che DATANO il documento: i 'corrente'. Se non ce ne sono (righe
 * legacy senza scope, documento fatto solo di menzioni), tutti gli eventi —
 * mai un'intestazione "s.d." su un documento che una data ce l'ha. */
function datingEvents<T extends GroupableEvent>(events: ReadonlyArray<T>): ReadonlyArray<T> {
  // A gradini, sui soli eventi con data valida: corrente → retrospettivo →
  // programmato. Un corrente senza data non svuota l'intestazione, e una data
  // PREVISTA non entra mai in un intervallo insieme a fatti riferiti.
  const hasDate = (e: T): boolean => validDates([e]).length === 1;
  const tiers: Array<ReadonlyArray<T>> = [
    events.filter((e) => !isRetrospective(e) && !isScheduled(e) && hasDate(e)),
    events.filter((e) => isRetrospective(e) && hasDate(e)),
    events.filter((e) => isScheduled(e) && hasDate(e)),
  ];
  return tiers.find((t) => t.length > 0) ?? events;
}

/** Intestazione-blocco: "Tipo documento — Struttura — in data X / dal X al Y".
 * Le date sono quelle degli eventi 'corrente' (feedback medici 2026-08-19: un
 * referto del 22.05 usciva "dal 27.02 al 18.06" per l'anamnesi e il follow-up). */
export function buildDocumentGroupHeading(
  documentType: string | null | undefined,
  events: ReadonlyArray<GroupableEvent>,
): string {
  const label = getDocumentTypeLabel(documentType ?? 'altro');
  const dating = datingEvents(events);
  const facility = dating.find((e) => e.facility)?.facility ?? events.find((e) => e.facility)?.facility;
  const dates = validDates(dating);
  const dateClause = dates.length === 0
    ? 's.d.'
    : dates[0] === dates[dates.length - 1]
      ? `in data ${formatDate(dates[0])}`
      : `dal ${formatDate(dates[0])} al ${formatDate(dates[dates.length - 1])}`;
  return [label, facility, dateClause].filter(Boolean).join(' — ');
}

/**
 * Raggruppa gli eventi per documento, ordinando i gruppi per data più antica
 * degli eventi 'corrente' (cronologia a livello di documento, stile Docsy: il
 * referto del 22.05 sta al 22.05, non al 27.02 della sua anamnesi). L'ordine
 * degli eventi DENTRO ogni partizione è quello di input (già cronologico).
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
    const dates = validDates(datingEvents(evs));
    return dates[0] ?? '9999-12-31';
  };

  return Array.from(byDoc.entries())
    .sort(([, a], [, b]) => earliest(a).localeCompare(earliest(b)))
    .map(([documentId, evs]) => ({
      documentId,
      events: evs,
      current: evs.filter((e) => !isRetrospective(e) && !isScheduled(e)),
      retrospective: evs.filter(isRetrospective),
      scheduled: evs.filter(isScheduled),
      heading: documentId === '' ? '' : buildDocumentGroupHeading(typeByDoc.get(documentId), evs),
    }));
}
