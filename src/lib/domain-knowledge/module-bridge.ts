/**
 * Bridge between new module system and existing domain knowledge.
 * Maps ModuleId → CaseType(s) so we can reuse all 13 existing
 * domain knowledge files without duplication.
 */

import type { ModuleId } from '@/types/modules';
import { getModule, moduleToCaseTypes } from '@/types/modules';
import type { CaseTypeKnowledge } from './types';
import { getCaseTypeKnowledge, getCombinedCaseTypeKnowledge } from './index';

/**
 * Get domain knowledge for a module by mapping to legacy case types.
 * Returns combined knowledge if the module maps to multiple types.
 */
export function getModuleKnowledge(moduleId: ModuleId): CaseTypeKnowledge {
  const caseTypes = moduleToCaseTypes(moduleId);
  if (caseTypes.length === 0) {
    return getCaseTypeKnowledge('generica');
  }
  if (caseTypes.length === 1) {
    return getCaseTypeKnowledge(caseTypes[0]);
  }
  return getCombinedCaseTypeKnowledge(caseTypes);
}

/**
 * Get the primary CaseType for a module (first in the list).
 * Useful when a single type is needed (e.g., for anomaly detection).
 */
export function getModulePrimaryCaseType(moduleId: ModuleId): string {
  const caseTypes = moduleToCaseTypes(moduleId);
  return caseTypes[0] ?? 'generica';
}

/**
 * Get the implied role for a module, with fallback to 'ctu'.
 */
export function getModuleRole(moduleId: ModuleId): 'ctu' | 'ctp' | 'stragiudiziale' {
  const mod = getModule(moduleId);
  return mod.impliedRole ?? 'ctu';
}
