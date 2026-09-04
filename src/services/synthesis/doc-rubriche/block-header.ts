/**
 * Intestazione-blocco di un documento nella doc-sanitaria, dai suoi eventi:
 * data (unica, dominante ≥60%, intervallo, o precisione del rappresentativo),
 * struttura, tipo. Stessa regola usata per il prompt LLM (synthesis-prompts,
 * formatEventsByDocumentForPrompt) e per il renderer deterministico per
 * rubriche: una sola implementazione, due consumatori. Datazione e struttura
 * dai soli eventi CORRENTI (0034), fallback a tutti. Puro.
 */

import { formatEventDateByPrecision } from '@/lib/format';

export interface BlockDatingEvent {
  eventDate: string;
  datePrecision?: string | null;
  facility?: string | null;
  temporalScope?: string | null;
}

export interface BlockDating {
  /** ISO per l'ordinamento (data unica/dominante, inizio intervallo, o del rappresentativo). */
  sortIso: string;
  /** Etichetta italiana: "13.09.2025", "dal 13.09.2025 al 25.09.2025", "2019", "s.d.". */
  dateLabel: string;
  facility: string | null;
}

const isCurrent = (e: BlockDatingEvent): boolean => e.temporalScope !== 'retrospettivo' && e.temporalScope !== 'programmato';
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function describeDocumentBlock(events: ReadonlyArray<BlockDatingEvent>): BlockDating {
  const current = events.filter(isCurrent);
  const pool = current.length > 0 ? current : [...events];
  const rep = pool.find((e) => e.facility) ?? pool[0];
  const datedIso = pool
    .filter((e) => e.datePrecision == null || e.datePrecision === 'giorno')
    .map((e) => e.eventDate)
    .filter((d): d is string => !!d && d !== '1900-01-01' && ISO_DAY_RE.test(d));
  const dayIso = Array.from(new Set(datedIso)).sort();
  const counts = new Map<string, number>();
  for (const d of datedIso) counts.set(d, (counts.get(d) ?? 0) + 1);
  const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (dayIso.length === 1) return { sortIso: dayIso[0]!, dateLabel: formatEventDateByPrecision(dayIso[0]!, 'giorno'), facility: rep?.facility ?? null };
  if (dayIso.length > 1 && dominant && dominant[1] / datedIso.length >= 0.6) {
    return { sortIso: dominant[0], dateLabel: formatEventDateByPrecision(dominant[0], 'giorno'), facility: rep?.facility ?? null };
  }
  if (dayIso.length > 1) {
    return { sortIso: dayIso[0]!, dateLabel: `dal ${formatEventDateByPrecision(dayIso[0]!, 'giorno')} al ${formatEventDateByPrecision(dayIso[dayIso.length - 1]!, 'giorno')}`, facility: rep?.facility ?? null };
  }
  if (!rep || !rep.eventDate || rep.eventDate.startsWith('1900-01-01')) return { sortIso: '9999-12-31', dateLabel: 's.d.', facility: rep?.facility ?? null };
  return { sortIso: rep.eventDate, dateLabel: formatEventDateByPrecision(rep.eventDate, rep.datePrecision ?? undefined), facility: rep.facility ?? null };
}

/** "**Tipo, struttura, in data DATA:**" (formato gold Antoniazzi). */
export function buildBlockHeader(label: string, facility: string | null, dateLabel: string): string {
  const fac = facility ? `, ${facility}` : '';
  const dateClause = dateLabel === 's.d.' || dateLabel.startsWith('dal ') ? dateLabel : `in data ${dateLabel}`;
  return `**${label}${fac}, ${dateClause}:**`;
}
