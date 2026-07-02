/**
 * SIMLA 2025 BPCA — Barème Psichico Comportamentale Analitico.
 *
 * Based on the Ronchi-Mastroroberto methodology for psychological
 * and psychiatric damage assessment. Each domain has a maximum
 * percentage and four severity levels (lieve, moderato, grave, gravissimo).
 *
 * Individual domain scores are combined using the Balthazard formula
 * (remaining capacity principle) to produce the overall BPCA percentage.
 */

import { calculateBalthazard } from './balthazard';

// --- Types ---

export type BpcaSeverity = 'lieve' | 'moderato' | 'grave' | 'gravissimo';

export interface BpcaDomain {
  id: string;
  name: string;
  maxPercentage: number;
  description: string;
}

export interface BpcaAssessment {
  domainId: string;
  severity: BpcaSeverity;
}

export interface BpcaDomainScore {
  domainId: string;
  domainName: string;
  severity: BpcaSeverity;
  percentage: number;
  maxPercentage: number;
}

export interface BpcaResult {
  domainScores: readonly BpcaDomainScore[];
  combinedPercentage: number;
  methodology: string;
  reference: string;
  notes: string;
}

// --- Domain definitions ---

export const BPCA_DOMAINS: readonly BpcaDomain[] = [
  {
    id: 'disturbo_umore',
    name: 'Disturbi dell\'umore',
    maxPercentage: 30,
    description: 'Depressione, disturbo bipolare, distimia',
  },
  {
    id: 'disturbo_ansia',
    name: 'Disturbi d\'ansia',
    maxPercentage: 25,
    description: 'PTSD, disturbo panico, GAD, fobie',
  },
  {
    id: 'disturbo_personalita',
    name: 'Disturbi di personalita',
    maxPercentage: 40,
    description: 'Cluster A, B, C',
  },
  {
    id: 'disturbo_cognitivo',
    name: 'Deficit cognitivi',
    maxPercentage: 70,
    description: 'Attenzione, memoria, funzioni esecutive',
  },
  {
    id: 'disturbo_sonno',
    name: 'Disturbi del sonno',
    maxPercentage: 10,
    description: 'Insonnia, ipersonnia, parasonnie',
  },
  {
    id: 'disturbo_sessuale',
    name: 'Disfunzioni sessuali',
    maxPercentage: 15,
    description: 'Correlate a danno psichico',
  },
  {
    id: 'disturbo_somatoforme',
    name: 'Disturbi somatoformi',
    maxPercentage: 20,
    description: 'Sintomi neurologici funzionali, dolore cronico',
  },
];

// --- Severity multipliers ---

/**
 * Severity maps to a fraction of the domain's max percentage.
 * lieve = 1/4, moderato = 2/4, grave = 3/4, gravissimo = 4/4.
 */
const SEVERITY_MULTIPLIERS: Record<BpcaSeverity, number> = {
  lieve: 0.25,
  moderato: 0.50,
  grave: 0.75,
  gravissimo: 1.00,
};

// --- Calculation ---

/**
 * Find a BPCA domain by its ID.
 */
function findDomain(domainId: string): BpcaDomain | undefined {
  return BPCA_DOMAINS.find((d) => d.id === domainId);
}

/**
 * Calculate the BPCA combined psychological damage percentage.
 *
 * @param assessments - Array of domain assessments with severity
 * @returns BpcaResult with individual and combined scores
 */
export function calculateBpca(
  assessments: readonly BpcaAssessment[],
): BpcaResult {
  if (assessments.length === 0) {
    return {
      domainScores: [],
      combinedPercentage: 0,
      methodology: 'SIMLA 2025 BPCA (Ronchi-Mastroroberto)',
      reference: 'BPCA — Bareme Psichico Comportamentale Analitico, SIMLA 2025',
      notes: 'Nessun dominio valutato.',
    };
  }

  // Validate and score each domain
  const domainScores: BpcaDomainScore[] = [];
  const invalidDomains: string[] = [];

  for (const assessment of assessments) {
    const domain = findDomain(assessment.domainId);
    if (!domain) {
      invalidDomains.push(assessment.domainId);
      continue;
    }

    const multiplier = SEVERITY_MULTIPLIERS[assessment.severity];
    const rawPercentage = domain.maxPercentage * multiplier;
    const percentage = Math.round(rawPercentage * 100) / 100;

    domainScores.push({
      domainId: domain.id,
      domainName: domain.name,
      severity: assessment.severity,
      percentage,
      maxPercentage: domain.maxPercentage,
    });
  }

  if (invalidDomains.length > 0) {
    return {
      domainScores,
      combinedPercentage: 0,
      methodology: 'SIMLA 2025 BPCA (Ronchi-Mastroroberto)',
      reference: 'BPCA — Bareme Psichico Comportamentale Analitico, SIMLA 2025',
      notes: `Domini non riconosciuti: ${invalidDomains.join(', ')}. Verificare gli ID dominio.`,
    };
  }

  // Combine using Balthazard formula
  const percentages = domainScores.map((s) => s.percentage);
  const balthazardResult = calculateBalthazard(percentages);

  const domainSummary = domainScores
    .map((s) => `${s.domainName}: ${s.percentage}% (${s.severity})`)
    .join('; ');

  return {
    domainScores,
    combinedPercentage: balthazardResult.combinedPercentage,
    methodology: 'SIMLA 2025 BPCA (Ronchi-Mastroroberto)',
    reference: 'BPCA — Bareme Psichico Comportamentale Analitico, SIMLA 2025',
    notes: `Valutazione per domini: ${domainSummary}. `
      + `Combinazione con formula di Balthazard: ${balthazardResult.combinedPercentage}%.`,
  };
}
