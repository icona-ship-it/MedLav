import type { CaseTypeKnowledge } from '../types';

export const ERRORE_DIAGNOSTICO_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'errore_diagnostico',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali, del quesito peritale e delle conclusioni essenziali.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 500 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica dettagliata degli eventi clinici rilevanti, con date, strutture sanitarie e operatori coinvolti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'percorso_diagnostico',
      title: 'Ricostruzione del Percorso Diagnostico',
      description: 'Ricostruzione dettagliata della sequenza degli esami diagnostici prescritti e eseguiti, delle interpretazioni formulate, delle ipotesi diagnostiche considerate e degli eventuali approfondimenti omessi.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'analisi_errore',
      title: 'Analisi dell\'Errore Diagnostico',
      description: 'Classificazione e analisi dell\'errore diagnostico: errore di omissione (mancata prescrizione esami), errore di ritardo (esami prescritti tardivamente), errore di interpretazione (errata lettura dei risultati). Valutazione dell\'impatto dell\'errore sull\'evoluzione clinica.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'nesso_causale',
      title: 'Nesso Causale',
      description: 'Analisi del nesso di causalita tra la condotta sanitaria e il danno lamentato, valutazione delle concause preesistenti, concomitanti e sopravvenute.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi ai fini della valutazione medico-legale, criticita riscontrate, conformita o difformita rispetto alle buone pratiche cliniche.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Sintomo - diagnosi (soglia di attenzione generica)',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 30,
      source: 'Criterio medico-legale - Ritardi superiori a 30 giorni dal sintomo alla diagnosi richiedono specifica giustificazione clinica',
    },
  ],
  commonAnomalyPatterns: [
    'Mancata prescrizione di esami diagnostici indicati dal quadro clinico e dalla sintomatologia',
    'Errore nell\'interpretazione di referti radiologici, istologici o di laboratorio',
    'Mancato collegamento di sintomi e segni clinici convergenti verso una diagnosi specifica',
    'Sottovalutazione di reperti patologici o risultati anomali di esami diagnostici',
    'Mancata o ritardata comunicazione di risultati critici al paziente o al medico curante',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    'Invalidita Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'Diagnosi differenziale', definition: 'Processo logico-clinico di esclusione progressiva delle possibili cause di un quadro sintomatologico, fino a giungere alla diagnosi piu probabile. La mancata considerazione di diagnosi plausibili e un indicatore di errore diagnostico.' },
    { term: 'Sensibilita e specificita', definition: 'Sensibilita: capacita di un test di identificare correttamente i malati (veri positivi). Specificita: capacita di identificare correttamente i sani (veri negativi). Parametri fondamentali per valutare l\'appropriatezza della scelta del test diagnostico.' },
    { term: 'Valore predittivo', definition: 'Valore predittivo positivo (VPP): probabilita che un risultato positivo corrisponda a vera malattia. Valore predittivo negativo (VPN): probabilita che un risultato negativo corrisponda a vera assenza di malattia. Dipendono dalla prevalenza.' },
    { term: 'Errore di tipo I e tipo II', definition: 'Errore di tipo I (falso positivo): diagnosi di malattia in soggetto sano. Errore di tipo II (falso negativo): mancata diagnosi in soggetto malato. In ambito medico-legale, l\'errore di tipo II e generalmente piu rilevante per le sue conseguenze.' },
    { term: 'Gold standard diagnostico', definition: 'L\'esame o la procedura di riferimento considerata la piu accurata per confermare o escludere una diagnosi. La mancata esecuzione del gold standard quando indicato puo configurare un errore diagnostico.' },
  ],
  synthesisGuidance: `Nell'analisi dell'errore diagnostico, ricostruire meticolosamente il percorso diagnostico effettivamente
seguito, confrontandolo con quello che sarebbe stato indicato sulla base delle linee guida e delle buone
pratiche cliniche. Classificare l'errore in una delle categorie: errore di omissione (esame non prescritto),
errore di ritardo (esame prescritto ma non tempestivamente), errore di interpretazione (risultato
disponibile ma mal interpretato), errore di comunicazione (risultato critico non comunicato).
Quantificare il ritardo diagnostico in giorni e analizzare l'impatto sulla prognosi e sulle opzioni
terapeutiche. Valutare se il quadro clinico presentava red flags o sintomi d'allarme che avrebbero
dovuto indirizzare il ragionamento diagnostico. Esaminare se il percorso diagnostico ha rispettato
il criterio della diagnosi differenziale e se le ipotesi alternative sono state adeguatamente considerate
ed escluse. Considerare il contesto in cui l'errore e avvenuto (pronto soccorso, ambulatorio, reparto)
e le risorse diagnostiche ragionevolmente disponibili.`,
} as const;
