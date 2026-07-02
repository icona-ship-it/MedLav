/**
 * Module system types for LegMed.
 *
 * rc-mvp (pivot 2026-07-02): l'MVP fa UNA cosa sola — la perizia RC
 * stragiudiziale. Il catalogo si riduce al singolo modulo
 * 'perizia_ml_rc_civile'; gli altri moduli/categorie vivono su main e nel
 * tag full-app-2026-07-02. Le firme degli helper restano identiche così i
 * consumer non cambiano forma (degenerano al singolo modulo).
 */

import type { CaseRole, CaseType } from './index';

// ---------------------------------------------------------------------------
// Pipeline modes
// ---------------------------------------------------------------------------

// rc-mvp: il modulo RC usa solo 'full'. Gli altri valori restano nel tipo
// perché campi DB/metadata storici possono ancora contenerli.
export type PipelineMode =
  | 'full'             // Full pipeline: OCR → extraction → consolidation → anomalies → calculations → report
  | 'extraction_only'  // (legacy) Document analysis
  | 'expenses_only'    // (legacy) Expense analysis
  | 'anonymize_only';  // (legacy) Anonymization

// ---------------------------------------------------------------------------
// Module IDs
// ---------------------------------------------------------------------------

export type ModuleId = 'perizia_ml_rc_civile';

// ---------------------------------------------------------------------------
// Module categories
// ---------------------------------------------------------------------------

export type ModuleCategoryId = 1;

export interface ModuleCategory {
  id: ModuleCategoryId;
  label: string;
  description: string;
}

export const MODULE_CATEGORIES: readonly ModuleCategory[] = [
  { id: 1, label: 'Perizia medico legale', description: 'Per privato, studio legale, assicurazione, agenzie infortunistiche' },
] as const;

// ---------------------------------------------------------------------------
// Module definitions
// ---------------------------------------------------------------------------

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  description: string;
  categoryId: ModuleCategoryId;
  impliedRole: CaseRole | null;
  pipelineMode: PipelineMode;
  /** Maps to existing CaseType(s) for domain knowledge reuse */
  legacyCaseTypes: CaseType[];
  /** Priority module (bold in spec = "cavallo di battaglia") */
  priority: boolean;
  /** Hide from catalog (not ready yet) */
  hidden?: boolean;
}

export const MODULE_CATALOG: readonly ModuleDefinition[] = [
  {
    id: 'perizia_ml_rc_civile',
    label: 'Responsabilità civile',
    description: 'Perizia medico-legale per responsabilità civile generale',
    categoryId: 1,
    impliedRole: 'stragiudiziale',
    pipelineMode: 'full',
    legacyCaseTypes: ['rc_auto'],
    priority: true,
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const moduleMap = new Map<ModuleId, ModuleDefinition>(
  MODULE_CATALOG.map((m) => [m.id, m]),
);

export function getModule(id: ModuleId): ModuleDefinition {
  const mod = moduleMap.get(id);
  if (!mod) throw new Error(`Unknown module: ${id}`);
  return mod;
}

export function moduleToRole(id: ModuleId): CaseRole | null {
  return getModule(id).impliedRole;
}

export function moduleToPipelineMode(id: ModuleId): PipelineMode {
  return getModule(id).pipelineMode;
}

export function moduleToCaseTypes(id: ModuleId): CaseType[] {
  return [...getModule(id).legacyCaseTypes];
}

export function moduleToCategory(id: ModuleId): ModuleCategory {
  const mod = getModule(id);
  const cat = MODULE_CATEGORIES.find((c) => c.id === mod.categoryId);
  if (!cat) throw new Error(`Unknown category: ${mod.categoryId}`);
  return cat;
}

/** All valid module IDs */
export const ALL_MODULE_IDS: readonly ModuleId[] = MODULE_CATALOG.map((m) => m.id);
