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
      const months = Math.round(daysBetween / 30);
      anomalies.push({
        anomalyType: 'ritardo_diagnostico',
        severity: daysBetween > 180 ? 'critica' : daysBetween > 120 ? 'alta' : 'media',
        description: `Ritardo diagnostico di ${daysBetween} giorni (circa ${months} mesi). La prima visita medica risulta in data ${formatDate(firstVisit.eventDate)} ("${firstVisit.title}"), mentre la prima diagnosi formale viene formulata solo il ${formatDate(firstDiagnosis.eventDate)} ("${firstDiagnosis.diagnosis ?? firstDiagnosis.title}"). Il lasso temporale tra il primo contatto clinico e la formulazione diagnostica supera i ${THRESHOLDS.RITARDO_DIAGNOSTICO} giorni previsti come soglia di attenzione.`,
        involvedEvents: [makeEventRef(firstVisit), makeEventRef(firstDiagnosis)],
        suggestion: `Valutare se il ritardo di ${months} mesi nella formulazione diagnostica abbia avuto ripercussioni sulla prognosi del paziente, considerando se erano indicati ulteriori accertamenti nel periodo intermedio.`,
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
          description: `Assenza di follow-up post-operatorio documentato. L'intervento "${surgery.title}" è stato eseguito il ${formatDate(surgery.eventDate)}, ma nella documentazione esaminata non risultano visite di controllo, esami o rivalutazioni successive, nonostante siano presenti altri eventi clinici in date posteriori. Ciò può indicare una lacuna nella documentazione fornita o un'effettiva omissione di controlli post-chirurgici.`,
          involvedEvents: [makeEventRef(surgery)],
          suggestion: 'Verificare se sono stati effettuati controlli post-operatori non inclusi nella documentazione fornita. Richiedere eventuale documentazione integrativa relativa al decorso post-operatorio.',
        });
      }
    } else {
      const daysBetween = daysDiff(surgery.eventDate, followUp.eventDate);

      if (daysBetween > THRESHOLDS.GAP_POST_CHIRURGICO) {
        anomalies.push({
          anomalyType: 'gap_post_chirurgico',
          severity: daysBetween > 120 ? 'alta' : 'media',
          description: `Intervallo di ${daysBetween} giorni (circa ${Math.round(daysBetween / 30)} mesi) senza follow-up dopo l'intervento chirurgico. L'intervento "${surgery.title}" è stato eseguito il ${formatDate(surgery.eventDate)}, mentre il primo controllo documentato ("${followUp.title}") risulta solo il ${formatDate(followUp.eventDate)}. Le linee guida raccomandano generalmente un follow-up post-chirurgico entro ${THRESHOLDS.GAP_POST_CHIRURGICO} giorni.`,
          involvedEvents: [makeEventRef(surgery), makeEventRef(followUp)],
          suggestion: `Valutare se l'assenza di controlli nei ${daysBetween} giorni successivi all'intervento possa aver contribuito a un ritardo nel riconoscimento di eventuali complicanze post-operatorie.`,
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
      const months = Math.round(daysBetween / 30);

      anomalies.push({
        anomalyType: 'gap_documentale',
        severity: isCritical ? 'alta' : 'media',
        description: `Lacuna documentale di ${daysBetween} giorni (circa ${months} mesi). L'ultimo evento documentato prima del gap è del ${formatDate(current.eventDate)} ("${current.title}"), mentre il primo evento successivo è del ${formatDate(next.eventDate)} ("${next.title}"). In questo intervallo temporale non risulta alcuna documentazione clinica. Ciò può dipendere da documentazione non fornita, assenza di accessi sanitari, o perdita di documenti.`,
        involvedEvents: [makeEventRef(current), makeEventRef(next)],
        suggestion: `Richiedere alla parte la documentazione clinica relativa al periodo ${formatDate(current.eventDate)} — ${formatDate(next.eventDate)}. Verificare in particolare se in tale intervallo siano state effettuate visite, esami o terapie non incluse nel fascicolo.`,
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
        description: `Complicanza senza trattamento documentato. In data ${formatDate(complication.eventDate)} è stata rilevata la complicanza "${complication.title}"${complication.description ? ` (${complication.description.slice(0, 150)})` : ''}, ma nei 14 giorni successivi non risulta documentato alcun trattamento specifico (farmacologico o chirurgico) per la gestione di tale complicanza.`,
        involvedEvents: [makeEventRef(complication)],
        suggestion: 'Verificare se la complicanza è stata trattata ma il trattamento non è documentato nel fascicolo fornito, oppure se vi sia stata un\'effettiva omissione di intervento terapeutico.',
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
    const procedureList = procedures.slice(0, 3).map((p) =>
      `"${p.title}" del ${formatDate(p.eventDate)}`,
    ).join('; ');
    anomalies.push({
      anomalyType: 'consenso_non_documentato',
      severity: 'media',
      description: `Nella documentazione esaminata non risultano consensi informati per ${procedures.length} procedura/e chirurgica/e documentata/e: ${procedureList}. L'assenza del consenso informato nella documentazione può indicare che il documento non è stato incluso nel fascicolo fornito, oppure che non sia stato acquisito.`,
      involvedEvents: procedures.slice(0, 3).map(makeEventRef),
      suggestion: 'Richiedere i moduli di consenso informato relativi alle procedure chirurgiche. L\'acquisizione del consenso informato è un obbligo deontologico e giuridico (art. 1 L. 219/2017).',
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
        const gapDays = daysDiff(a.eventDate, b.eventDate);
        anomalies.push({
          anomalyType: 'diagnosi_contraddittoria',
          severity: 'media',
          description: `Diagnosi potenzialmente discordanti a distanza di ${gapDays} giorni. In data ${formatDate(a.eventDate)} la diagnosi formulata è "${a.diagnosis}" (evento: "${a.title}"), mentre in data ${formatDate(b.eventDate)} viene formulata la diagnosi "${b.diagnosis}" (evento: "${b.title}"). La significativa differenza nel contenuto diagnostico entro un intervallo temporale ristretto richiede un approfondimento per stabilire se si tratti di un'evoluzione clinica, di un aggiornamento diagnostico motivato da nuovi accertamenti, oppure di una reale discordanza valutativa.`,
          involvedEvents: [makeEventRef(a), makeEventRef(b)],
          suggestion: 'Analizzare se tra le due diagnosi siano stati eseguiti accertamenti che giustifichino il cambiamento diagnostico. Valutare se la discordanza possa configurare un errore diagnostico rilevante ai fini medico-legali.',
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
          description: `Assenza di controllo dopo terapia. La terapia "${therapy.title}" è stata avviata il ${formatDate(therapy.eventDate)}, ma non risulta documentato alcun controllo o rivalutazione entro i ${THRESHOLDS.TERAPIA_SENZA_FOLLOWUP} giorni successivi, nonostante siano presenti ulteriori eventi clinici in date successive.`,
          involvedEvents: [makeEventRef(therapy)],
          suggestion: 'Verificare se sono stati effettuati controlli per monitorare efficacia ed eventuali effetti avversi della terapia, non inclusi nella documentazione fornita.',
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
