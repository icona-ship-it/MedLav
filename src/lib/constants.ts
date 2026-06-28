/**
 * Shared constants and label mappings used across the application.
 * Single source of truth — import from here, never duplicate.
 */

import { MODULE_CATALOG, MODULE_CATEGORIES } from '@/types/modules';
import type { ModuleId } from '@/types/modules';

// Re-export module system for convenience
export { MODULE_CATALOG, MODULE_CATEGORIES };

/**
 * Feature flag: condivisione di un caso via LINK PUBBLICO (token, /shared/[token]).
 * DISATTIVATA (2026-06-10): la pagina pubblica serviva — nel payload serializzato
 * del componente client — dati identificativi + clinici Art.9 (nome/CF/anamnesi via
 * report e perizia_metadata) su un link non autenticato e inoltrabile. Resta OFF
 * finché la feature non viene ridisegnata (es. accesso autenticato o report
 * anonimizzato). Mettere a `true` per riabilitarla. La revoca dei link esistenti
 * (DELETE) resta sempre attiva.
 */
export const PUBLIC_SHARING_ENABLED = false;

/** Label lookup for module IDs */
export const moduleLabels: Record<string, string> = Object.fromEntries(
  MODULE_CATALOG.map((m) => [m.id, m.label]),
);

/** Full label with category prefix */
export function getModuleFullLabel(moduleId: ModuleId): string {
  const mod = MODULE_CATALOG.find((m) => m.id === moduleId);
  if (!mod) return moduleId;
  const cat = MODULE_CATEGORIES.find((c) => c.id === mod.categoryId);
  return cat ? `${cat.label} — ${mod.label}` : mod.label;
}

// --- Case Types ---

export const CASE_TYPES = [
  { value: 'ortopedica', label: 'Malasanità Ortopedica' },
  { value: 'oncologica', label: 'Ritardo Diagnostico Oncologico' },
  { value: 'ostetrica', label: 'Errore Ostetrico' },
  { value: 'anestesiologica', label: 'Errore Anestesiologico' },
  { value: 'infezione_nosocomiale', label: 'Infezione Nosocomiale' },
  { value: 'errore_diagnostico', label: 'Errore Diagnostico' },
  { value: 'rc_auto', label: 'RC Auto — Responsabilità Civile Automobilistica' },
  { value: 'previdenziale', label: 'Previdenziale — Invalidità Civile / Pensionistica' },
  { value: 'infortuni', label: 'Infortuni — Infortuni sul Lavoro e Malattia Professionale' },
  { value: 'perizia_assicurativa', label: 'Perizia Assicurativa — Valutazione Medico-Legale per Compagnia' },
  { value: 'analisi_spese_mediche', label: 'Analisi Spese Mediche — Congruità e Rimborsabilità' },
  { value: 'opinione_prognostica', label: 'Opinione Prognostica — Prognosi e Riserva Assicurativa' },
  { value: 'generica', label: 'Responsabilità Professionale Generica' },
] as const;

export const caseTypeLabels: Record<string, string> = Object.fromEntries(
  CASE_TYPES.map((t) => [t.value, t.label]),
);

// --- Case Roles ---

export const CASE_ROLES = [
  { value: 'ctu', label: 'CTU - Consulente Tecnico d\'Ufficio' },
  { value: 'ctp', label: 'CTP - Consulente Tecnico di Parte' },
  { value: 'stragiudiziale', label: 'Perito Stragiudiziale' },
] as const;

// --- Case Status ---

export const statusConfig: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' | 'outline' }> = {
  bozza: { label: 'Bozza', variant: 'secondary' },
  in_revisione: { label: 'In Revisione', variant: 'warning' },
  definitivo: { label: 'Pronto al deposito', variant: 'success' },
  archiviato: { label: 'Archiviato', variant: 'outline' },
};

// --- Document Types ---

export const DOCUMENT_TYPES = [
  { value: 'cartella_clinica', label: 'Cartella Clinica' },
  { value: 'referto_specialistico', label: 'Referto Specialistico' },
  { value: 'esame_strumentale', label: 'Esame Strumentale' },
  { value: 'esame_laboratorio', label: 'Esame di Laboratorio' },
  { value: 'lettera_dimissione', label: 'Lettera di Dimissione' },
  { value: 'certificato', label: 'Certificato Medico' },
  { value: 'perizia_precedente', label: 'Perizia Precedente' },
  { value: 'spese_mediche', label: 'Spese Mediche' },
  { value: 'memoria_difensiva', label: 'Memoria Difensiva' },
  { value: 'perizia_ctp', label: 'Perizia CTP' },
  { value: 'perizia_ctu', label: 'Perizia CTU' },
  { value: 'altro', label: 'Altro' },
] as const;

export const documentTypeLabels: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t.value, t.label]),
);

// --- Event Types ---

export const EVENT_TYPES = [
  { value: 'visita', label: 'Visita' },
  { value: 'esame', label: 'Esame' },
  { value: 'diagnosi', label: 'Diagnosi' },
  { value: 'intervento', label: 'Intervento' },
  { value: 'terapia', label: 'Terapia' },
  { value: 'ricovero', label: 'Ricovero' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'referto', label: 'Referto' },
  { value: 'prescrizione', label: 'Prescrizione' },
  { value: 'consenso', label: 'Consenso' },
  { value: 'complicanza', label: 'Complicanza' },
  { value: 'spesa_medica', label: 'Spesa Medica' },
  { value: 'documento_amministrativo', label: 'Documento Amministrativo' },
  { value: 'certificato', label: 'Certificato' },
  { value: 'altro', label: 'Altro' },
] as const;

/**
 * Event types that are bureaucratic/financial and must be EXCLUDED from
 * the clinical chronology. Used by exports, calculations, and anomaly
 * detectors so we don't mix patient ticket payments with medical events.
 *
 * Trigger: regressione CASO-2026-154 — perito Lavini found that
 * SSN cost notices, ticket payments, and admin documents (avviso pagamento)
 * were appearing in the cronistoria medica. They don't belong there: any
 * patient-paid expense goes in the dedicated "Spese Mediche" section via
 * expenses_only pipeline; SSN-paid procedures go nowhere (they're internal
 * billing, not perito-relevant data).
 *
 * The set is small and stable. Single source of truth — every consumer
 * imports this rather than redefining locally.
 */
export const NON_CLINICAL_EVENT_TYPES: ReadonlySet<string> = new Set([
  'documento_amministrativo',
  'spesa_medica',
  'certificato',
]);

/** Inverse helper: true when the event represents a clinical fact. */
export function isClinicalEvent(eventType: string): boolean {
  return !NON_CLINICAL_EVENT_TYPES.has(eventType);
}

// --- Source Types ---

export const SOURCE_TYPES = [
  { value: 'cartella_clinica', label: 'Cartella Clinica' },
  { value: 'referto_controllo', label: 'Referto Controllo' },
  { value: 'esame_strumentale', label: 'Esame Strumentale' },
  { value: 'esame_ematochimico', label: 'Esami Ematochimici' },
  { value: 'altro', label: 'Altro' },
] as const;

export const sourceLabels: Record<string, string> = Object.fromEntries(
  SOURCE_TYPES.map((t) => [t.value, t.label]),
);

/**
 * Source labels for export documents (DOCX/HTML) with prefix notation.
 */
export const sourceLabelsExport: Record<string, string> = {
  cartella_clinica: 'FONTE A - Cartella Clinica',
  referto_controllo: 'FONTE B - Referto Controllo',
  esame_strumentale: 'FONTE C - Esame Strumentale',
  esame_ematochimico: 'FONTE D - Esami Ematochimici',
  altro: 'Altro',
};

// --- Anomaly Types ---

export const anomalyTypeLabels: Readonly<Record<string, string>> = {
  ritardo_diagnostico: 'Ritardo Diagnostico',
  gap_post_chirurgico: 'Gap Post-Chirurgico',
  gap_documentale: 'Gap Documentale',
  complicanza_non_gestita: 'Complicanza Non Gestita',
  consenso_non_documentato: 'Consenso Non Documentato',
  diagnosi_contraddittoria: 'Diagnosi Contraddittoria',
  terapia_senza_followup: 'Terapia Senza Follow-up',
  valore_clinico_critico: 'Valore Clinico Critico',
  sequenza_temporale_violata: 'Sequenza Temporale Violata',
};

// --- Processing Status ---

export const processingLabels: Record<string, string> = {
  caricato: 'Caricato',
  in_coda: 'In attesa',
  ocr_in_corso: 'Lettura documenti',
  classificazione_completata: 'In attesa di revisione',
  estrazione_in_corso: 'Analisi contenuto',
  validazione_in_corso: 'Controllo qualità',
  completato: 'Completato',
  errore: 'Errore',
};
