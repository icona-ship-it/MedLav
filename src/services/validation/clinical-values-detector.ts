/**
 * Detects critical clinical values in event descriptions.
 * Scans numeric values (vitals, lab results) and flags those outside critical ranges.
 */

import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from './anomaly-detector';
import { formatDate } from '@/lib/format';

interface ClinicalValuePattern {
  name: string;
  regex: RegExp;
  unit: string;
  normalRange: { min: number; max: number };
  criticalRange: { min: number; max: number };
  /** Lab values (Hb, glicemia, INR, creatinina) only make sense on BLOOD
   * tests: a urinalysis legitimately reports "Hb 1" in different units (QA
   * 2026-06-11: "Emoglobina 1 g/dL CRITICA" from an esame urine). */
  requiresBloodContext?: boolean;
}

/**
 * Clinical value patterns with normal and critical ranges.
 * Critical range: outside this is life-threatening or clinically very significant.
 */
const CLINICAL_PATTERNS: ClinicalValuePattern[] = [
  {
    name: 'Pressione arteriosa sistolica',
    regex: /(?:pa|pressione|press\.?\s*art\.?|sistolica)\s*[:\s]*(\d{2,3})\s*[/]/i,
    unit: 'mmHg',
    normalRange: { min: 90, max: 140 },
    criticalRange: { min: 70, max: 200 },
  },
  {
    name: 'Pressione arteriosa diastolica',
    regex: /(?:pa|pressione|press\.?\s*art\.?)\s*[:\s]*\d{2,3}\s*[/]\s*(\d{2,3})/i,
    unit: 'mmHg',
    normalRange: { min: 60, max: 90 },
    criticalRange: { min: 40, max: 120 },
  },
  {
    name: 'Frequenza cardiaca',
    regex: /(?:fc|freq\.?\s*card\.?|frequenza\s*cardiaca|battiti)\s*[:\s]*(\d{2,3})\s*(?:bpm|\/min|b\/min)?/i,
    unit: 'bpm',
    normalRange: { min: 60, max: 100 },
    criticalRange: { min: 35, max: 180 },
  },
  {
    name: 'Saturazione O2',
    regex: /(?:spo2|sao2|saturazione|sat\.?\s*o2)\s*[:\s]*(\d{2,3})\s*%?/i,
    unit: '%',
    normalRange: { min: 95, max: 100 },
    criticalRange: { min: 88, max: 100 },
  },
  {
    name: 'Glicemia',
    requiresBloodContext: true,
    regex: /(?:glicemia|glucosio|glyc)\s*[:\s]*(\d{2,3}(?:[.,]\d+)?)\s*(?:mg\/dl|mg)?/i,
    unit: 'mg/dL',
    normalRange: { min: 70, max: 110 },
    criticalRange: { min: 40, max: 400 },
  },
  {
    name: 'INR',
    requiresBloodContext: true,
    regex: /(?:inr)\s*[:\s]*(\d{1,2}[.,]\d{1,2})/i,
    unit: '',
    normalRange: { min: 0.8, max: 1.2 },
    criticalRange: { min: 0.5, max: 5.0 },
  },
  {
    name: 'Emoglobina',
    requiresBloodContext: true,
    regex: /(?:hb|emoglobina|hgb)\s*[:\s]*(\d{1,2}[.,]\d{1,2})\s*(?:g\/dl|g)?/i,
    unit: 'g/dL',
    normalRange: { min: 12.0, max: 17.0 },
    criticalRange: { min: 6.0, max: 20.0 },
  },
  {
    name: 'Temperatura',
    regex: /(?:temperatura|temp\.?|tc|t\.?\s*corp\.?)\s*[:\s]*(\d{2}[.,]\d{1,2})\s*(?:°?c)?/i,
    unit: '°C',
    normalRange: { min: 36.0, max: 37.5 },
    criticalRange: { min: 34.0, max: 41.0 },
  },
  {
    name: 'Creatinina',
    requiresBloodContext: true,
    regex: /(?:creatinina|creat\.?)\s*[:\s]*(\d{1,2}[.,]\d{1,2})\s*(?:mg\/dl|mg)?/i,
    unit: 'mg/dL',
    normalRange: { min: 0.6, max: 1.2 },
    criticalRange: { min: 0.3, max: 10.0 },
  },
];

/**
 * Parse a number from Italian format (comma as decimal separator).
 */
function parseItalianNumber(value: string): number {
  return parseFloat(value.replace(',', '.'));
}

/**
 * Detect critical clinical values from consolidated events.
 */
export function detectCriticalClinicalValues(
  events: ConsolidatedEvent[],
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    // Eventi con data sentinella o ignota: il valore può essere reale ma non
    // collocabile nel tempo — non genera anomalie (QA 2026-06-11: anomalie
    // assurde da date 01.01.2006 inferite).
    if (event.eventDate === '1900-01-01' || event.datePrecision === 'sconosciuta') continue;

    const textToScan = `${event.title} ${event.description}`;
    // Contesto URINE senza menzione di sangue: i valori di laboratorio ematici
    // (Hb, glicemia, creatinina, INR) hanno unità e range diversi — skip.
    const mentionsUrine = /urin/i.test(textToScan);
    const mentionsBlood = /sangue|ematochimic|emocromo|siero|plasma|ematic/i.test(textToScan);
    const bloodContextOk = !mentionsUrine || mentionsBlood;

    for (const pattern of CLINICAL_PATTERNS) {
      if (pattern.requiresBloodContext && !bloodContextOk) continue;
      const match = textToScan.match(pattern.regex);
      if (!match || !match[1]) continue;

      const numericValue = parseItalianNumber(match[1]);
      if (isNaN(numericValue)) continue;

      // Check if outside critical range
      if (numericValue >= pattern.criticalRange.min && numericValue <= pattern.criticalRange.max) {
        continue; // Within critical range (not critical)
      }

      // Dedup by pattern name + event date
      const dedupKey = `${pattern.name}:${event.eventDate}:${numericValue}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const isLifeThreatening =
        numericValue < pattern.criticalRange.min * 0.8 ||
        numericValue > pattern.criticalRange.max * 1.2;

      anomalies.push({
        anomalyType: 'valore_clinico_critico',
        severity: isLifeThreatening ? 'critica' : 'alta',
        description: `Valore critico di ${pattern.name}: ${numericValue} ${pattern.unit} rilevato in data ${formatDate(event.eventDate)} (evento: "${event.title}"). Range normale: ${pattern.normalRange.min}-${pattern.normalRange.max} ${pattern.unit}. Range critico: <${pattern.criticalRange.min} o >${pattern.criticalRange.max} ${pattern.unit}.`,
        involvedEvents: [{
          eventId: null,
          orderNumber: event.orderNumber,
          date: event.eventDate,
          title: event.title,
        }],
        suggestion: `Verificare se il valore di ${pattern.name} pari a ${numericValue} ${pattern.unit} è stato adeguatamente gestito e documentato. Valutare le possibili conseguenze cliniche.`,
      });
    }
  }

  return anomalies;
}
