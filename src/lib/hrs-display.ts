/**
 * UI mapping for the Hallucination Risk Score (HRS, 0-100) computed by
 * services/synthesis/hallucination-risk-scorer.ts and saved in
 * reports.generation_metadata.hrs.
 *
 * The perito-facing wording avoids the internal "HRS" jargon: the badge is
 * called "Affidabilità citazioni" (citation reliability). Higher score =
 * fewer automatic findings = more reliable.
 */

import { getHrsLevel } from '@/services/synthesis/hallucination-risk-scorer';

export interface CitationReliabilityDisplay {
  /** Short label shown in the badge (e.g. "Alta"). */
  label: string;
  /** Tailwind classes for the badge (traffic-light color). */
  colorClass: string;
  /** Plain-Italian tooltip explaining the score and what to do. */
  description: string;
}

const BASE_DESCRIPTION =
  'Indice automatico (0-100) calcolato dai controlli di qualità del report: ' +
  'copertura degli eventi clinici, citazioni ritrovate nei documenti originali, date verificate. ' +
  'Le citazioni contrassegnate «da verificare» vanno sempre controllate sui documenti originali prima del deposito.';

/**
 * Map an HRS value to the perito-facing badge content. Pure, testable.
 */
export function getCitationReliabilityDisplay(hrs: number): CitationReliabilityDisplay {
  const level = getHrsLevel(hrs);

  switch (level) {
    case 'eccellente':
    case 'buono':
      return {
        label: 'Alta',
        colorClass: 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400',
        description: `Affidabilità citazioni: alta (${hrs}/100). ${BASE_DESCRIPTION}`,
      };
    case 'da_rivedere':
      return {
        label: 'Media',
        colorClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
        description: `Affidabilità citazioni: media (${hrs}/100) — sono presenti più rilievi automatici. ${BASE_DESCRIPTION}`,
      };
    case 'critico':
      return {
        label: 'Bassa',
        colorClass: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400',
        description: `Affidabilità citazioni: bassa (${hrs}/100) — molti rilievi automatici. Verifica il report con particolare attenzione. ${BASE_DESCRIPTION}`,
      };
  }
}
