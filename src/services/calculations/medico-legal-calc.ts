import { formatDate } from '@/lib/format';
import type { CaseType } from '@/types';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { estimateBiologicalDamage } from './damage-estimator';

interface CalcEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
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
 * Calculate medico-legal periods from timeline events.
 * These are proposed values — the expert can modify them.
 */
export function calculateMedicoLegalPeriods(
  events: CalcEvent[],
  caseType?: CaseType,
): MedicoLegalCalculation[] {
  if (events.length === 0) return [];

  // Filter out non-clinical events (ticket SSN, avvisi pagamento, certificati
  // amministrativi). They distort the illness period and gap calculations
  // because their dates are administrative, not clinical. Trigger: Passaniti
  // regression — perito Lavini found ITT/ITP being skewed by SSN cost notices
  // dated weeks after the actual last clinical event.
  events = events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type));
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
  const results: MedicoLegalCalculation[] = [];
  const admissions = events.filter((e) => e.event_type === 'ricovero');

  for (const admission of admissions) {
    // Find discharge for this admission (next ricovero-type event with "dimissione" or lettera dimissione)
    const admissionDate = admission.event_date;
    const discharge = events.find(
      (e) =>
        e.event_date >= admissionDate &&
        e.event_date !== admissionDate &&
        (e.description.toLowerCase().includes('dimission') ||
         e.title.toLowerCase().includes('dimission')),
    );

    if (discharge) {
      const days = daysDiff(admissionDate, discharge.event_date);
      results.push({
        label: 'Giorni di ricovero',
        value: `${days} giorni`,
        days,
        startDate: admissionDate,
        endDate: discharge.event_date,
        notes: `Dal ricovero del ${formatDate(admissionDate)} alla dimissione del ${formatDate(discharge.event_date)}`,
      });
    }
  }

  return results;
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

  // Find key milestones
  const admissions = events.filter((e) => e.event_type === 'ricovero');
  const discharges = events.filter((e) =>
    e.description.toLowerCase().includes('dimission') || e.title.toLowerCase().includes('dimission'),
  );
  const rehabEvents = events.filter((e) => {
    const text = `${e.title} ${e.description}`.toLowerCase();
    return text.includes('riabilitaz') || text.includes('fisioterapi') || text.includes('fkt') ||
      text.includes('fisiokinesiterapi') || text.includes('rieducazione');
  });
  const lastFollowUp = [...events]
    .reverse()
    .find((e) => e.event_type === 'follow-up' || e.event_type === 'visita');
  const immobilizationEvents = events.filter((e) => {
    const text = `${e.title} ${e.description}`.toLowerCase();
    return text.includes('tutore') || text.includes('gesso') || text.includes('immobilizzaz') ||
      text.includes('doccia gessata') || text.includes('stecca') || text.includes('palmarino');
  });

  // ITT (100%) — hospitalization + immobilization
  let ittDays = 0;
  let ittStart: string | null = null;
  let ittEnd: string | null = null;

  // Hospital days
  for (const admission of admissions) {
    const discharge = discharges.find((d) => d.event_date > admission.event_date);
    if (discharge) {
      ittDays += daysDiff(admission.event_date, discharge.event_date);
      if (!ittStart) ittStart = admission.event_date;
      ittEnd = discharge.event_date;
    }
  }

  // Add immobilization period if after hospital
  if (immobilizationEvents.length > 0) {
    const immobStart = ittEnd ?? immobilizationEvents[0].event_date;
    const immobEnd = immobilizationEvents[immobilizationEvents.length - 1].event_date;
    if (immobEnd > immobStart) {
      const immobDays = daysDiff(immobStart, immobEnd);
      ittDays += immobDays;
      if (!ittStart) ittStart = immobStart;
      ittEnd = immobEnd;
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
    notes: 'Stima basata su ricovero + immobilizzazione documentata. Il perito verifica e corregge.',
  });

  // ITP graduated periods
  const ittEndDate = ittEnd ?? ittStart;
  if (!ittEndDate || !lastFollowUp) {
    results.push({
      label: 'Invalidità Temporanea Parziale (ITP) graduata',
      value: 'Non calcolabile',
      days: null,
      startDate: null,
      endDate: null,
      notes: 'Dati insufficienti per stimare i periodi ITP. Il perito definisce manualmente.',
    });
    return results;
  }

  const totalRecoveryDays = daysDiff(ittEndDate, lastFollowUp.event_date);
  if (totalRecoveryDays <= 0) return results;

  // Detect rehabilitation start/end to split the recovery period
  const rehabStart = rehabEvents.length > 0 ? rehabEvents[0].event_date : null;
  const rehabEnd = rehabEvents.length > 0 ? rehabEvents[rehabEvents.length - 1].event_date : null;

  if (rehabStart && rehabEnd && rehabStart > ittEndDate) {
    // We have clear phases: post-immob → rehab → stabilization
    const itp75Days = daysDiff(ittEndDate, rehabStart);
    const itp50Days = daysDiff(rehabStart, rehabEnd);
    const itp25Days = daysDiff(rehabEnd, lastFollowUp.event_date);

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
        endDate: lastFollowUp.event_date,
        notes: 'Dalla fine riabilitazione alla stabilizzazione clinica.',
      });
    }
  } else {
    // No clear rehab phase — divide recovery into thirds as estimate
    const third = Math.round(totalRecoveryDays / 3);
    const addDays = (base: string, n: number): string => {
      const d = new Date(base);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    const phase1End = addDays(ittEndDate, third);
    const phase2End = addDays(ittEndDate, third * 2);

    results.push({
      label: 'ITP al 75%',
      value: `${third} giorni (stima)`,
      days: third,
      startDate: ittEndDate,
      endDate: phase1End,
      notes: 'Stima: primo terzo del periodo di recupero. Il perito deve verificare.',
    });
    results.push({
      label: 'ITP al 50%',
      value: `${third} giorni (stima)`,
      days: third,
      startDate: phase1End,
      endDate: phase2End,
      notes: 'Stima: secondo terzo del periodo di recupero. Il perito deve verificare.',
    });
    results.push({
      label: 'ITP al 25%',
      value: `${totalRecoveryDays - third * 2} giorni (stima)`,
      days: totalRecoveryDays - third * 2,
      startDate: phase2End,
      endDate: lastFollowUp.event_date,
      notes: 'Stima: ultimo terzo del periodo di recupero. Il perito deve verificare.',
    });
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

