/**
 * Deterministic renderer for the "Stima tabellare del danno biologico" block
 * (Sprint 4.3): exposes the TUN/Milano quantification engine inside the report.
 *
 * The block is embedded in the considerazioni_ml placeholder as a PARAMETERIZED
 * sentinel (`<!--MEDLAV:STIMA_DANNO:caseType-->`) and expanded at READ time from
 * the CURRENT events — same pattern as ITT_ITP — so the figures never drift from
 * the validated data. The caseType travels INSIDE the marker because the read
 * surfaces (UI viewer, HTML/DOCX export, shared link, validation) don't all know
 * it; the incident date is re-derived from the current events at every expansion.
 *
 * Pure + client-safe: no I/O, no LLM. The euro figures are a PROPOSAL computed
 * on a hypothetical percentage (midpoint of the indicative range for the case
 * type): the perito sets the real percentage and the official ministerial
 * tables prevail (disclaimer always appended).
 */
import { formatEuro } from '@/lib/format';
import type { CaseType } from '@/types';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { normalizeItalianDateToIso } from '@/lib/validators/date-format';
import { estimateBiologicalDamage } from './damage-estimator';
import type { DeterministicTableEvent } from './deterministic-tables';

/** Stable prefix of the parameterized marker (cheap `includes` detection). */
export const STIMA_DANNO_MARKER_PREFIX = '<!--MEDLAV:STIMA_DANNO';

/** Parameterized marker matcher — captures the embedded case type. */
const STIMA_DANNO_MARKER_RE = /<!--MEDLAV:STIMA_DANNO:([a-z0-9_]*)-->/g;

/**
 * Build the parameterized sentinel for a case type. Written into the
 * considerazioni_ml placeholder at generation time (buildPlaceholderContent),
 * expanded at read time by expandDeterministicBlocks.
 */
export function buildStimaDannoMarker(caseType: CaseType): string {
  return `${STIMA_DANNO_MARKER_PREFIX}:${caseType}-->`;
}

/** Shown when no indicative range exists for the embedded case type. */
export const STIMA_DANNO_EMPTY_FALLBACK =
  '_Stima tabellare non disponibile per questa tipologia di caso: il perito quantifica autonomamente sulle tabelle vigenti._';

const STIMA_DANNO_DISCLAIMER =
  '*Avvertenza:* la presente è una proposta di calcolo automatica, basata su una percentuale IPOTETICA '
  + '(punto medio del range indicativo per la tipologia di caso) e, ove l\'età non sia indicata, su coefficienti standard. '
  + 'Non sostituisce la valutazione medico-legale: la percentuale di invalidità permanente è determinata esclusivamente dal perito, '
  + 'che verifica l\'importo sulla tabella ministeriale vigente — la quale fa fede — e motiva la scelta tabellare.';

const SENTINEL_DATE = '1900-01-01';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Escape pipes/newlines so a value can never break the Markdown table. */
function cell(value: string): string {
  const v = value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
  return v || '—';
}

/** Italian euro formatting, deterministic. */

/** Earliest real ISO date among the events (sentinel/malformed excluded). */
function earliestValidDate(events: ReadonlyArray<{ event_date: string }>): string | undefined {
  const dates = events
    .map((e) => e.event_date)
    .filter((d) => !!d && d !== SENTINEL_DATE && ISO_DATE_RE.test(d))
    .sort();
  return dates.length > 0 ? dates[0] : undefined;
}

/**
 * Render the "stima tabellare del danno biologico" body: indicative range for
 * the case type, TUN lookup on the midpoint (amount + decree-referenced table),
 * Milano 2024 comparison for macropermanenti (≥10%), routing note (Cass.
 * 8630/2026 + staleness warning) and Balthazard note when multiple surgeries
 * suggest concurrent injuries. Returns '' when the case type has no indicative
 * range (caller uses STIMA_DANNO_EMPTY_FALLBACK).
 */
export function formatStimaDannoBlock(
  events: DeterministicTableEvent[],
  caseType: string,
  todayIso?: string,
  incidentDate?: string | null,
): string {
  // Data sinistro esplicita del perito (periziaMetadata.dataSinistro): gli
  // eventi ANTECEDENTI sono preesistenze — non devono né guidare la scelta
  // della tabella né gonfiare la stima (es. un intervento preesistente che
  // alza il range o innesca la nota Balthazard). Stesso filtro dei calcoli
  // deterministici (calculateMedicoLegalPeriods): un solo numero per fatto.
  const incidentIso = incidentDate ? normalizeItalianDateToIso(incidentDate) : null;
  const clinical = events
    .filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type))
    .filter((e) => !incidentIso || !ISO_DATE_RE.test(e.event_date) || e.event_date >= incidentIso);
  const calcEvents = clinical.map((e) => ({
    event_date: e.event_date,
    event_type: e.event_type,
    title: e.title,
    description: e.description,
  }));

  const estimate = estimateBiologicalDamage(
    calcEvents,
    caseType as CaseType,
    incidentIso ?? earliestValidDate(calcEvents),
    todayIso,
  );
  if (!estimate.estimatedRange || estimate.midpointPercentage === null || !estimate.lookupResult) {
    return '';
  }
  const lookup = estimate.lookupResult;

  const rows: string[] = [
    '| Voce | Valore |',
    '|---|---|',
    `| Range indicativo per la tipologia di caso | ${estimate.estimatedRange.min}-${estimate.estimatedRange.max}% |`,
    `| Percentuale ipotetica di calcolo (punto medio) | ${estimate.midpointPercentage}% |`,
    `| Tabella applicata | ${cell(lookup.tableUsed)} |`,
    `| Importo indicativo al punto medio | ${lookup.estimatedAmount !== null ? formatEuro(lookup.estimatedAmount) : '—'} |`,
    `| Dettaglio calcolo | ${cell(lookup.notes)} |`,
  ];
  if (estimate.milanoComparison && estimate.milanoComparison.estimatedAmount > 0) {
    const mc = estimate.milanoComparison;
    rows.push(
      `| Confronto ${cell(mc.tableReference)} | ${formatEuro(mc.estimatedAmount)} `
      + `(${mc.percentage}%, età standard ${mc.ageUsed}, demolt. ${mc.ageDemoltiplicator}) |`,
    );
  }

  const parts: string[] = [estimate.reasoning, '', rows.join('\n')];
  if (estimate.tableSelectionNote) {
    parts.push('', `*Criterio di selezione tabellare:* ${estimate.tableSelectionNote}`);
  }
  if (estimate.balthazardNote) {
    parts.push('', `*Nota lesioni plurime:* ${estimate.balthazardNote}`);
  }
  parts.push('', STIMA_DANNO_DISCLAIMER);
  return parts.join('\n');
}

/**
 * Replace every STIMA_DANNO sentinel in a report's markdown with the block
 * rendered from the CURRENT events (case type parsed from the marker itself).
 * Pure, idempotent, no-op when no marker is present. Called by
 * expandDeterministicBlocks so EVERY read surface expands it.
 */
export function expandStimaDannoMarkers(
  synthesis: string,
  events: DeterministicTableEvent[],
  incidentDate?: string | null,
): string {
  if (!synthesis.includes(STIMA_DANNO_MARKER_PREFIX)) return synthesis;
  return synthesis.replace(
    STIMA_DANNO_MARKER_RE,
    (_match: string, caseType: string) =>
      formatStimaDannoBlock(events, caseType, undefined, incidentDate) || STIMA_DANNO_EMPTY_FALLBACK,
  );
}