import type { CaseTypeKnowledge } from '../types';

export const ANESTESIOLOGICA_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'anestesiologica',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali, del quesito peritale e delle conclusioni essenziali.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 500, max: 1000 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica dettagliata degli eventi clinici rilevanti, con date, strutture sanitarie e operatori coinvolti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'valutazione_preoperatoria',
      title: 'Valutazione Preoperatoria',
      description: 'Analisi della valutazione anestesiologica preoperatoria: classificazione ASA, valutazione del rischio anestesiologico, esami preoperatori, idoneita all\'intervento e adeguatezza del consenso informato.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 250 },
    },
    {
      id: 'gestione_anestesiologica',
      title: 'Gestione Anestesiologica Intraoperatoria',
      description: 'Valutazione della condotta anestesiologica intraoperatoria: scelta della tecnica anestesiologica, farmaci somministrati con dosaggi, monitoraggio dei parametri vitali, gestione delle complicanze intraoperatorie.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'nesso_causale',
      title: 'Nesso Causale',
      description: 'Analisi del nesso di causalita tra la condotta sanitaria e il danno lamentato, valutazione delle concause preesistenti, concomitanti e sopravvenute.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi ai fini della valutazione medico-legale, criticita riscontrate, conformita o difformita rispetto alle buone pratiche cliniche.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Visita anestesiologica preoperatoria - intervento chirurgico',
      expectedFollowUpDays: 7,
      expectedRecoveryDays: 30,
      criticalDelayThresholdDays: 30,
      source: 'Linee guida SIAARTI - Valutazione preoperatoria del paziente',
    },
    {
      procedure: 'Check-list di sicurezza pre-anestesia',
      expectedFollowUpDays: 0,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 0,
      source: 'OMS - Surgical Safety Checklist / SIAARTI - Standard monitoraggio anestesiologico',
    },
  ],
  commonAnomalyPatterns: [
    'Mancata o inadeguata valutazione delle vie aeree con intubazione difficile non prevista',
    'Intubazione difficile non prevista per assenza di valutazione Mallampati e pianificazione alternativa',
    'Errore nel dosaggio dei farmaci anestesiologici (sovra o sottodosaggio)',
    'Mancato monitoraggio continuo dei parametri vitali durante l\'intervento',
    'Reazione anafilattica non riconosciuta o non gestita tempestivamente secondo protocollo',
    'Risveglio intraoperatorio (awareness) per inadeguata profondita anestesiologica',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    'Invalidita Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'ASA score', definition: 'Classificazione dello stato fisico del paziente secondo l\'American Society of Anesthesiologists (ASA I-VI), utilizzata per stratificare il rischio anestesiologico preoperatorio.' },
    { term: 'Mallampati', definition: 'Classificazione (I-IV) della visibilita delle strutture orofaringee a bocca aperta, utilizzata per predire la difficolta di intubazione endotracheale. Un Mallampati elevato indica vie aeree potenzialmente difficili.' },
    { term: 'Intubazione', definition: 'Inserimento di un tubo endotracheale nelle vie aeree per garantire la ventilazione e la protezione delle vie aeree durante l\'anestesia generale.' },
    { term: 'Curarizzazione residua', definition: 'Persistenza dell\'effetto dei farmaci miorilassanti al termine dell\'intervento, con rischio di insufficienza respiratoria post-operatoria. Deve essere monitorata con il TOF (Train of Four).' },
    { term: 'BIS (Bispectral Index)', definition: 'Indice derivato dall\'analisi dell\'elettroencefalogramma utilizzato per monitorare la profondita dell\'anestesia (0-100). Valori tra 40 e 60 indicano un\'adeguata profondita anestesiologica.' },
    { term: 'Capnografia', definition: 'Monitoraggio continuo della concentrazione di CO2 nell\'aria espirata (EtCO2). Parametro essenziale per verificare il corretto posizionamento del tubo endotracheale e l\'adeguatezza della ventilazione.' },
  ],
  synthesisGuidance: `Nell'analisi del caso anestesiologico, verificare innanzitutto l'adeguatezza della valutazione
preoperatoria: classificazione ASA, valutazione delle vie aeree (Mallampati, distanza tiro-mentoniera,
apertura buccale), identificazione di fattori di rischio specifici e completezza del consenso informato
anestesiologico. Analizzare la scelta della tecnica anestesiologica in relazione al tipo di intervento,
alle condizioni del paziente e ai fattori di rischio identificati. Verificare il rispetto degli standard
di monitoraggio SIAARTI (ECG, pulsossimetria, capnografia, pressione arteriosa, temperatura).
Esaminare i farmaci somministrati con relativi dosaggi, tempi e modalita di somministrazione.
In caso di complicanza, valutare la tempestivita del riconoscimento e l'adeguatezza della gestione
secondo i protocolli e gli algoritmi raccomandati (es. algoritmo intubazione difficile, protocollo
anafilassi). Verificare il rispetto della Surgical Safety Checklist dell'OMS e la completezza
della documentazione anestesiologica (scheda anestesiologica, foglio terapia, cartella post-operatoria).`,
} as const;
