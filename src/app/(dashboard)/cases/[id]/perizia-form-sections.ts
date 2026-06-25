/**
 * Definizione e selezione per ruolo delle sezioni del form "Dati perizia".
 *
 * Logica pura (niente React) così è testabile in node: il form (presentazione)
 * importa `buildVisibleSections` e renderizza l'elenco risultante.
 *
 * La stragiudiziale segue lo schema Antoniazzi (perizia di parte): NON ha contesto
 * giudiziario, quindi le sezioni del Tribunale (intestazione), i termini processuali
 * (date) e i Quesiti del Giudice non vanno chieste al perito.
 */

export interface SectionDef {
  id: string;
  title: string;
  fields: string[];
}

/** Sezioni con senso SOLO in ambito giudiziario (CTU/CTP) — nascoste in stragiudiziale. */
export const COURT_ONLY_SECTION_IDS = ['intestazione', 'date', 'quesiti'] as const;

/** Sezioni base, comuni a tutti i ruoli (poi filtrate per ruolo). */
export const BASE_SECTIONS: SectionDef[] = [
  { id: 'paziente', title: 'Dati Paziente', fields: ['patientFullName', 'patientDateOfBirth', 'patientAddress', 'patientFiscalCode', 'patientPhone'] },
  { id: 'intestazione', title: 'Intestazione Perizia', fields: ['tribunale', 'sezione', 'rgNumber', 'tipoProcedimento', 'judgeName', 'fondoSpese', 'oggettoIncarico'] },
  { id: 'parti', title: 'Parti e Consulenti', fields: ['ctuName', 'ctuTitle', 'specialita', 'alboNumber', 'ctuEmail', 'ctuPec', 'collaboratoreName', 'collaboratoreTitle', 'coCtuName', 'coCtuTitle', 'parteRicorrente', 'parteResistente', 'ctpRicorrente', 'ctpResistente'] },
  { id: 'date', title: 'Date', fields: ['dataIncarico', 'dataOperazioni', 'dataDeposito', 'termineBozza', 'termineOsservazioni'] },
  { id: 'quesiti', title: 'Quesiti del Giudice', fields: [] }, // special handling
  { id: 'esameObiettivo', title: 'Esame Obiettivo', fields: ['esameObiettivo'] },
];

/**
 * Sezioni compilate dal perito SOLO per le perizie RC medico-legali.
 * I dati anamnestici e "Il Fatto e la Storia Clinica" confluiscono nel report
 * come testo del perito (deterministico, vedi anamnesi-template + section-catalog).
 */
export const RC_PERITO_SECTIONS: SectionDef[] = [
  { id: 'ilFatto', title: 'Il Fatto e la Storia Clinica', fields: ['ilFattoEStoriaClinica'] },
  {
    id: 'anamnesi',
    title: 'Dati Anamnestici',
    fields: [
      'anamnesiFamiliare', 'anamnesiFisiologica', 'pesoKg', 'altezzaCm',
      'anamnesiPatologicaRemota', 'anamnesiPatologicaProssima',
      'anamnesiFarmacologica', 'anamnesiLavorativa',
    ],
  },
];

/** Sezione speciale (sempre presente, sempre ultima): selettore delle sezioni del report. */
export const SEZIONI_REPORT_SECTION: SectionDef = { id: 'sezioniReport', title: 'Sezioni del report', fields: [] };

const COURT_ONLY = new Set<string>(COURT_ONLY_SECTION_IDS);

/**
 * Costruisce l'elenco delle sezioni da mostrare nel form in base al ruolo del caso.
 * - stragiudiziale → niente sezioni giudiziarie (intestazione/date/quesiti)
 * - RC (isRC) → aggiunge le sezioni anamnesi + "Il Fatto"
 * - il selettore "Sezioni del report" è sempre l'ultima.
 *
 * Ritorna sempre un nuovo array (non muta le costanti).
 */
export function buildVisibleSections(params: { role: string; isRC: boolean }): SectionDef[] {
  const { role, isRC } = params;
  const base = role === 'stragiudiziale'
    ? BASE_SECTIONS.filter((s) => !COURT_ONLY.has(s.id))
    : BASE_SECTIONS;
  const withRc = isRC ? [...base, ...RC_PERITO_SECTIONS] : [...base];
  return [...withRc, SEZIONI_REPORT_SECTION];
}
