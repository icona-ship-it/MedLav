/**
 * Validates logical-clinical event sequences.
 * Detects when expected event orderings are violated (e.g., surgery before diagnosis).
 */

import type { CaseType } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from './anomaly-detector';
import { formatDate } from '@/lib/format';

interface SequenceRule {
  name: string;
  before: string[];
  after: string[];
  maxDaysGap?: number;
  applicableCaseTypes: CaseType[] | 'all';
  severity: 'critica' | 'alta' | 'media' | 'bassa';
  description: string;
}

const SEQUENCE_RULES: SequenceRule[] = [
  {
    name: 'Diagnosi prima della terapia',
    before: ['diagnosi'],
    after: ['terapia'],
    applicableCaseTypes: 'all',
    severity: 'media',
    description: 'La terapia dovrebbe essere preceduta da una diagnosi formale',
  },
  {
    name: 'Ricovero prima dell\'intervento',
    before: ['ricovero'],
    after: ['intervento'],
    applicableCaseTypes: 'all',
    severity: 'bassa',
    description: 'L\'intervento chirurgico dovrebbe essere preceduto dal ricovero',
  },
  {
    name: 'Consenso prima dell\'intervento',
    before: ['consenso'],
    after: ['intervento'],
    applicableCaseTypes: 'all',
    severity: 'media',
    description: 'Il consenso informato deve precedere l\'intervento chirurgico (L. 219/2017)',
  },
  {
    name: 'Diagnosi oncologica → trattamento entro 60 giorni',
    before: ['diagnosi'],
    after: ['terapia', 'intervento'],
    maxDaysGap: 60,
    applicableCaseTypes: ['oncologica'],
    severity: 'alta',
    description: 'Il trattamento oncologico dovrebbe iniziare entro 60 giorni dalla diagnosi',
  },
  {
    name: 'CTG patologico → decisione entro 30 minuti',
    before: ['esame'],
    after: ['intervento'],
    maxDaysGap: 1, // approximate — can't detect minutes from daily granularity
    applicableCaseTypes: ['ostetrica'],
    severity: 'critica',
    description: 'Un CTG patologico richiede decisione tempestiva (entro 30 minuti)',
  },
  {
    name: 'Trauma → imaging entro 24 ore',
    before: ['visita', 'ricovero'],
    after: ['esame'],
    maxDaysGap: 1,
    applicableCaseTypes: ['rc_auto'],
    severity: 'media',
    description: 'Dopo un trauma, l\'imaging diagnostico dovrebbe essere eseguito entro 24 ore',
  },
];

/**
 * Validate event sequences against known clinical rules.
 */
export function validateEventSequences(params: {
  events: ConsolidatedEvent[];
  caseType: CaseType;
  caseTypes?: CaseType[];
}): DetectedAnomaly[] {
  const { events, caseType, caseTypes } = params;
  if (events.length < 2) return [];

  const effectiveTypes = new Set(
    caseTypes && caseTypes.length > 1 ? caseTypes : [caseType],
  );

  const anomalies: DetectedAnomaly[] = [];

  for (const rule of SEQUENCE_RULES) {
    // Check if rule applies to this case type
    if (rule.applicableCaseTypes !== 'all') {
      const applies = rule.applicableCaseTypes.some((ct) => effectiveTypes.has(ct));
      if (!applies) continue;
    }

    const violations = checkRule(rule, events);
    anomalies.push(...violations);
  }

  return anomalies;
}

/**
 * Check a single sequence rule against the event timeline.
 */
function checkRule(
  rule: SequenceRule,
  events: ConsolidatedEvent[],
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  // Find the first "after" event
  const afterEvents = events.filter((e) => rule.after.includes(e.eventType));

  for (const afterEvent of afterEvents) {
    // Check if there's a matching "before" event that precedes it
    const beforeEvent = events.find(
      (e) => rule.before.includes(e.eventType) && e.eventDate <= afterEvent.eventDate,
    );

    if (!beforeEvent) {
      // Violation: "after" event exists but no "before" event found before it
      // Only flag if there are at least 3 events (avoid noise with minimal data)
      if (events.length >= 3) {
        anomalies.push({
          anomalyType: 'sequenza_temporale_violata',
          severity: rule.severity,
          description: `${rule.name}: ${rule.description}. L'evento "${afterEvent.title}" del ${formatDate(afterEvent.eventDate)} (tipo: ${afterEvent.eventType}) non risulta preceduto da un evento di tipo ${rule.before.join('/')} nella documentazione esaminata.`,
          involvedEvents: [{
            eventId: null,
            orderNumber: afterEvent.orderNumber,
            date: afterEvent.eventDate,
            title: afterEvent.title,
          }],
          suggestion: `Verificare se l'evento di tipo ${rule.before.join('/')} è stato eseguito ma non documentato, oppure se rappresenta un'effettiva omissione.`,
        });
      }
      continue;
    }

    // Check maxDaysGap if defined
    if (rule.maxDaysGap !== undefined) {
      const daysBetween = daysDiff(beforeEvent.eventDate, afterEvent.eventDate);
      if (daysBetween > rule.maxDaysGap) {
        anomalies.push({
          anomalyType: 'sequenza_temporale_violata',
          severity: rule.severity,
          description: `${rule.name}: ${rule.description}. Rilevato un intervallo di ${daysBetween} giorni tra "${beforeEvent.title}" (${formatDate(beforeEvent.eventDate)}) e "${afterEvent.title}" (${formatDate(afterEvent.eventDate)}), superiore al limite di ${rule.maxDaysGap} giorni.`,
          involvedEvents: [
            {
              eventId: null,
              orderNumber: beforeEvent.orderNumber,
              date: beforeEvent.eventDate,
              title: beforeEvent.title,
            },
            {
              eventId: null,
              orderNumber: afterEvent.orderNumber,
              date: afterEvent.eventDate,
              title: afterEvent.title,
            },
          ],
          suggestion: `Valutare se il ritardo di ${daysBetween} giorni abbia avuto conseguenze sulla prognosi del paziente.`,
        });
      }
    }
  }

  return anomalies;
}

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
