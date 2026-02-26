import type { AnomalyType, AnomalySeverity } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { formatDate } from '@/lib/format';

export interface DetectedAnomaly {
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  involvedEvents: Array<{
    eventId: string | null;
    orderNumber: number;
    date: string;
    title: string;
  }>;
  suggestion: string;
}

// Conservative thresholds to avoid false positives
const THRESHOLDS = {
  RITARDO_DIAGNOSTICO: 90, // 90 days (was 30 — too aggressive)
  GAP_POST_CHIRURGICO: 60, // 60 days (was 30)
  GAP_DOCUMENTALE_WARNING: 180, // 6 months (was 60 — way too aggressive for partial docs)
  GAP_DOCUMENTALE_CRITICO: 365, // 1 year (was 180)
  DIAGNOSI_CONTRADDITTORIA: 60, // 60 days (was 90)
  TERAPIA_SENZA_FOLLOWUP: 30, // 30 days (was 14 — too aggressive)
  MIN_EVENTS_FOR_GAP: 5, // Don't flag gaps if fewer than 5 events (insufficient data)
} as const;

/**
 * Detect medico-legal anomalies from consolidated events.
 * Conservative: avoids false positives that overwhelm the user.
 * Only flags clear, actionable issues.
 */
export function detectAnomalies(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  if (events.length < 2) return [];

  const anomalies: DetectedAnomaly[] = [];

  // Only run gap analysis if we have enough events for meaningful gaps
  if (events.length >= THRESHOLDS.MIN_EVENTS_FOR_GAP) {
    anomalies.push(...detectGapDocumentale(events));
  }

  anomalies.push(...detectRitardoDiagnostico(events));
  anomalies.push(...detectGapPostChirurgico(events));
  anomalies.push(...detectComplicanzaNonGestita(events));
  anomalies.push(...detectDiagnosiContraddittoria(events));

  // Only check consent/followup if we have multiple document sources
  // (single doc = likely partial view, flagging consent is noise)
  const uniqueDocIds = new Set(events.map((e) => e.documentId).filter(Boolean));
  if (uniqueDocIds.size > 1) {
    anomalies.push(...detectConsensoNonDocumentato(events));
    anomalies.push(...detectTerapiaSenzaFollowup(events));
  }

  // Deduplicate anomalies by type + description
  const seen = new Set<string>();
  return anomalies.filter((a) => {
    const key = `${a.anomalyType}:${a.description.slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Ritardo Diagnostico: >90 days between initial visit and diagnosis.
 * Only flags clear delays, not normal diagnostic timelines.
 */
function detectRitardoDiagnostico(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const visits = events.filter((e) => e.eventType === 'visita');
  const diagnoses = events.filter((e) => e.eventType === 'diagnosi');

  if (visits.length === 0 || diagnoses.length === 0) return [];

  // Only check first visit → first diagnosis (avoid combinatorial explosion)
  const firstVisit = visits[0];
  const firstDiagnosis = diagnoses.find((d) => d.eventDate >= firstVisit.eventDate);

  if (firstDiagnosis) {
    const daysBetween = daysDiff(firstVisit.eventDate, firstDiagnosis.eventDate);

    if (daysBetween > THRESHOLDS.RITARDO_DIAGNOSTICO) {
      anomalies.push({
        anomalyType: 'ritardo_diagnostico',
        severity: daysBetween > 180 ? 'critica' : daysBetween > 120 ? 'alta' : 'media',
        description: `Ritardo di ${daysBetween} giorni tra la prima visita (${formatDate(firstVisit.eventDate)}) e la diagnosi (${formatDate(firstDiagnosis.eventDate)}).`,
        involvedEvents: [makeEventRef(firstVisit), makeEventRef(firstDiagnosis)],
        suggestion: `Verificare se il ritardo diagnostico di ${daysBetween} giorni ha influito sulla prognosi.`,
      });
    }
  }

  return anomalies;
}

/**
 * Gap Post-Chirurgico: >60 days without any follow-up after surgery.
 */
function detectGapPostChirurgico(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const surgeries = events.filter((e) => e.eventType === 'intervento');

  for (const surgery of surgeries) {
    const followUp = events.find(
      (e) =>
        e.eventDate > surgery.eventDate &&
        ['follow-up', 'visita', 'esame'].includes(e.eventType),
    );

    if (!followUp) {
      // Only flag if surgery isn't the last event (might be too recent)
      const laterEvents = events.filter((e) => e.eventDate > surgery.eventDate);
      if (laterEvents.length > 0) {
        anomalies.push({
          anomalyType: 'gap_post_chirurgico',
          severity: 'media',
          description: `Nessun follow-up documentato dopo l'intervento del ${formatDate(surgery.eventDate)}: "${surgery.title}".`,
          involvedEvents: [makeEventRef(surgery)],
          suggestion: 'Verificare se sono stati effettuati controlli post-operatori non inclusi nella documentazione.',
        });
      }
    } else {
      const daysBetween = daysDiff(surgery.eventDate, followUp.eventDate);

      if (daysBetween > THRESHOLDS.GAP_POST_CHIRURGICO) {
        anomalies.push({
          anomalyType: 'gap_post_chirurgico',
          severity: daysBetween > 120 ? 'alta' : 'media',
          description: `Gap di ${daysBetween} giorni senza follow-up dopo l'intervento del ${formatDate(surgery.eventDate)}.`,
          involvedEvents: [makeEventRef(surgery), makeEventRef(followUp)],
          suggestion: `Verificare se il gap di ${daysBetween} giorni post-operatorio è clinicamente giustificato.`,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Gap Documentale: periods >6 months without any documentation.
 * Only runs with sufficient events to detect meaningful gaps.
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
        severity: isCritical ? 'alta' : 'media',
        description: `Gap documentale di ${daysBetween} giorni (${Math.round(daysBetween / 30)} mesi) tra il ${formatDate(current.eventDate)} e il ${formatDate(next.eventDate)}.`,
        involvedEvents: [makeEventRef(current), makeEventRef(next)],
        suggestion: `Richiedere documentazione per il periodo ${formatDate(current.eventDate)} - ${formatDate(next.eventDate)}.`,
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
    const treatment = events.find(
      (e) =>
        e.eventDate >= complication.eventDate &&
        daysDiff(complication.eventDate, e.eventDate) <= 14 &&
        ['terapia', 'intervento'].includes(e.eventType) &&
        e.orderNumber > complication.orderNumber,
    );

    if (!treatment) {
      anomalies.push({
        anomalyType: 'complicanza_non_gestita',
        severity: 'alta',
        description: `Complicanza "${complication.title}" del ${formatDate(complication.eventDate)} senza trattamento documentato.`,
        involvedEvents: [makeEventRef(complication)],
        suggestion: 'Verificare se la complicanza è stata trattata ma non documentata.',
      });
    }
  }

  return anomalies;
}

/**
 * Consenso Non Documentato: missing consent for procedures.
 * Only checked when multiple document sources are present.
 */
function detectConsensoNonDocumentato(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const procedures = events.filter((e) => e.eventType === 'intervento');
  const consents = events.filter((e) => e.eventType === 'consenso');

  // If no consent events at all and there are procedures, flag ONE general anomaly
  if (consents.length === 0 && procedures.length > 0) {
    anomalies.push({
      anomalyType: 'consenso_non_documentato',
      severity: 'media',
      description: `Nessun consenso informato documentato per ${procedures.length} procedura/e chirurgica/e.`,
      involvedEvents: procedures.slice(0, 3).map(makeEventRef),
      suggestion: 'Verificare se i consensi informati sono stati acquisiti ma non inclusi nella documentazione.',
    });
    return anomalies;
  }

  return anomalies;
}

/**
 * Diagnosi Contraddittoria: conflicting diagnoses within 60 days.
 * Conservative: requires significant difference, not just different wording.
 */
function detectDiagnosiContraddittoria(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const eventsWithDiagnosis = events.filter((e) => e.diagnosis && e.diagnosis.length > 10);

  // Limit to avoid O(n²) explosion
  const maxToCheck = Math.min(eventsWithDiagnosis.length, 20);

  for (let i = 0; i < maxToCheck; i++) {
    for (let j = i + 1; j < maxToCheck; j++) {
      const a = eventsWithDiagnosis[i];
      const b = eventsWithDiagnosis[j];

      if (daysDiff(a.eventDate, b.eventDate) > THRESHOLDS.DIAGNOSI_CONTRADDITTORIA) {
        continue;
      }

      if (areDiagnosesContradictory(a.diagnosis!, b.diagnosis!)) {
        anomalies.push({
          anomalyType: 'diagnosi_contraddittoria',
          severity: 'media',
          description: `Diagnosi potenzialmente contraddittorie: "${a.diagnosis}" vs "${b.diagnosis}" (entro ${daysDiff(a.eventDate, b.eventDate)} giorni).`,
          involvedEvents: [makeEventRef(a), makeEventRef(b)],
          suggestion: 'Verificare se si tratta di un aggiornamento diagnostico o di una reale contraddizione.',
        });
      }
    }
  }

  return anomalies;
}

/**
 * Terapia Senza Follow-up: therapy without follow-up within 30 days.
 * Only checked when multiple document sources are present.
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
      const hasLaterEvents = events.some((e) => e.eventDate > therapy.eventDate);
      if (hasLaterEvents) {
        anomalies.push({
          anomalyType: 'terapia_senza_followup',
          severity: 'bassa',
          description: `Nessun controllo documentato entro ${THRESHOLDS.TERAPIA_SENZA_FOLLOWUP} giorni dalla terapia del ${formatDate(therapy.eventDate)}.`,
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
 * Heuristic: two diagnoses are contradictory only if they share
 * very few words (< 20% overlap) and both are substantial.
 */
function areDiagnosesContradictory(a: string, b: string): boolean {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) return false;

  const wordsA = new Set(normalizedA.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(normalizedB.split(/\s+/).filter((w) => w.length > 3));

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  const maxSize = Math.max(wordsA.size, wordsB.size);
  if (maxSize === 0) return false;

  // Only flag if overlap is very low (< 20%) — clearly different diagnoses
  if (overlap / maxSize > 0.2) return false;

  // Both must have at least 3 meaningful words
  return wordsA.size >= 3 && wordsB.size >= 3;
}
