/**
 * Medico-legal calculation services.
 *
 * Exports all calculation utilities for biological damage,
 * concurrent injuries, preexisting conditions, and damage estimation.
 */

// Bareme tables (Micropermanenti + TUN Macropermanenti)
export {
  calculateDannoBiologico,
  getMicroCoefficient,
  getTunInvalidityCoefficient,
  getTunAgeCoefficient,
  type DannoBiologicoResult,
} from './bareme-tables';

// Tabelle Milano 2024
export {
  calculateMilano,
  type MilanoResult,
} from './tabelle-milano';

// Balthazard formula (concurrent injuries)
export {
  calculateBalthazard,
  type BalthazardResult,
  type BalthazardStep,
} from './balthazard';

// Gabrielli formula (preexisting conditions)
export {
  calculateGabrielli,
  type GabrielliResult,
} from './gabrielli';

// Damage estimator (case-type-based ranges)
export {
  estimateBiologicalDamage,
  type DamageEstimate,
} from './damage-estimator';

// SIMLA 2025 BPCA (psychological/psychiatric damage)
export {
  calculateBpca,
  BPCA_DOMAINS,
  type BpcaDomain,
  type BpcaSeverity,
  type BpcaAssessment,
  type BpcaDomainScore,
  type BpcaResult,
} from './simla-bpca';

// Medico-legal period calculations (ITT, ITP, hospital days, etc.)
export {
  calculateMedicoLegalPeriods,
  type MedicoLegalCalculation,
} from './medico-legal-calc';
