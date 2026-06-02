import { formatDate } from '@/lib/format';
import type { CaseType } from '@/types';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { estimateBiologicalDamage } from './damage-estimator';
import { numberToItalianWords } from '@/lib/number-to-words-it';

interface CalcEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
}

/** Sentinel date written by the extractor when no real date can be inferred. */
const SENTINEL_EVENT_DATE = '1900-01-01';

/** Well-formed ISO date YYYY-MM-DD. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keep only clinical events with a real, well-formed date, in chronological
 * order. The whole module assumes chronological input (events[0] = first,
 * events[last] = last; the recovery endpoint is the last visita/follow-up after
 * the acute phase). The pipeline feeds
 * consolidated/sorted events, but the UI path (calculateITTITP) passes RAW DB
 * rows — without this, unsorted rows produced ITP periods running BACKWARD
 * (endDate < startDate) and totals anchored on the wrong events.
 */
function clinicalSortedByDate(events: CalcEvent[]): CalcEvent[] {
  return events
    .filter(
      (e) =>
        !NON_CLINICAL_EVENT_TYPES.has(e.event_type) &&
        e.event_date !== SENTINEL_EVENT_DATE &&
        ISO_DATE_RE.test(e.event_date),
    )
    .slice()
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
}

/** True for an event that marks the END of a hospital stay. Matches Italian
 * variants (dimissione/dimesso/fine ricovero) and English ("discharge"); the
 * old code matched only "dimission" → a discharge labeled "Relazione di fine
 * ricovero" was missed and the hospital stay vanished from ITT. */
function isDischargeEvent(e: CalcEvent): boolean {
  const text = `${e.title} ${e.description}`.toLowerCase();
  return (
    text.includes('dimiss') ||
    text.includes('dimess') ||
    text.includes('fine ricovero') ||
    text.includes('fine del ricovero') ||
    text.includes('discharge')
  );
}

/**
 * Pair each admission with at most ONE discharge (the earliest unused discharge
 * after it). Prevents the double-count bug: with 2 admissions and 1 discharge,
 * the old `discharges.find()` returned the SAME discharge for both admissions,
 * summing overlapping periods and inflating ITT.
 */
function pairAdmissionsToDischarges(
  admissions: CalcEvent[],
  discharges: CalcEvent[],
): Array<{ admission: CalcEvent; discharge: CalcEvent }> {
  const pairs: Array<{ admission: CalcEvent; discharge: CalcEvent }> = [];
  const used = new Set<number>();
  for (const admission of admissions) {
    for (let i = 0; i < discharges.length; i++) {
      if (used.has(i)) continue;
      if (discharges[i].event_date > admission.event_date) {
        used.add(i);
        pairs.push({ admission, discharge: discharges[i] });
        break;
      }
    }
  }
  return pairs;
}

/** Add N days to an ISO date, UTC-safe (avoids local-timezone off-by-one from
 * mixing UTC parsing with local getDate/setDate). */
function addDaysIso(base: string, n: number): string {
  const ms = Date.parse(`${base}T00:00:00Z`);
  return new Date(ms + n * 86_400_000).toISOString().slice(0, 10);
}

export interface MedicoLegalCalculation {
  label: string;
  value: string;
  days: number | null;
  startDate: string | null;
  endDate: string | null;
  notes: string;
  tableReference?: string;
}

/**
 * A2 (Lavini): a single graduated temporary-disability segment.
 * ITT = 100%, ITP = 75% / 50% / 25%. These are PROPOSALS — the perito sets the
 * final values. `estimated` marks segments derived heuristically (recovery
 * period split into thirds when no explicit rehab phase is documented).
 */
export interface ITPSegment {
  label: string;
  percentage: 100 | 75 | 50 | 25;
  days: number;
  startDate: string | null;
  endDate: string | null;
  estimated: boolean;
}

/** Map an ITT/ITP calculation row to a typed segment, or null if it isn't one
 * (or is a "Non calcolabile" row with no days). */
function calculationRowToSegment(c: MedicoLegalCalculation): ITPSegment | null {
  if (c.days === null || c.days <= 0) return null;
  const label = c.label.toLowerCase();
  let percentage: ITPSegment['percentage'] | null = null;
  if (label.includes('itt') || label.includes('100')) percentage = 100;
  else if (label.includes('75')) percentage = 75;
  else if (label.includes('50')) percentage = 50;
  else if (label.includes('25')) percentage = 25;
  if (percentage === null) return null;

  const estimated = /\(stima\)/i.test(c.value) || /stima/i.test(c.notes);
  return {
    label: c.label,
    percentage,
    days: c.days,
    startDate: c.startDate,
    endDate: c.endDate,
    estimated,
  };
}

/** Extract the graduated ITT/ITP segments from a set of calculation rows. */
export function calculationsToITTITPSegments(
  calculations: MedicoLegalCalculation[],
): ITPSegment[] {
  return calculations
    .map(calculationRowToSegment)
    .filter((s): s is ITPSegment => s !== null);
}

/**
 * A2: compute the graduated ITT/ITP segments directly from timeline events.
 * Returns a typed, ordered array (ITT first, then ITP 75 → 50 → 25). Pure and
 * client-safe — also used by the UI summary table in events-tab.
 */
export function calculateITTITP(events: CalcEvent[]): ITPSegment[] {
  // Drop non-clinical/sentinel/malformed events AND sort chronologically. The UI
  // path (itt-itp-summary.tsx) passes RAW DB rows: undated events carry the
  // sentinel '1900-01-01' (→ multi-decade rows) and rows are not guaranteed
  // sorted (→ ITP periods running backward). clinicalSortedByDate fixes both.
  const clinical = clinicalSortedByDate(events);
  if (clinical.length === 0) return [];
  return calculationsToITTITPSegments(calculateGraduatedITTITP(clinical));
}

/**
 * Render graduated ITT/ITP segments as a Markdown pipe table for the report.
 * The export pipeline (HTML/DOCX) renders Markdown tables natively. Returns ''
 * when there are no concrete segments.
 */
export function formatITTITPTable(segments: ITPSegment[]): string {
  if (segments.length === 0) return '';
  const rows = segments.map((s) => {
    // Escape pipes so a label can never break the Markdown table columns.
    const label = s.label.replace(/\|/g, '\\|');
    const dal = s.startDate ? formatDate(s.startDate) : '—';
    const al = s.endDate ? formatDate(s.endDate) : '—';
    const stima = s.estimated ? ' *(stima)*' : '';
    // Notazione formale cifra + lettere (benchmark: "giorni 90 (novanta)", "75% (settantacinque per cento)").
    const giorni = `${s.days} (${numberToItalianWords(s.days)})`;
    const invalidita = `${s.percentage}% (${numberToItalianWords(s.percentage)} per cento)`;
    return `| ${label} | ${dal} | ${al} | ${giorni} | ${invalidita}${stima} |`;
  });
  const totalDays = segments.reduce((sum, s) => sum + s.days, 0);
  return [
    '| Periodo | Dal | Al | Giorni | Invalidità |',
    '|---|---|---|---|---|',
    ...rows,
    `| **Totale giorni** | | | **${totalDays} (${numberToItalianWords(totalDays)})** | |`,
  ].join('\n');
}

/**
 * Calculate medico-legal periods from timeline events.
 * These are proposed values — the expert can modify them.
 */
export function calculateMedicoLegalPeriods(
  events: CalcEvent[],
  caseType?: CaseType,
): MedicoLegalCalculation[] {
  if (events.length === 0) return [];

  // Filter out non-clinical events (ticket SSN, avvisi pagamento, certificati
  // amministrativi) AND sentinel/malformed dates, then sort chronologically.
  // Non-clinical events distort periods (Passaniti regression: SSN cost notices
  // dated weeks after the last clinical event); sentinel dates would anchor the
  // total-illness period in 1900; sorting guarantees first/last are correct.
  events = clinicalSortedByDate(events);
  if (events.length === 0) return [];

  const calculations: MedicoLegalCalculation[] = [];

  // 1. Hospital days (ricovero → dimissione)
  calculations.push(...calculateHospitalDays(events));

  // 2. Total illness period (first event → last event)
  calculations.push(calculateTotalIllnessPeriod(events));

  // 3. Time between surgeries
  calculations.push(...calculateInterSurgeryIntervals(events));

  // 4. Diagnosis → Treatment time
  calculations.push(...calculateDiagnosisToTreatment(events));

  // 5. ITT/ITP graduated estimate (75%, 50%, 25%)
  calculations.push(...calculateGraduatedITTITP(events));

  // 7. Biological damage estimate with table reference
  if (caseType) {
    // Extract earliest event date as incident date approximation
    const incidentDate = extractEarliestEventDate(events);
    const damageEstimate = estimateBiologicalDamage(events, caseType, incidentDate);
    if (damageEstimate.lookupResult && damageEstimate.estimatedRange) {
      const lr = damageEstimate.lookupResult;
      calculations.push({
        label: 'Stima danno biologico (indicativa)',
        value: lr.estimatedAmount
          ? `${damageEstimate.estimatedRange.min}-${damageEstimate.estimatedRange.max}% (€${lr.estimatedAmount.toLocaleString('it-IT')} al punto medio ${damageEstimate.midpointPercentage}%)`
          : `${damageEstimate.estimatedRange.min}-${damageEstimate.estimatedRange.max}%`,
        days: null,
        startDate: null,
        endDate: null,
        notes: `${damageEstimate.reasoning} Confidenza: ${lr.confidence}.`,
        tableReference: lr.tableUsed,
      });

      // 7a. Milano comparison for macropermanenti
      if (damageEstimate.milanoComparison && damageEstimate.milanoComparison.estimatedAmount > 0) {
        const mc = damageEstimate.milanoComparison;
        calculations.push({
          label: 'Confronto Tabelle Milano 2024 (indicativo)',
          value: `€${mc.estimatedAmount.toLocaleString('it-IT')} (${mc.percentage}%, eta ${mc.ageUsed}, demolt. ${mc.ageDemoltiplicator})`,
          days: null,
          startDate: null,
          endDate: null,
          notes: `${mc.notes} Valore per punto: €${mc.perPointValue.toLocaleString('it-IT')}.`,
          tableReference: mc.tableReference,
        });
      }

      // 7b. Balthazard note for concurrent injuries
      if (damageEstimate.balthazardNote) {
        calculations.push({
          label: 'Nota: formula di Balthazard',
          value: 'Valutare concorso di lesioni',
          days: null,
          startDate: null,
          endDate: null,
          notes: damageEstimate.balthazardNote,
          tableReference: 'Formula di Balthazard',
        });
      }

      // 7c. Table selection note
      if (damageEstimate.tableSelectionNote) {
        calculations.push({
          label: 'Nota: selezione tabella',
          value: incidentDate
            ? `Data sinistro: ${incidentDate}`
            : 'Data sinistro non disponibile',
          days: null,
          startDate: null,
          endDate: null,
          notes: damageEstimate.tableSelectionNote,
          tableReference: 'Criterio temporale DPR 12/2025',
        });
      }
    }
  }

  return calculations.filter((c) => c.days !== null || c.tableReference != null);
}

function calculateHospitalDays(events: CalcEvent[]): MedicoLegalCalculation[] {
  // Admissions exclude rows that are themselves discharges (a "Dimissione" row
  // sometimes carries eventType 'ricovero'). Each discharge is paired once.
  const admissions = events.filter((e) => e.event_type === 'ricovero' && !isDischargeEvent(e));
  const discharges = events.filter(isDischargeEvent);

  return pairAdmissionsToDischarges(admissions, discharges).map(({ admission, discharge }) => {
    const days = daysDiff(admission.event_date, discharge.event_date);
    return {
      label: 'Giorni di ricovero',
      value: `${days} giorni`,
      days,
      startDate: admission.event_date,
      endDate: discharge.event_date,
      notes: `Dal ricovero del ${formatDate(admission.event_date)} alla dimissione del ${formatDate(discharge.event_date)}`,
    };
  });
}

function calculateTotalIllnessPeriod(events: CalcEvent[]): MedicoLegalCalculation {
  const firstDate = events[0].event_date;
  const lastDate = events[events.length - 1].event_date;
  const days = daysDiff(firstDate, lastDate);

  return {
    label: 'Periodo totale malattia',
    value: `${days} giorni`,
    days,
    startDate: firstDate,
    endDate: lastDate,
    notes: `Dal primo evento (${formatDate(firstDate)}) all'ultimo evento documentato (${formatDate(lastDate)})`,
  };
}

function calculateInterSurgeryIntervals(events: CalcEvent[]): MedicoLegalCalculation[] {
  const results: MedicoLegalCalculation[] = [];
  const surgeries = events.filter((e) => e.event_type === 'intervento');

  for (let i = 0; i < surgeries.length - 1; i++) {
    const days = daysDiff(surgeries[i].event_date, surgeries[i + 1].event_date);
    results.push({
      label: `Intervallo tra interventi (${i + 1}° → ${i + 2}°)`,
      value: `${days} giorni`,
      days,
      startDate: surgeries[i].event_date,
      endDate: surgeries[i + 1].event_date,
      notes: `Da "${surgeries[i].title}" a "${surgeries[i + 1].title}"`,
    });
  }

  return results;
}

function calculateDiagnosisToTreatment(events: CalcEvent[]): MedicoLegalCalculation[] {
  const results: MedicoLegalCalculation[] = [];
  const diagnoses = events.filter((e) => e.event_type === 'diagnosi');
  const treatments = events.filter((e) => ['intervento', 'terapia'].includes(e.event_type));

  for (const diagnosis of diagnoses) {
    const nextTreatment = treatments.find((t) => t.event_date >= diagnosis.event_date);

    if (nextTreatment) {
      const days = daysDiff(diagnosis.event_date, nextTreatment.event_date);
      if (days > 0) {
        results.push({
          label: 'Tempo diagnosi → trattamento',
          value: `${days} giorni`,
          days,
          startDate: diagnosis.event_date,
          endDate: nextTreatment.event_date,
          notes: `Da diagnosi "${diagnosis.title}" a "${nextTreatment.title}"`,
        });
      }
    }
  }

  return results;
}

/**
 * Calculate graduated ITT/ITP periods following Italian medico-legal convention:
 * - ITT (100%): hospitalization + immobilization periods
 * - ITP 75%: from end of immobilization to start of rehabilitation
 * - ITP 50%: rehabilitation period
 * - ITP 25%: from end of rehabilitation to clinical stabilization
 *
 * These are proposals — the expert determines final percentages.
 */
function calculateGraduatedITTITP(events: CalcEvent[]): MedicoLegalCalculation[] {
  const results: MedicoLegalCalculation[] = [];

  // Find key milestones. Events are pre-sorted chronologically by the caller.
  const admissions = events.filter((e) => e.event_type === 'ricovero' && !isDischargeEvent(e));
  const discharges = events.filter(isDischargeEvent);
  const rehabEvents = events.filter((e) => {
    const text = `${e.title} ${e.description}`.toLowerCase();
    return text.includes('riabilitaz') || text.includes('fisioterapi') || text.includes('fkt') ||
      text.includes('fisiokinesiterapi') || text.includes('rieducazione') ||
      // English / variant phrasings (mixed-language reports)
      text.includes('physiotherap') || text.includes('physical therapy') || text.includes('rehabilitat');
  });
  const immobilizationEvents = events.filter((e) => {
    const text = `${e.title} ${e.description}`.toLowerCase();
    return text.includes('tutore') || text.includes('gesso') || text.includes('immobilizzaz') ||
      text.includes('doccia gessata') || text.includes('stecca') || text.includes('palmarino') ||
      // English / variant phrasings
      text.includes('brace') || text.includes('plaster cast') || text.includes('splint');
  });

  // ITT (100%) — hospitalization + immobilization. Pair each discharge once to
  // avoid double-counting overlapping admissions.
  let ittDays = 0;
  let ittStart: string | null = null;
  let ittEnd: string | null = null;

  // Hospital days
  for (const { admission, discharge } of pairAdmissionsToDischarges(admissions, discharges)) {
    ittDays += daysDiff(admission.event_date, discharge.event_date);
    if (!ittStart) ittStart = admission.event_date;
    ittEnd = discharge.event_date;
  }

  // Add immobilization period if after hospital. NOTE: this is classified as
  // ITT 100% and bounded by the LAST immobilization mention — a late incidental
  // mention ("rimosso il tutore" at a follow-up) can extend the window. We make
  // that explicit in the note so the perito can verify/reclassify (it may be ITP).
  let immobNote = '';
  if (immobilizationEvents.length > 0) {
    const immobStart = ittEnd ?? immobilizationEvents[0].event_date;
    const immobEnd = immobilizationEvents[immobilizationEvents.length - 1].event_date;
    if (immobEnd > immobStart) {
      const immobDays = daysDiff(immobStart, immobEnd);
      ittDays += immobDays;
      if (!ittStart) ittStart = immobStart;
      ittEnd = immobEnd;
      immobNote = ` Include un periodo di immobilizzazione documentata dal ${formatDate(immobStart)} al ${formatDate(immobEnd)} (${immobDays} gg): verificare se classificabile come ITT o ITP e se la data di rimozione è corretta.`;
    }
  }

  // If no hospital/immobilization, use first event as trauma date
  if (!ittStart && events.length > 0) {
    ittStart = events[0].event_date;
  }

  results.push({
    label: 'Invalidità Temporanea Totale (ITT) al 100%',
    value: ittDays > 0 ? `${ittDays} giorni` : 'Non calcolabile',
    days: ittDays || null,
    startDate: ittStart,
    endDate: ittEnd,
    notes: `Stima basata su ricovero + immobilizzazione documentata. Il perito verifica e corregge.${immobNote}`,
  });

  // ITP graduated periods. The recovery endpoint must be a follow-up/visita that
  // occurs AFTER the ITT end — otherwise the recovery window would run backward
  // (a pre-ricovero visit must not close the recovery period).
  const ittEndDate = ittEnd ?? ittStart;
  const recoveryCandidates = ittEndDate
    ? events.filter(
        (e) => (e.event_type === 'follow-up' || e.event_type === 'visita') && e.event_date > ittEndDate,
      )
    : [];
  const recoveryEnd = recoveryCandidates.length > 0 ? recoveryCandidates[recoveryCandidates.length - 1] : null;
  if (!ittEndDate || !recoveryEnd) {
    results.push({
      label: 'Invalidità Temporanea Parziale (ITP) graduata',
      value: 'Non calcolabile',
      days: null,
      startDate: null,
      endDate: null,
      notes: 'Dati insufficienti per stimare i periodi ITP (nessuna visita di controllo successiva alla fase acuta). Il perito definisce manualmente.',
    });
    return results;
  }

  const totalRecoveryDays = daysDiff(ittEndDate, recoveryEnd.event_date);
  if (totalRecoveryDays <= 0) return results;

  // Detect rehabilitation start/end to split the recovery period
  const rehabStart = rehabEvents.length > 0 ? rehabEvents[0].event_date : null;
  const rehabEnd = rehabEvents.length > 0 ? rehabEvents[rehabEvents.length - 1].event_date : null;

  if (rehabStart && rehabEnd && rehabStart > ittEndDate) {
    // We have clear phases: post-immob → rehab → stabilization
    const itp75Days = daysDiff(ittEndDate, rehabStart);
    const itp50Days = daysDiff(rehabStart, rehabEnd);
    const itp25Days = daysDiff(rehabEnd, recoveryEnd.event_date);

    if (itp75Days > 0) {
      results.push({
        label: 'ITP al 75%',
        value: `${itp75Days} giorni`,
        days: itp75Days,
        startDate: ittEndDate,
        endDate: rehabStart,
        notes: 'Dalla fine immobilizzazione all\'inizio riabilitazione.',
      });
    }
    if (itp50Days > 0) {
      results.push({
        label: 'ITP al 50%',
        value: `${itp50Days} giorni`,
        days: itp50Days,
        startDate: rehabStart,
        endDate: rehabEnd,
        notes: 'Periodo riabilitativo.',
      });
    }
    if (itp25Days > 0) {
      results.push({
        label: 'ITP al 25%',
        value: `${itp25Days} giorni`,
        days: itp25Days,
        startDate: rehabEnd,
        endDate: recoveryEnd.event_date,
        notes: 'Dalla fine riabilitazione alla stabilizzazione clinica.',
      });
    }
  } else {
    // No clear rehab phase — divide recovery into thirds as estimate.
    // Invariant: third + third + (total - 2*third) == total (holds for any rounding).
    const third = Math.round(totalRecoveryDays / 3);
    const phase1Days = third;
    const phase2Days = third;
    const phase3Days = totalRecoveryDays - third * 2;
    const phase1End = addDaysIso(ittEndDate, third);
    const phase2End = addDaysIso(ittEndDate, third * 2);

    // Guard each push on > 0 so tiny recovery windows don't emit "0 giorni" rows.
    if (phase1Days > 0) {
      results.push({
        label: 'ITP al 75%',
        value: `${phase1Days} giorni (stima)`,
        days: phase1Days,
        startDate: ittEndDate,
        endDate: phase1End,
        notes: 'Stima: primo terzo del periodo di recupero. Il perito deve verificare.',
      });
    }
    if (phase2Days > 0) {
      results.push({
        label: 'ITP al 50%',
        value: `${phase2Days} giorni (stima)`,
        days: phase2Days,
        startDate: phase1End,
        endDate: phase2End,
        notes: 'Stima: secondo terzo del periodo di recupero. Il perito deve verificare.',
      });
    }
    if (phase3Days > 0) {
      results.push({
        label: 'ITP al 25%',
        value: `${phase3Days} giorni (stima)`,
        days: phase3Days,
        startDate: phase2End,
        endDate: recoveryEnd.event_date,
        notes: 'Stima: ultimo terzo del periodo di recupero. Il perito deve verificare.',
      });
    }
  }

  return results;
}

/**
 * Extract the earliest event date from events as an approximation
 * of the incident date for table selection purposes.
 * Returns undefined if no valid dates are found.
 */
function extractEarliestEventDate(events: CalcEvent[]): string | undefined {
  if (events.length === 0) return undefined;

  const validDates = events
    .map((e) => e.event_date)
    .filter((d) => d && !isNaN(new Date(d).getTime()))
    .sort();

  return validDates.length > 0 ? validDates[0] : undefined;
}

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

