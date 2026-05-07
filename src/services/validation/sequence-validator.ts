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
  /** Optional keyword filter for the "after" event title or description.
   * When set, only events whose title/description contains at least one of
   * these keywords (case-insensitive) are considered for this rule.
   * Used e.g. to restrict the "Trauma → imaging" rule to actual imaging
   * exams (RX/TC/RM) and avoid false positives on lab tests, swabs, etc. */
  afterKeywords?: string[];
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
    // Restrict to actual imaging modalities. Without this filter, the rule
    // false-positives on lab tests and microbiology swabs (it was flagging
    // a tampone MDR done 5 days post-trauma as a "delayed imaging").
    afterKeywords: [
      'rx ',
      'radiograf',
      'tc ',
      'tac ',
      'tomograf',
      'rm ',
      'risonanz',
      'ecograf',
      'mri',
      'imaging',
    ],
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

  // Find candidate "after" events, optionally filtered by keyword on title/description.
  const afterEvents = events.filter((e) => {
    if (!rule.after.includes(e.eventType)) return false;
    if (!rule.afterKeywords || rule.afterKeywords.length === 0) return true;
    const haystack = `${e.title} ${e.description}`.toLowerCase();
    return rule.afterKeywords.some((kw) => haystack.includes(kw.toLowerCase()));
  });

  // ── Branch A: rules with maxDaysGap ──
  // Semantic: "for each BEFORE event (trigger), at least one matching AFTER must
  // occur within maxDaysGap days". If the first matching AFTER after a given
  // BEFORE is within the gap → OK. If not (or none exist) → flag the BEFORE.
  // This avoids false positives on follow-up imaging months later for a
  // ricovero that already had imaging same-day.
  if (rule.maxDaysGap !== undefined) {
    const beforeEvents = events.filter((e) => rule.before.includes(e.eventType));
    for (const beforeEvent of beforeEvents) {
      // Find matching after-events that occur on or after this before.
      const subsequent = afterEvents.filter((a) => a.eventDate >= beforeEvent.eventDate);
      if (subsequent.length === 0) continue; // No follow-up — handled by missing-doc detectors, not this rule
      // Closest after-event in time
      const closestAfter = subsequent.reduce((acc, cur) => {
        const accGap = daysDiff(beforeEvent.eventDate, acc.eventDate);
        const curGap = daysDiff(beforeEvent.eventDate, cur.eventDate);
        return curGap < accGap ? cur : acc;
      });
      const daysBetween = daysDiff(beforeEvent.eventDate, closestAfter.eventDate);
      if (daysBetween > rule.maxDaysGap) {
        anomalies.push({
          anomalyType: 'sequenza_temporale_violata',
          severity: rule.severity,
          description: `${rule.name}: ${rule.description}. Rilevato un intervallo di ${daysBetween} giorni tra "${beforeEvent.title}" (${formatDate(beforeEvent.eventDate)}) e il primo evento successivo pertinente "${closestAfter.title}" (${formatDate(closestAfter.eventDate)}), superiore al limite di ${rule.maxDaysGap} giorni.`,
          involvedEvents: [
            {
              eventId: null,
              orderNumber: beforeEvent.orderNumber,
              date: beforeEvent.eventDate,
              title: beforeEvent.title,
            },
            {
              eventId: null,
              orderNumber: closestAfter.orderNumber,
              date: closestAfter.eventDate,
              title: closestAfter.title,
            },
          ],
          suggestion: `Valutare se il ritardo di ${daysBetween} giorni abbia avuto conseguenze sulla prognosi del paziente.`,
        });
      }
    }
    return anomalies;
  }

  // ── Branch B: rules without maxDaysGap (sequence-only rules) ──
  // Semantic: "every AFTER event must be preceded somewhere in the timeline by
  // at least one BEFORE event of the required type." If no BEFORE exists at
  // all before this AFTER, flag the AFTER.
  for (const afterEvent of afterEvents) {
    const beforeEvent = events.find(
      (e) => rule.before.includes(e.eventType) && e.eventDate <= afterEvent.eventDate,
    );

    if (!beforeEvent) {
      // Only flag if there are at least 3 events (avoid noise with minimal data).
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
    }
  }

  return anomalies;
}

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
