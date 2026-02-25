import { formatDate } from '@/lib/format';

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
}

/**
 * Calculate medico-legal periods from timeline events.
 * These are proposed values — the expert can modify them.
 */
export function calculateMedicoLegalPeriods(events: CalcEvent[]): MedicoLegalCalculation[] {
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

  // 5. ITT estimate
  calculations.push(calculateITT(events));

  // 6. ITP estimate
  calculations.push(calculateITP(events));

  return calculations.filter((c) => c.days !== null && c.days > 0);
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

function calculateITT(events: CalcEvent[]): MedicoLegalCalculation {
  // ITT = hospital days + immobilization periods
  const admissions = events.filter((e) => e.event_type === 'ricovero');
  let totalDays = 0;
  let startDate: string | null = null;
  let endDate: string | null = null;

  for (const admission of admissions) {
    const discharge = events.find(
      (e) => e.event_date > admission.event_date &&
        (e.description.toLowerCase().includes('dimission') || e.title.toLowerCase().includes('dimission')),
    );

    if (discharge) {
      const days = daysDiff(admission.event_date, discharge.event_date);
      totalDays += days;
      if (!startDate) startDate = admission.event_date;
      endDate = discharge.event_date;
    }
  }

  return {
    label: 'Invalidita Temporanea Totale (ITT) stimata',
    value: totalDays > 0 ? `${totalDays} giorni` : 'Non calcolabile',
    days: totalDays || null,
    startDate,
    endDate,
    notes: 'Stima basata sui periodi di ricovero. Il perito deve verificare e integrare con periodi di immobilizzazione.',
  };
}

function calculateITP(events: CalcEvent[]): MedicoLegalCalculation {
  // ITP = from end of ITT to last follow-up with improvement
  const lastDischarge = [...events]
    .reverse()
    .find((e) => e.description.toLowerCase().includes('dimission') || e.title.toLowerCase().includes('dimission'));

  const lastFollowUp = [...events]
    .reverse()
    .find((e) => e.event_type === 'follow-up' || (e.event_type === 'visita' && e.event_date > (lastDischarge?.event_date ?? '')));

  if (lastDischarge && lastFollowUp && lastFollowUp.event_date > lastDischarge.event_date) {
    const days = daysDiff(lastDischarge.event_date, lastFollowUp.event_date);
    return {
      label: 'Invalidita Temporanea Parziale (ITP) stimata',
      value: `${days} giorni`,
      days,
      startDate: lastDischarge.event_date,
      endDate: lastFollowUp.event_date,
      notes: 'Stima dal termine del ricovero all\'ultimo follow-up. Il perito deve definire il grado di ITP.',
    };
  }

  return {
    label: 'Invalidita Temporanea Parziale (ITP) stimata',
    value: 'Non calcolabile',
    days: null,
    startDate: null,
    endDate: null,
    notes: 'Dati insufficienti per stimare l\'ITP. Il perito deve definire il periodo manualmente.',
  };
}

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

