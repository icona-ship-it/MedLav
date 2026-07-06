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
 * Ordine RC (Lavini 2026-07-05): i Dati Anamnestici sono la PRIMA cosa da
 * compilare → in cima; seguono i dati identificativi, l'esame obiettivo e
 * "Il Fatto e la Storia Clinica" in coda.
 *
 * La scelta delle sezioni del report NON è più qui: vive nello step Elaborazione
 * (processing-section), subito prima della generazione.
 *
 * Ritorna sempre un nuovo array (non muta le costanti).
 */
export function buildVisibleSections(params: { isRC: boolean }): SectionDef[] {
  if (!params.isRC) return [...BASE_SECTIONS];
  // Anamnesi in cima, il resto (Il Fatto) in coda. Nessuna non-null assertion:
  // se l'id 'anamnesi' venisse rinominato, si ricade sull'ordine sicuro
  // (review 2026-07-06) invece di produrre un `undefined` silenzioso.
  const anamnesi = RC_PERITO_SECTIONS.find((s) => s.id === 'anamnesi');
  if (!anamnesi) return [...BASE_SECTIONS, ...RC_PERITO_SECTIONS];
  const rest = RC_PERITO_SECTIONS.filter((s) => s.id !== 'anamnesi');
  return [anamnesi, ...BASE_SECTIONS, ...rest];
}
