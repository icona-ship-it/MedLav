/**
 * Module system types for LegMed.
 *
 * rc-mvp (pivot 2026-07-02): il cuore dell'MVP è la perizia RC stragiudiziale.
 * 2026-07-06: RIESPOSTI (richiesta utente) i 3 STRUMENTI standalone che il
 * pivot aveva nascosto — Analisi Spese Mediche, Cronistoria, Anonimizzatore —
 * le cui pipeline (expenses_only / extraction_only / anonymize_only) erano
 * SEMPRE rimaste vive in process-case.ts e nella vista caso (client.tsx): il
 * prune aveva tolto solo la CREAZIONE. Gli altri moduli (CTU/previdenziale/
 * pareri) restano su main e nel tag full-app-2026-07-02.
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

export type ModuleId =
  | 'perizia_ml_rc_civile'
  // Strumenti standalone (riesposti 2026-07-06)
  | 'analisi_doc_sanitari'   // Cronistoria estrattiva (extraction_only)
  | 'analisi_spese_mediche'  // Analisi congruità spese (expenses_only)
  | 'anonimizzatore';        // Anonimizzazione documenti (anonymize_only)

// ---------------------------------------------------------------------------
// Module categories
// ---------------------------------------------------------------------------

export type ModuleCategoryId = 1 | 2;

export interface ModuleCategory {
  id: ModuleCategoryId;
  label: string;
  description: string;
}

export const MODULE_CATEGORIES: readonly ModuleCategory[] = [
  { id: 1, label: 'Perizia medico legale', description: 'Per privato, studio legale, assicurazione, agenzie infortunistiche' },
  { id: 2, label: 'Strumenti di analisi', description: 'Cronistoria, spese mediche, anonimizzazione — su documentazione singola' },
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
  {
    id: 'analisi_doc_sanitari',
    label: 'Analisi e cronistoria documenti sanitari',
    description: 'Trascrizione estrattiva e cronistoria della documentazione medico-sanitaria',
    categoryId: 2,
    impliedRole: null,
    pipelineMode: 'extraction_only',
    legacyCaseTypes: ['generica'],
    priority: false,
  },
  {
    id: 'analisi_spese_mediche',
    label: 'Analisi spese mediche',
    description: 'Gestione della congruità delle spese mediche e farmacologiche',
    categoryId: 2,
    impliedRole: null,
    pipelineMode: 'expenses_only',
    legacyCaseTypes: ['generica'],
    priority: false,
  },
  {
    id: 'anonimizzatore',
    label: 'Anonimizzatore',
    description: 'Anonimizzazione e pseudonimizzazione di documenti medico-legali',
    categoryId: 2,
    impliedRole: null,
    pipelineMode: 'anonymize_only',
    legacyCaseTypes: [],
    priority: false,
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

/**
 * Il modulo dell'MVP, per nome — NON usare MODULE_CATALOG[0] (posizionale):
 * alla riespansione del catalogo un riordino creerebbe silenziosamente casi
 * del modulo sbagliato (review 2026-07-03).
 */
export const RC_MODULE: ModuleDefinition = getModule('perizia_ml_rc_civile');
