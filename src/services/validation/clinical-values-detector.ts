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
  /** Conversioni da unità SI usate dai laboratori italiani (bug "Emoglobina
   * 96 g/dL" 2026-07-16: il referto diceva 96 g/L = 9,6 g/dL, il detector
   * assumeva g/dL e segnalava un valore fisicamente impossibile). Se l'unità
   * SI compare accanto al numero, il valore è convertito nell'unità canonica
   * PRIMA del confronto coi range. */
  unitConversions?: Array<{ unit: RegExp; factor: number; label: string }>;
  /** Tetto di plausibilità fisiologica nell'unità canonica (post-conversione):
   * oltre, il numero è garbage OCR o un'unità non riconosciuta — si SCARTA
   * in silenzio invece di flaggare un'anomalia impossibile che brucerebbe la
   * fiducia del medico. Il documento resta comunque sotto gli occhi del perito. */
  implausibleAbove?: number;
  /** Contesto di ESCLUSIONE attorno al match: se compare, il numero appartiene a
   * un ALTRO analita omonimo e non va flaggato (Bigon 223: "transferrina
   * saturazione 18%" del pannello marziale letta come SpO2 18% — impossibile). */
  excludeContext?: RegExp;
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
    implausibleAbove: 350,
  },
  {
    name: 'Pressione arteriosa diastolica',
    regex: /(?:pa|pressione|press\.?\s*art\.?)\s*[:\s]*\d{2,3}\s*[/]\s*(\d{2,3})/i,
    unit: 'mmHg',
    normalRange: { min: 60, max: 90 },
    criticalRange: { min: 40, max: 120 },
    implausibleAbove: 250,
  },
  {
    name: 'Frequenza cardiaca',
    regex: /(?:fc|freq\.?\s*card\.?|frequenza\s*cardiaca|battiti)\s*[:\s]*(\d{2,3})\s*(?:bpm|\/min|b\/min)?/i,
    unit: 'bpm',
    normalRange: { min: 60, max: 100 },
    criticalRange: { min: 35, max: 180 },
    implausibleAbove: 350,
  },
  {
    name: 'Saturazione O2',
    regex: /(?:spo2|sao2|saturazione|sat\.?\s*o2)\s*[:\s]*(\d{2,3})\s*%?/i,
    unit: '%',
    normalRange: { min: 95, max: 100 },
    criticalRange: { min: 88, max: 100 },
    implausibleAbove: 100,
    // "saturazione" negli esami ematochimici è quasi sempre quella della
    // TRANSFERRINA (pannello marziale, valori 15-45%): mai leggerla come SpO2.
    excludeContext: /transferrin|sideremia|ferritin|pannello marziale/i,
  },
  {
    name: 'Glicemia',
    requiresBloodContext: true,
    regex: /(?:glicemia|glucosio|glyc)\s*[:\s]*(\d{2,3}(?:[.,]\d+)?)\s*(?:mg\/dl|mg)?/i,
    unit: 'mg/dL',
    normalRange: { min: 70, max: 110 },
    criticalRange: { min: 40, max: 400 },
    unitConversions: [{ unit: /mmol\/l/i, factor: 18.02, label: 'mmol/L' }],
    implausibleAbove: 1500,
  },
  {
    name: 'INR',
    requiresBloodContext: true,
    regex: /(?:inr)\s*[:\s]*(\d{1,2}[.,]\d{1,2})/i,
    unit: '',
    normalRange: { min: 0.8, max: 1.2 },
    criticalRange: { min: 0.5, max: 5.0 },
    implausibleAbove: 20,
  },
  {
    name: 'Emoglobina',
    requiresBloodContext: true,
    regex: /(?:hb|emoglobina|hgb)\s*[:\s]*(\d{1,3}[.,]\d{1,2})\s*(?:g\/dl|g)?/i,
    unit: 'g/dL',
    normalRange: { min: 12.0, max: 17.0 },
    criticalRange: { min: 6.0, max: 20.0 },
    // I lab italiani refertano spesso in g/L (96 g/L = 9,6 g/dL). NB /g\/l/ non
    // matcha dentro "g/dl" (lì i caratteri sono g-/-d-l, mai "g/l" contigui).
    unitConversions: [{ unit: /g\/l/i, factor: 0.1, label: 'g/L' }],
    implausibleAbove: 25,
  },
  {
    name: 'Temperatura',
    regex: /(?:temperatura|temp\.?|tc|t\.?\s*corp\.?)\s*[:\s]*(\d{2}[.,]\d{1,2})\s*(?:°?c)?/i,
    unit: '°C',
    normalRange: { min: 36.0, max: 37.5 },
    criticalRange: { min: 34.0, max: 41.0 },
    implausibleAbove: 45,
  },
  {
    name: 'Creatinina',
    requiresBloodContext: true,
    regex: /(?:creatinina|creat\.?)\s*[:\s]*(\d{1,3}[.,]\d{1,2})\s*(?:mg\/dl|mg)?/i,
    unit: 'mg/dL',
    normalRange: { min: 0.6, max: 1.2 },
    criticalRange: { min: 0.3, max: 10.0 },
    unitConversions: [{ unit: /[µu]mol\/l/i, factor: 1 / 88.4, label: 'µmol/L' }],
    implausibleAbove: 30,
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
      if (!match || !match[1] || match.index === undefined) continue;

      const rawValue = parseItalianNumber(match[1]);
      if (isNaN(rawValue)) continue;

      // Analita omonimo nel contesto (es. saturazione transferrina) → non è
      // il parametro vitale che questo pattern misura: salta.
      if (pattern.excludeContext) {
        const ctxStart = Math.max(0, match.index - 40);
        const ctx = textToScan.slice(ctxStart, match.index + match[0].length + 20);
        if (pattern.excludeContext.test(ctx)) continue;
      }

      // Unità SI accanto al numero (finestra subito dopo il match: la regex può
      // aver già consumato una "g" di "g/L") → converti nell'unità canonica.
      const unitWindow = textToScan.slice(match.index, match.index + match[0].length + 8);
      const conversion = pattern.unitConversions?.find((c) => c.unit.test(unitWindow));
      const numericValue = conversion
        ? Math.round(rawValue * conversion.factor * 100) / 100
        : rawValue;

      // Valore implausibile in QUALSIASI unità nota = garbage OCR o unità non
      // riconosciuta: scarta, non flaggare un'impossibilità fisiologica.
      if (pattern.implausibleAbove !== undefined && numericValue > pattern.implausibleAbove) continue;

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

      // Trasparenza per il perito: se il valore è stato convertito da unità SI,
      // mostra anche il dato originale del referto.
      const sourceNote = conversion ? ` (nel referto: ${match[1]} ${conversion.label})` : '';

      anomalies.push({
        anomalyType: 'valore_clinico_critico',
        severity: isLifeThreatening ? 'critica' : 'alta',
        description: `Valore critico di ${pattern.name}: ${numericValue} ${pattern.unit}${sourceNote} rilevato in data ${formatDate(event.eventDate)} (evento: "${event.title}"). Range normale: ${pattern.normalRange.min}-${pattern.normalRange.max} ${pattern.unit}. Range critico: <${pattern.criticalRange.min} o >${pattern.criticalRange.max} ${pattern.unit}.`,
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
