/**
 * Module system types for LegMed.
 * Each module represents a specific type of medico-legal work product.
 * Modules are organized by category and determine pipeline behavior.
 */

import type { CaseRole, CaseType } from './index';

// ---------------------------------------------------------------------------
// Pipeline modes
// ---------------------------------------------------------------------------

export type PipelineMode =
  | 'full'             // Full pipeline: OCR → extraction → consolidation → anomalies → calculations → report
  | 'extraction_only'  // Document analysis: OCR → extraction → consolidation → timeline
  | 'expenses_only'    // Expense analysis: OCR → extraction → expense calculation
  | 'anonymize_only';  // Anonymization: upload → anonymize → download

// ---------------------------------------------------------------------------
// Module IDs — every selectable work product
// ---------------------------------------------------------------------------

export type ModuleId =
  // Cat 1: Perizia medico legale (privato/studio legale/assicurazione/ag. infortunistiche)
  | 'perizia_ml_rc_civile'
  | 'perizia_ml_infortuni'
  | 'perizia_ml_malattia'
  | 'perizia_ml_resp_prof'
  // Cat 2: CTU/ATP in ambito civile
  | 'ctu_civile_rc_civile'
  | 'ctu_civile_infortuni'
  | 'ctu_civile_malattia'
  | 'ctu_civile_resp_prof'
  // Cat 3: CTU/ATP in ambito previdenziale
  | 'ctu_prev_dlgs62_accertamento'
  | 'ctu_prev_dlgs62_progetto_vita'
  | 'ctu_prev_inv_civile'
  | 'ctu_prev_accompagnamento'
  | 'ctu_prev_l104'
  | 'ctu_prev_l222'
  | 'ctu_prev_altri_inps'
  // Cat 4: CTU/ATP in ambito INAIL
  | 'ctu_inail_malattia_prof'
  | 'ctu_inail_infortunio'
  // Cat 5: Parere pro veritate
  | 'parere_pro_veritate'
  // Cat 6: Parere scopo riserva
  | 'parere_scopo_riserva'
  // Cat 7: Analisi documenti sanitari
  | 'analisi_doc_sanitari'
  // Cat 8: Analisi documenti giudiziari
  | 'analisi_doc_giudiziari'
  // Cat 9: Analisi spese mediche
  | 'analisi_spese_mediche'
  // Cat 10: Anonimizzatore
  | 'anonimizzatore';

// ---------------------------------------------------------------------------
// Module categories
// ---------------------------------------------------------------------------

export type ModuleCategoryId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ModuleCategory {
  id: ModuleCategoryId;
  label: string;
  description: string;
}

export const MODULE_CATEGORIES: readonly ModuleCategory[] = [
  { id: 1, label: 'Perizia medico legale', description: 'Per privato, studio legale, assicurazione, agenzie infortunistiche' },
  { id: 2, label: 'CTU/ATP in ambito civile', description: 'Consulenza tecnica d\'ufficio in sede civile' },
  { id: 3, label: 'CTU/ATP in ambito previdenziale', description: 'Ricorsi previdenziali e assistenziali' },
  { id: 4, label: 'CTU/ATP in ambito INAIL', description: 'Malattia professionale e infortunio sul lavoro' },
  { id: 5, label: 'Parere pro veritate', description: 'In ambito di responsabilità professionale' },
  { id: 6, label: 'Parere scopo riserva', description: 'Parere preventivo a scopo prognostico o di riserva tecnica' },
  { id: 7, label: 'Analisi documenti sanitari', description: 'Cronistoria estrattiva della documentazione medico-sanitaria' },
  { id: 8, label: 'Analisi documenti giudiziari', description: 'Cronistoria estrattiva della documentazione giudiziaria' },
  { id: 9, label: 'Analisi spese mediche', description: 'Gestione congruità spese mediche e farmacologiche' },
  { id: 10, label: 'Anonimizzatore', description: 'Anonimizzazione e pseudonimizzazione documenti' },
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
  // --- Cat 1: Perizia medico legale ---
  {
    id: 'perizia_ml_rc_civile',
    label: 'Responsabilità civile',
    description: 'Perizia medico-legale per responsabilità civile',
    categoryId: 1,
    impliedRole: 'stragiudiziale',
    pipelineMode: 'full',
    legacyCaseTypes: ['rc_auto'],
    priority: true,
  },
  {
    id: 'perizia_ml_infortuni',
    label: 'Infortuni',
    description: 'Perizia medico-legale per infortuni',
    categoryId: 1,
    impliedRole: 'stragiudiziale',
    pipelineMode: 'full',
    legacyCaseTypes: ['infortuni'],
    priority: true,
  },
  {
    id: 'perizia_ml_malattia',
    label: 'Malattia',
    description: 'Perizia medico-legale per malattia',
    categoryId: 1,
    impliedRole: 'stragiudiziale',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale'],
    priority: true,
  },
  {
    id: 'perizia_ml_resp_prof',
    label: 'Responsabilità professionale',
    description: 'Perizia medico-legale per responsabilità professionale medica',
    categoryId: 1,
    impliedRole: 'stragiudiziale',
    pipelineMode: 'full',
    legacyCaseTypes: ['generica'],
    priority: true,
  },

  // --- Cat 2: CTU/ATP civile ---
  {
    id: 'ctu_civile_rc_civile',
    label: 'Responsabilità civile',
    description: 'CTU/ATP in ambito civile per responsabilità civile',
    categoryId: 2,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['rc_auto'],
    priority: false,
  },
  {
    id: 'ctu_civile_infortuni',
    label: 'Infortuni',
    description: 'CTU/ATP in ambito civile per infortuni',
    categoryId: 2,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['infortuni'],
    priority: false,
  },
  {
    id: 'ctu_civile_malattia',
    label: 'Malattia',
    description: 'CTU/ATP in ambito civile per malattia',
    categoryId: 2,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale'],
    priority: false,
  },
  {
    id: 'ctu_civile_resp_prof',
    label: 'Responsabilità professionale',
    description: 'CTU/ATP in ambito civile per responsabilità professionale',
    categoryId: 2,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['generica'],
    priority: false,
  },

  // --- Cat 3: CTU/ATP previdenziale ---
  {
    id: 'ctu_prev_dlgs62_accertamento',
    label: 'Ricorso contro verbale di accertamento D.Lgs. 62/2024',
    description: 'Ricorso contro verbale di accertamento ai sensi del D.Lgs. 62/2024',
    categoryId: 3,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale_dlgs62'],
    priority: false,
  },
  {
    id: 'ctu_prev_dlgs62_progetto_vita',
    label: 'Ricorso sul progetto di vita D.Lgs. 62/2024',
    description: 'Ricorso sul progetto di vita ai sensi del D.Lgs. 62/2024',
    categoryId: 3,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale_dlgs62'],
    priority: false,
  },
  {
    id: 'ctu_prev_inv_civile',
    label: 'Ricorso Invalidità Civile generica',
    description: 'Ricorso per assegno o pensione di invalidità civile',
    categoryId: 3,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale_inv_civile'],
    priority: false,
  },
  {
    id: 'ctu_prev_accompagnamento',
    label: 'Ricorso indennità di Accompagnamento L. 18/1980',
    description: 'Ricorso per indennità di accompagnamento ai sensi della L. 18/1980',
    categoryId: 3,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale_inv_civile'],
    priority: false,
  },
  {
    id: 'ctu_prev_l104',
    label: 'Ricorso L. 104 (condizione di disabilità)',
    description: 'Ricorso per condizione di disabilità ai sensi della L. 104/1992',
    categoryId: 3,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale_inv_civile'],
    priority: false,
  },
  {
    id: 'ctu_prev_l222',
    label: 'Ricorso L. 222/1984',
    description: 'Ricorso per assegno ordinario o pensione di inabilità INPS',
    categoryId: 3,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale_inv_civile'],
    priority: false,
  },
  {
    id: 'ctu_prev_altri_inps',
    label: 'Altri ricorsi INPS',
    description: 'Cecità L. 138/2001, sordità civile, indennità di frequenza, vittime del dovere, etc.',
    categoryId: 3,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['previdenziale_inv_civile'],
    priority: false,
  },

  // --- Cat 4: CTU/ATP INAIL ---
  {
    id: 'ctu_inail_malattia_prof',
    label: 'Malattia professionale',
    description: 'CTU/ATP INAIL per malattia professionale',
    categoryId: 4,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['inail_malattia_prof'],
    priority: false,
  },
  {
    id: 'ctu_inail_infortunio',
    label: 'Infortunio sul lavoro',
    description: 'CTU/ATP INAIL per infortunio sul lavoro',
    categoryId: 4,
    impliedRole: 'ctu',
    pipelineMode: 'full',
    legacyCaseTypes: ['inail_infortunio'],
    priority: false,
  },

  // --- Cat 5: Parere pro veritate ---
  {
    id: 'parere_pro_veritate',
    label: 'Parere pro veritate',
    description: 'Parere motivato sulla sussistenza di profili di responsabilità professionale medica',
    categoryId: 5,
    impliedRole: 'stragiudiziale',
    pipelineMode: 'full',
    legacyCaseTypes: ['generica'],
    priority: false,
  },

  // --- Cat 6: Parere scopo riserva ---
  {
    id: 'parere_scopo_riserva',
    label: 'Parere scopo riserva',
    description: 'Parere preventivo a scopo prognostico o di riserva tecnica per assicurazioni',
    categoryId: 6,
    impliedRole: 'stragiudiziale',
    pipelineMode: 'full',
    legacyCaseTypes: ['opinione_prognostica'],
    priority: false,
  },

  // --- Cat 7: Analisi documenti sanitari ---
  {
    id: 'analisi_doc_sanitari',
    label: 'Analisi e cronistoria documenti sanitari',
    description: 'Trascrizione estrattiva e dettagliata della documentazione medico-sanitaria',
    categoryId: 7,
    impliedRole: null,
    pipelineMode: 'extraction_only',
    legacyCaseTypes: ['generica'],
    priority: true,
  },

  // --- Cat 8: Analisi documenti giudiziari ---
  {
    id: 'analisi_doc_giudiziari',
    label: 'Analisi e cronistoria documenti giudiziari',
    description: 'Trascrizione estrattiva e dettagliata della documentazione giudiziaria',
    categoryId: 8,
    impliedRole: null,
    pipelineMode: 'extraction_only',
    legacyCaseTypes: ['generica'],
    priority: true,
  },

  // --- Cat 9: Analisi spese mediche ---
  {
    id: 'analisi_spese_mediche',
    label: 'Analisi spese mediche',
    description: 'Gestione congruità spese mediche e farmacologiche',
    categoryId: 9,
    impliedRole: null,
    pipelineMode: 'expenses_only',
    legacyCaseTypes: ['analisi_spese_mediche'],
    priority: false,
  },

  // --- Cat 10: Anonimizzatore ---
  {
    id: 'anonimizzatore',
    label: 'Anonimizzatore',
    description: 'Anonimizzazione e pseudonimizzazione di documenti medico-legali',
    categoryId: 10,
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

/** Get all modules for a given category */
export function getModulesByCategory(categoryId: ModuleCategoryId): ModuleDefinition[] {
  return MODULE_CATALOG.filter((m) => m.categoryId === categoryId);
}

/** All valid module IDs */
export const ALL_MODULE_IDS: readonly ModuleId[] = MODULE_CATALOG.map((m) => m.id);
