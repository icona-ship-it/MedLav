import type { AnomalyType, AnomalySeverity } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { formatDate } from '@/lib/format';

export interface DetectedAnomaly {
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  involvedEvents: Array<{
    eventId: string | null; // null before DB insert
    orderNumber: number;
    date: string;
    title: string;
  }>;
  suggestion: string;
}

// Thresholds in days (from REQUIREMENTS.md)
const THRESHOLDS = {
  RITARDO_DIAGNOSTICO: 30,
  GAP_POST_CHIRURGICO: 30,
  GAP_DOCUMENTALE_WARNING: 60,
  GAP_DOCUMENTALE_CRITICO: 180,
  DIAGNOSI_CONTRADDITTORIA: 90,
  TERAPIA_SENZA_FOLLOWUP: 14,
} as const;

/**
 * Detect all 7 types of medico-legal anomalies from consolidated events.
 * Uses algorithmic detection with configurable thresholds.
 */
export function detectAnomalies(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  if (events.length === 0) return [];

  const anomalies: DetectedAnomaly[] = [];

  anomalies.push(...detectRitardoDiagnostico(events));
  anomalies.push(...detectGapPostChirurgico(events));
  anomalies.push(...detectGapDocumentale(events));
  anomalies.push(...detectComplicanzaNonGestita(events));
  anomalies.push(...detectConsensoNonDocumentato(events));
  anomalies.push(...detectDiagnosiContraddittoria(events));
  anomalies.push(...detectTerapiaSenzaFollowup(events));

  return anomalies;
}

/**
 * Ritardo Diagnostico: >30 days between initial visit and diagnosis.
 */
function detectRitardoDiagnostico(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const visits = events.filter((e) => e.eventType === 'visita');
  const diagnoses = events.filter((e) => e.eventType === 'diagnosi');

  for (const visit of visits) {
    // Find the next diagnosis after this visit
    const nextDiagnosis = diagnoses.find(
      (d) => d.eventDate >= visit.eventDate,
    );

    if (nextDiagnosis) {
      const daysBetween = daysDiff(visit.eventDate, nextDiagnosis.eventDate);

      if (daysBetween > THRESHOLDS.RITARDO_DIAGNOSTICO) {
        anomalies.push({
          anomalyType: 'ritardo_diagnostico',
          severity: daysBetween > 90 ? 'critica' : daysBetween > 60 ? 'alta' : 'media',
          description: `Ritardo di ${daysBetween} giorni tra la visita del ${formatDate(visit.eventDate)} e la diagnosi del ${formatDate(nextDiagnosis.eventDate)}.`,
          involvedEvents: [
            makeEventRef(visit),
            makeEventRef(nextDiagnosis),
          ],
          suggestion: `Verificare se il ritardo diagnostico di ${daysBetween} giorni ha influito sulla prognosi del paziente. Considerare se erano indicati esami diagnostici intermedi.`,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Gap Post-Chirurgico: >30 days without follow-up after surgery.
 */
function detectGapPostChirurgico(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const surgeries = events.filter((e) => e.eventType === 'intervento');

  for (const surgery of surgeries) {
    // Find the first follow-up event after surgery
    const followUp = events.find(
      (e) =>
        e.eventDate > surgery.eventDate &&
        ['follow-up', 'visita', 'esame'].includes(e.eventType),
    );

    if (!followUp) {
      anomalies.push({
        anomalyType: 'gap_post_chirurgico',
        severity: 'alta',
        description: `Nessun follow-up documentato dopo l'intervento del ${formatDate(surgery.eventDate)}: "${surgery.title}".`,
        involvedEvents: [makeEventRef(surgery)],
        suggestion: 'Verificare se sono stati effettuati controlli post-operatori non documentati. La mancanza di follow-up potrebbe essere rilevante per la valutazione peritale.',
      });
    } else {
      const daysBetween = daysDiff(surgery.eventDate, followUp.eventDate);

      if (daysBetween > THRESHOLDS.GAP_POST_CHIRURGICO) {
        anomalies.push({
          anomalyType: 'gap_post_chirurgico',
          severity: daysBetween > 90 ? 'critica' : daysBetween > 60 ? 'alta' : 'media',
          description: `Gap di ${daysBetween} giorni senza follow-up dopo l'intervento del ${formatDate(surgery.eventDate)}. Primo controllo documentato: ${formatDate(followUp.eventDate)}.`,
          involvedEvents: [
            makeEventRef(surgery),
            makeEventRef(followUp),
          ],
          suggestion: `Il periodo di ${daysBetween} giorni senza controllo post-operatorio supera le buone pratiche cliniche. Verificare se erano previsti controlli intermedi.`,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Gap Documentale: periods >60 days without any documentation.
 */
function detectGapDocumentale(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    const daysBetween = daysDiff(current.eventDate, next.eventDate);

    if (daysBetween > THRESHOLDS.GAP_DOCUMENTALE_WARNING) {
      const isCritical = daysBetween > THRESHOLDS.GAP_DOCUMENTALE_CRITICO;

      anomalies.push({
        anomalyType: 'gap_documentale',
        severity: isCritical ? 'critica' : daysBetween > 120 ? 'alta' : 'media',
        description: `Gap documentale di ${daysBetween} giorni tra il ${formatDate(current.eventDate)} e il ${formatDate(next.eventDate)}.${isCritical ? ' PERIODO CRITICO: oltre 6 mesi senza documentazione.' : ''}`,
        involvedEvents: [
          makeEventRef(current),
          makeEventRef(next),
        ],
        suggestion: `Richiedere eventuale documentazione mancante per il periodo ${formatDate(current.eventDate)} - ${formatDate(next.eventDate)}. Verificare se il paziente ha effettuato visite o esami in altre strutture.`,
      });
    }
  }

  return anomalies;
}

/**
 * Complicanza Non Gestita: complications without documented treatment.
 */
function detectComplicanzaNonGestita(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const complications = events.filter((e) => e.eventType === 'complicanza');

  for (const complication of complications) {
    // Look for treatment events within 7 days after the complication
    const treatment = events.find(
      (e) =>
        e.eventDate >= complication.eventDate &&
        daysDiff(complication.eventDate, e.eventDate) <= 7 &&
        ['terapia', 'intervento'].includes(e.eventType) &&
        e.orderNumber > complication.orderNumber,
    );

    if (!treatment) {
      anomalies.push({
        anomalyType: 'complicanza_non_gestita',
        severity: 'alta',
        description: `Complicanza "${complication.title}" del ${formatDate(complication.eventDate)} senza trattamento documentato entro 7 giorni.`,
        involvedEvents: [makeEventRef(complication)],
        suggestion: 'Verificare se la complicanza e stata trattata ma non documentata, o se rappresenta una omissione terapeutica rilevante ai fini peritali.',
      });
    }
  }

  return anomalies;
}

/**
 * Consenso Non Documentato: missing informed consent for invasive procedures.
 */
function detectConsensoNonDocumentato(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const procedures = events.filter((e) => e.eventType === 'intervento');
  const consents = events.filter((e) => e.eventType === 'consenso');

  for (const procedure of procedures) {
    // Look for a consent within 30 days before the procedure
    const hasConsent = consents.some(
      (c) =>
        c.eventDate <= procedure.eventDate &&
        daysDiff(c.eventDate, procedure.eventDate) <= 30,
    );

    if (!hasConsent) {
      anomalies.push({
        anomalyType: 'consenso_non_documentato',
        severity: 'alta',
        description: `Consenso informato non documentato per l'intervento del ${formatDate(procedure.eventDate)}: "${procedure.title}".`,
        involvedEvents: [makeEventRef(procedure)],
        suggestion: 'Il consenso informato e obbligatorio per legge per ogni procedura invasiva. Verificare se e stato acquisito ma non incluso nella documentazione fornita.',
      });
    }
  }

  return anomalies;
}

/**
 * Diagnosi Contraddittoria: conflicting diagnoses within 90 days.
 */
function detectDiagnosiContraddittoria(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const eventsWithDiagnosis = events.filter((e) => e.diagnosis && e.diagnosis.length > 0);

  for (let i = 0; i < eventsWithDiagnosis.length; i++) {
    for (let j = i + 1; j < eventsWithDiagnosis.length; j++) {
      const a = eventsWithDiagnosis[i];
      const b = eventsWithDiagnosis[j];

      if (daysDiff(a.eventDate, b.eventDate) > THRESHOLDS.DIAGNOSI_CONTRADDITTORIA) {
        continue;
      }

      // Check if diagnoses are meaningfully different
      if (areDiagnosesContradictory(a.diagnosis!, b.diagnosis!)) {
        anomalies.push({
          anomalyType: 'diagnosi_contraddittoria',
          severity: 'media',
          description: `Diagnosi potenzialmente contraddittorie entro ${daysDiff(a.eventDate, b.eventDate)} giorni: "${a.diagnosis}" (${formatDate(a.eventDate)}) vs "${b.diagnosis}" (${formatDate(b.eventDate)}).`,
          involvedEvents: [
            makeEventRef(a),
            makeEventRef(b),
          ],
          suggestion: 'Verificare se si tratta di un aggiornamento diagnostico legittimo o di una reale contraddizione tra le fonti.',
        });
      }
    }
  }

  return anomalies;
}

/**
 * Terapia Senza Follow-up: therapy without follow-up within 14 days.
 */
function detectTerapiaSenzaFollowup(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const therapies = events.filter((e) => e.eventType === 'terapia');

  for (const therapy of therapies) {
    const followUp = events.find(
      (e) =>
        e.eventDate > therapy.eventDate &&
        daysDiff(therapy.eventDate, e.eventDate) <= THRESHOLDS.TERAPIA_SENZA_FOLLOWUP &&
        ['follow-up', 'visita', 'esame'].includes(e.eventType),
    );

    if (!followUp) {
      // Only flag if there are subsequent events (therapy isn't the last thing)
      const hasLaterEvents = events.some((e) => e.eventDate > therapy.eventDate);
      if (hasLaterEvents) {
        anomalies.push({
          anomalyType: 'terapia_senza_followup',
          severity: 'bassa',
          description: `Nessun controllo documentato entro ${THRESHOLDS.TERAPIA_SENZA_FOLLOWUP} giorni dalla terapia del ${formatDate(therapy.eventDate)}: "${therapy.title}".`,
          involvedEvents: [makeEventRef(therapy)],
          suggestion: 'Verificare se sono stati effettuati controlli per monitorare gli effetti della terapia.',
        });
      }
    }
  }

  return anomalies;
}

// --- Helpers ---

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function makeEventRef(event: ConsolidatedEvent): DetectedAnomaly['involvedEvents'][number] {
  return {
    eventId: null,
    orderNumber: event.orderNumber,
    date: event.eventDate,
    title: event.title,
  };
}

/**
 * Heuristic check if two diagnoses are contradictory.
 * Simple approach: different diagnoses for same body area/system.
 */
function areDiagnosesContradictory(a: string, b: string): boolean {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  // Same diagnosis = not contradictory
  if (normalizedA === normalizedB) return false;

  // Very similar = not contradictory (likely rephrasing)
  const wordsA = new Set(normalizedA.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(normalizedB.split(/\s+/).filter((w) => w.length > 3));

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  const maxSize = Math.max(wordsA.size, wordsB.size);
  if (maxSize === 0) return false;

  // High word overlap = likely same diagnosis rephrased
  if (overlap / maxSize > 0.7) return false;

  // Low overlap = potentially contradictory (different diagnoses)
  // Only flag if there's some meaningful content in both
  return wordsA.size >= 2 && wordsB.size >= 2;
}
