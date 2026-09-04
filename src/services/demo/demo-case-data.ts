/**
 * Caso dimostrativo (ambiente demo, 2026-09-04). Dati INTERAMENTE FITTIZI —
 * universo "Cittàdemo" della regola security.md (via degli Esempi, Ospedale
 * Civile di Cittàdemo, cognomi tipo Demprova). Nessun dato di casi reali.
 *
 * Scopo: far provare ai medici in pochi minuti la cronistoria com'è OGGI
 * (ambito temporale corrente/riferito/programmato, trascrizione per documento,
 * appendice di verifica, evento "da controllare") senza pipeline né crediti.
 * Le pagine sono il "testo OCR" e diventano anche il PDF caricato nello storage,
 * così "apri documento" funziona davvero.
 */

export const DEMO_CODE_PREFIX = 'DEMO-';

export type DemoDocumentType = 'cartella_clinica' | 'referto_specialistico' | 'esame_strumentale' | 'spese_mediche';
export type DemoTemporalScope = 'corrente' | 'retrospettivo' | 'programmato';

export interface DemoPage {
  pageNumber: number;
  text: string;
}

export interface DemoDocument {
  key: string;
  fileName: string;
  documentType: DemoDocumentType;
  pages: ReadonlyArray<DemoPage>;
}

export interface DemoEvent {
  orderNumber: number;
  eventDate: string;
  datePrecision: 'giorno' | 'mese' | 'anno';
  eventType: 'visita' | 'esame' | 'diagnosi' | 'terapia' | 'follow-up' | 'prescrizione' | 'spesa_medica';
  title: string;
  description: string;
  sourceType: 'cartella_clinica' | 'referto_controllo' | 'esame_strumentale' | 'altro';
  diagnosis?: string;
  doctor?: string;
  facility?: string;
  confidence: number;
  requiresVerification: boolean;
  reliabilityNotes?: string;
  temporalScope: DemoTemporalScope;
  documentKey: string;
  sourcePages: ReadonlyArray<number>;
  /** Sottostringa ESATTA della pagina citata (test di invariante). */
  sourceText: string;
}

export const DEMO_CASE = {
  patientInitials: 'M.D.',
  /** Nome fittizio del periziando: serve all'export anonimizzato (guardia E-P2). */
  patientFullName: 'Mario Demprova',
  practiceReference: 'Pratica dimostrativa — dati fittizi',
  notes: 'Caso dimostrativo con documenti interamente fittizi (universo "Cittàdemo"). Serve a esplorare la cronistoria: eventi correnti, riferiti in anamnesi e programmati, trascrizione per documento e appendice di verifica. Nessun credito viene consumato.',
  caseType: 'ortopedica' as const,
} as const;

const OSPEDALE = 'Ospedale Civile di Cittàdemo';
const POLIAMBULATORIO = 'Poliambulatorio Demo di Cittàdemo';
const DOTT_PS = 'Dott. Esemplari Luca';
const DOTT_ORTO = 'Dott.ssa Fittizi Marta';
const DOTT_RX = 'Dott. Campione Andrea';

export const DEMO_DOCUMENTS: ReadonlyArray<DemoDocument> = [
  {
    key: 'verbale-ps',
    fileName: 'verbale-pronto-soccorso-demo.pdf',
    documentType: 'cartella_clinica',
    pages: [
      {
        pageNumber: 1,
        text: [
          'OSPEDALE CIVILE DI CITTÀDEMO',
          'Pronto Soccorso - Verbale di accesso n. PS/2026/000123',
          'Paziente: DEMPROVA MARIO, nato il 01/01/1970, residente in via degli Esempi 1, Cittàdemo',
          'Data e ora di accesso: 10/02/2026 ore 09:15 - Codice triage: verde',
          'Motivo dell\'accesso: trauma da caduta accidentale in bicicletta avvenuta in data odierna.',
          'Anamnesi: riferisce pregressa frattura della clavicola sinistra nel 2019, trattata conservativamente, senza esiti. Nega allergie. Nega terapie in atto.',
          'Esame obiettivo: polso destro tumefatto e dolente alla palpazione della regione distale del radio, limitazione funzionale antalgica. Non deficit neurovascolari distali. Escoriazioni superficiali al gomito destro.',
          'Esami eseguiti: RX polso destro in due proiezioni.',
        ].join('\n'),
      },
      {
        pageNumber: 2,
        text: [
          'Referto RX polso destro (10/02/2026): frattura composta dell\'epifisi distale del radio, senza interessamento articolare. Ulna integra.',
          'Diagnosi: frattura composta dell\'epifisi distale del radio destro.',
          'Trattamento: immobilizzazione con apparecchio gessato antibrachio-metacarpale. Terapia antalgica al bisogno (paracetamolo 1000 mg).',
          'Prognosi: giorni 30 salvo complicazioni.',
          'Indicazioni: controllo ortopedico programmato a 7 giorni presso l\'ambulatorio di Ortopedia; tenere l\'arto in scarico; recarsi nuovamente in Pronto Soccorso in caso di dolore ingravescente, parestesie o cianosi delle dita.',
          `Medico di Pronto Soccorso: ${DOTT_PS}`,
        ].join('\n'),
      },
    ],
  },
  {
    key: 'visita-ortopedica',
    fileName: 'referto-visita-ortopedica-demo.pdf',
    documentType: 'referto_specialistico',
    pages: [
      {
        pageNumber: 1,
        text: [
          'OSPEDALE CIVILE DI CITTÀDEMO - U.O. ORTOPEDIA E TRAUMATOLOGIA',
          'Referto di visita ambulatoriale del 17/02/2026',
          'Paziente: Demprova Mario',
          'Motivo: controllo a 7 giorni da frattura composta dell\'epifisi distale del radio destro (accesso in PS del 10/02/2026).',
          'Esame obiettivo: apparecchio gessato integro e ben tollerato; dita calde, mobili, non edema. Dolore in riduzione.',
          'Conclusioni: quadro regolare. Si conferma l\'immobilizzazione gessata.',
          'Programma: RX di controllo e rimozione dell\'apparecchio gessato prevista il 12/03/2026. Successivamente ciclo di fisioterapia.',
          `${DOTT_ORTO} - Specialista in Ortopedia`,
        ].join('\n'),
      },
    ],
  },
  {
    key: 'rx-controllo',
    fileName: 'rx-polso-controllo-demo.pdf',
    documentType: 'esame_strumentale',
    pages: [
      {
        pageNumber: 1,
        text: [
          'POLIAMBULATORIO DEMO DI CITTÀDEMO - Servizio di Radiologia',
          'Esame: RX polso destro (2 proiezioni) - Data: 12/03/2026',
          'Paziente: Demprova Mario',
          'Quesito clinico: controllo evolutivo di frattura dell\'epifisi distale del radio destro del 10/02/2026.',
          'Referto: in atto i fenomeni di consolidazione della frattura dell\'epifisi distale del radio, con callo osseo in formazione. Allineamento conservato. Non nuove lesioni ossee.',
          'Conclusioni: consolidazione in atto.',
          'Nota clinica del 12/03/2026: rimosso l\'apparecchio gessato. Prescritto ciclo di 10 sedute di fisioterapia (mobilizzazione e recupero della forza) con inizio previsto il 20/03/2026.',
          `${DOTT_RX} - Medico Radiologo`,
        ].join('\n'),
      },
    ],
  },
  {
    key: 'fattura-fisioterapia',
    fileName: 'fattura-fisioterapia-demo.pdf',
    documentType: 'spese_mediche',
    pages: [
      {
        pageNumber: 1,
        text: [
          'CENTRO FISIOTERAPICO DEMO S.R.L. - via degli Esempi 10, Cittàdemo - P.IVA 00000000000',
          'FATTURA n. 45 del 30/04/2026',
          'Intestatario: Demprova Mario - via degli Esempi 1, Cittàdemo',
          'Descrizione: ciclo di 10 sedute di fisioterapia (mobilizzazione polso destro) dal 20/03/2026 al 24/04/2026',
          'Prestazione sanitaria esente IVA art. 10 DPR 633/72',
          'Totale: 400,00 euro',
          'Pagato con bonifico in data 30/04/2026.',
        ].join('\n'),
      },
    ],
  },
];

export const DEMO_EVENTS: ReadonlyArray<DemoEvent> = [
  {
    orderNumber: 1, eventDate: '2019-01-01', datePrecision: 'anno', eventType: 'diagnosi',
    title: 'Pregressa frattura della clavicola sinistra (riferita in anamnesi)',
    description: 'In anamnesi il paziente riferisce una pregressa frattura della clavicola sinistra nel 2019, trattata conservativamente e senza esiti.',
    sourceType: 'cartella_clinica', diagnosis: 'Pregressa frattura clavicola sinistra', facility: OSPEDALE,
    confidence: 80, requiresVerification: false, temporalScope: 'retrospettivo',
    documentKey: 'verbale-ps', sourcePages: [1],
    sourceText: 'pregressa frattura della clavicola sinistra nel 2019, trattata conservativamente, senza esiti',
  },
  {
    orderNumber: 2, eventDate: '2026-02-10', datePrecision: 'giorno', eventType: 'visita',
    title: 'Accesso in Pronto Soccorso per trauma da caduta in bicicletta',
    description: 'Accesso in Pronto Soccorso (codice verde) per trauma da caduta accidentale in bicicletta. Polso destro tumefatto e dolente, limitazione funzionale antalgica, non deficit neurovascolari.',
    sourceType: 'cartella_clinica', doctor: DOTT_PS, facility: OSPEDALE,
    confidence: 95, requiresVerification: false, temporalScope: 'corrente',
    documentKey: 'verbale-ps', sourcePages: [1],
    sourceText: 'trauma da caduta accidentale in bicicletta avvenuta in data odierna',
  },
  {
    orderNumber: 3, eventDate: '2026-02-10', datePrecision: 'giorno', eventType: 'esame',
    title: 'RX polso destro: frattura composta dell\'epifisi distale del radio',
    description: 'RX polso destro in due proiezioni: frattura composta dell\'epifisi distale del radio, senza interessamento articolare; ulna integra.',
    sourceType: 'cartella_clinica', diagnosis: 'Frattura composta dell\'epifisi distale del radio destro', doctor: DOTT_PS, facility: OSPEDALE,
    confidence: 92, requiresVerification: false, temporalScope: 'corrente',
    documentKey: 'verbale-ps', sourcePages: [2],
    sourceText: 'frattura composta dell\'epifisi distale del radio, senza interessamento articolare',
  },
  {
    orderNumber: 4, eventDate: '2026-02-10', datePrecision: 'giorno', eventType: 'terapia',
    title: 'Immobilizzazione con apparecchio gessato, prognosi 30 giorni',
    description: 'Confezionato apparecchio gessato antibrachio-metacarpale. Prognosi di 30 giorni salvo complicazioni.',
    sourceType: 'cartella_clinica', doctor: DOTT_PS, facility: OSPEDALE,
    confidence: 90, requiresVerification: false, temporalScope: 'corrente',
    documentKey: 'verbale-ps', sourcePages: [2],
    sourceText: 'immobilizzazione con apparecchio gessato antibrachio-metacarpale',
  },
  {
    orderNumber: 5, eventDate: '2026-02-10', datePrecision: 'giorno', eventType: 'terapia',
    title: 'Terapia antalgica al bisogno (paracetamolo 1000 mg)',
    description: 'Prescritta terapia antalgica al bisogno con paracetamolo 1000 mg. Posologia giornaliera e durata non indicate nel verbale.',
    sourceType: 'cartella_clinica', doctor: DOTT_PS, facility: OSPEDALE,
    confidence: 55, requiresVerification: true,
    reliabilityNotes: 'Posologia e durata della terapia non indicate nel verbale: da confermare sul documento originale.',
    temporalScope: 'corrente', documentKey: 'verbale-ps', sourcePages: [2],
    sourceText: 'Terapia antalgica al bisogno (paracetamolo 1000 mg)',
  },
  {
    orderNumber: 6, eventDate: '2026-02-17', datePrecision: 'giorno', eventType: 'follow-up',
    title: 'Controllo ortopedico a 7 giorni: quadro regolare, confermato il gesso',
    description: 'Visita ortopedica di controllo: apparecchio gessato integro e ben tollerato, dita calde e mobili, dolore in riduzione. Confermata l\'immobilizzazione gessata.',
    sourceType: 'referto_controllo', doctor: DOTT_ORTO, facility: `${OSPEDALE} - U.O. Ortopedia e Traumatologia`,
    confidence: 93, requiresVerification: false, temporalScope: 'corrente',
    documentKey: 'visita-ortopedica', sourcePages: [1],
    sourceText: 'quadro regolare. Si conferma l\'immobilizzazione gessata',
  },
  {
    orderNumber: 7, eventDate: '2026-03-12', datePrecision: 'giorno', eventType: 'follow-up',
    title: 'RX di controllo e rimozione del gesso previste (programmate nella visita del 17/02/2026)',
    description: 'Nella visita del 17/02/2026 vengono programmate la RX di controllo e la rimozione dell\'apparecchio gessato per il 12/03/2026, seguite da un ciclo di fisioterapia.',
    sourceType: 'referto_controllo', doctor: DOTT_ORTO, facility: `${OSPEDALE} - U.O. Ortopedia e Traumatologia`,
    confidence: 85, requiresVerification: false, temporalScope: 'programmato',
    documentKey: 'visita-ortopedica', sourcePages: [1],
    sourceText: 'RX di controllo e rimozione dell\'apparecchio gessato prevista il 12/03/2026',
  },
  {
    orderNumber: 8, eventDate: '2026-03-12', datePrecision: 'giorno', eventType: 'esame',
    title: 'RX polso destro di controllo: consolidazione in atto',
    description: 'RX polso destro (2 proiezioni): fenomeni di consolidazione in atto con callo osseo in formazione, allineamento conservato, non nuove lesioni ossee.',
    sourceType: 'esame_strumentale', diagnosis: 'Frattura epifisi distale radio destro in consolidazione', doctor: DOTT_RX, facility: POLIAMBULATORIO,
    confidence: 94, requiresVerification: false, temporalScope: 'corrente',
    documentKey: 'rx-controllo', sourcePages: [1],
    sourceText: 'in atto i fenomeni di consolidazione della frattura dell\'epifisi distale del radio, con callo osseo in formazione',
  },
  {
    orderNumber: 9, eventDate: '2026-03-12', datePrecision: 'giorno', eventType: 'terapia',
    title: 'Rimozione dell\'apparecchio gessato',
    description: 'Rimosso l\'apparecchio gessato dopo la RX di controllo.',
    sourceType: 'esame_strumentale', doctor: DOTT_RX, facility: POLIAMBULATORIO,
    confidence: 88, requiresVerification: false, temporalScope: 'corrente',
    documentKey: 'rx-controllo', sourcePages: [1],
    sourceText: 'rimosso l\'apparecchio gessato',
  },
  {
    orderNumber: 10, eventDate: '2026-03-20', datePrecision: 'giorno', eventType: 'prescrizione',
    title: 'Ciclo di 10 sedute di fisioterapia (inizio previsto il 20/03/2026)',
    description: 'Prescritto ciclo di 10 sedute di fisioterapia per mobilizzazione e recupero della forza, con inizio previsto il 20/03/2026.',
    sourceType: 'esame_strumentale', doctor: DOTT_RX, facility: POLIAMBULATORIO,
    confidence: 86, requiresVerification: false, temporalScope: 'programmato',
    documentKey: 'rx-controllo', sourcePages: [1],
    sourceText: 'Prescritto ciclo di 10 sedute di fisioterapia',
  },
  {
    orderNumber: 11, eventDate: '2026-04-30', datePrecision: 'giorno', eventType: 'spesa_medica',
    title: 'Fattura n. 45 del 30/04/2026 — ciclo di fisioterapia, 400,00 euro',
    description: 'Fattura del Centro Fisioterapico Demo per il ciclo di 10 sedute di fisioterapia (20/03/2026 - 24/04/2026): 400,00 euro, esente IVA.',
    sourceType: 'altro', facility: 'Centro Fisioterapico Demo S.r.l.',
    confidence: 90, requiresVerification: false, temporalScope: 'corrente',
    documentKey: 'fattura-fisioterapia', sourcePages: [1],
    sourceText: 'Totale: 400,00 euro',
  },
];
