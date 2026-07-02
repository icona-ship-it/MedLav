/**
 * Definizione e selezione delle sezioni del form "Dati perizia".
 *
 * Logica pura (niente React) così è testabile in node: il form (presentazione)
 * importa `buildVisibleSections` e renderizza l'elenco risultante.
 *
 * rc-mvp (review 2026-07-03): il form mostra SOLO sezioni i cui campi il
 * salvataggio persiste davvero (schema zod strict RC). Le sezioni giudiziali
 * (intestazione del Tribunale, termini processuali, Quesiti del Giudice) e i
 * campi CTP/co-perito sono spariti dallo schema: renderizzarli — anche per un
 * caso legacy — significherebbe raccogliere input e buttarlo via in silenzio.
 */

export interface SectionDef {
  id: string;
  title: string;
  fields: string[];
}

/** Sezioni base della perizia RC stragiudiziale. */
export const BASE_SECTIONS: SectionDef[] = [
  { id: 'paziente', title: 'Dati Paziente', fields: ['patientFullName', 'patientDateOfBirth', 'patientAddress', 'patientFiscalCode', 'patientPhone'] },
  { id: 'parti', title: 'Il Perito', fields: ['ctuName', 'ctuTitle', 'specialita', 'alboNumber', 'ctuEmail', 'ctuPec', 'collaboratoreName', 'collaboratoreTitle'] },
  { id: 'esameObiettivo', title: 'Esame Obiettivo', fields: ['esameObiettivo'] },
];

/**
 * Sezioni compilate dal perito per le perizie RC medico-legali.
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

/**
 * Costruisce l'elenco delle sezioni da mostrare nel form.
 * - RC (isRC) → aggiunge le sezioni anamnesi + "Il Fatto".
 *
 * La scelta delle sezioni del report NON è più qui: vive nello step Elaborazione
 * (processing-section), subito prima della generazione.
 *
 * Ritorna sempre un nuovo array (non muta le costanti).
 */
export function buildVisibleSections(params: { isRC: boolean }): SectionDef[] {
  return params.isRC ? [...BASE_SECTIONS, ...RC_PERITO_SECTIONS] : [...BASE_SECTIONS];
}
