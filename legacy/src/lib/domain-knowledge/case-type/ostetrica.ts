import type { CaseTypeKnowledge } from '../types';

export const OSTETRICA_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'ostetrica',
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
      id: 'analisi_travaglio',
      title: 'Analisi del Travaglio e del Parto',
      description: 'Ricostruzione dettagliata dell\'evoluzione del travaglio e del parto: analisi del partogramma, decisioni cliniche, tempi di intervento, modalita del parto e complicanze intrapartum.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'ctg_analisi',
      title: 'Analisi del Tracciato Cardiotocografico',
      description: 'Interpretazione del tracciato CTG secondo la classificazione FIGO: analisi della frequenza cardiaca fetale di base, variabilita, accelerazioni, decelerazioni e contrattilita uterina.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'esiti_neonatali',
      title: 'Esiti Neonatali',
      description: 'Valutazione delle condizioni del neonato alla nascita: punteggio APGAR, pH del sangue funicolare, necessita di rianimazione, eventuali esiti neurologici e follow-up neonatologico.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 200 },
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
      procedure: 'Decisione cesareo urgente - nascita',
      expectedFollowUpDays: 0,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 0,
      source: 'Linee guida ACOG/SIGO - Il tempo decisione-nascita non deve superare i 30 minuti in caso di emergenza',
    },
    {
      procedure: 'CTG patologico - intervento operativo',
      expectedFollowUpDays: 0,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 0,
      source: 'Classificazione FIGO 2015 - Intervallo raccomandato 15-30 minuti per CTG patologico',
    },
    {
      procedure: 'Rottura membrane - parto (senza induzione)',
      expectedFollowUpDays: 0,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 1,
      source: 'Linee guida SIGO/AOGOI - Rottura prematura delle membrane a termine: parto entro 24 ore o induzione',
    },
  ],
  commonAnomalyPatterns: [
    'Mancata o errata interpretazione del tracciato CTG patologico con ritardo nell\'intervento',
    'Ritardo nel ricorso al taglio cesareo d\'urgenza oltre i tempi raccomandati',
    'Mancato monitoraggio continuo della frequenza cardiaca fetale in travaglio attivo',
    'Errore nella somministrazione o nel dosaggio di ossitocina con iperstimolazione uterina',
    'Lesione del plesso brachiale da manovre inadeguate in caso di distocia di spalla',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    'Invalidita Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'CTG (Cardiotocografia)', definition: 'Metodica di monitoraggio simultaneo della frequenza cardiaca fetale e dell\'attivita contrattile uterina. Il tracciato CTG e lo strumento principale per la sorveglianza del benessere fetale in travaglio.' },
    { term: 'Partogramma', definition: 'Rappresentazione grafica dell\'andamento del travaglio che registra la dilatazione cervicale, la discesa della parte presentata e i parametri vitali materno-fetali nel tempo.' },
    { term: 'APGAR score', definition: 'Punteggio (0-10) assegnato al neonato a 1 e 5 minuti dalla nascita, basato su cinque parametri: frequenza cardiaca, respirazione, tono muscolare, riflessi e colorito cutaneo.' },
    { term: 'pH funicolare', definition: 'Valore del pH misurato nel sangue dell\'arteria ombelicale alla nascita. Un pH < 7.0 e indicativo di acidosi metabolica significativa e potenziale sofferenza fetale.' },
    { term: 'Asfissia perinatale', definition: 'Condizione di inadeguato scambio gassoso nel periodo perinatale che porta ad acidosi, ipossia e ipercapnia, potenzialmente causa di encefalopatia ipossico-ischemica.' },
    { term: 'Distocia', definition: 'Difficolta nell\'espletamento del parto per cause materne (distocia dinamica, distocia del canale) o fetali (distocia di spalla, presentazione anomala).' },
    { term: 'Presentazione podalica', definition: 'Presentazione fetale con l\'estremo pelvico (natiche o piedi) rivolto verso il canale del parto, associata a maggior rischio di complicanze e spesso indicazione al taglio cesareo elettivo.' },
  ],
  synthesisGuidance: `Nell'analisi del caso ostetrico, focalizzare l'attenzione sull'interpretazione del tracciato
cardiotocografico secondo la classificazione FIGO (normale, sospetto, patologico), verificando
se le azioni intraprese sono state coerenti con il quadro CTG osservato. Analizzare con precisione
l'intervallo decisione-nascita (decision-to-delivery interval) nei casi di cesareo urgente, confrontandolo
con lo standard di 30 minuti. Valutare il punteggio APGAR a 1 e 5 minuti e il pH dell'arteria
ombelicale come indicatori oggettivi delle condizioni neonatali. Ricostruire il partogramma per
identificare anomalie nella progressione del travaglio e verificare l'appropriatezza delle decisioni
cliniche in relazione ai dati di monitoraggio disponibili. Nei casi di distocia di spalla, analizzare
le manovre eseguite e la loro conformita ai protocolli raccomandati (manovra di McRoberts, pressione
sovrapubica). Considerare il peso fetale stimato e i fattori di rischio preesistenti nella valutazione
dell'adeguatezza della pianificazione del parto.`,
} as const;
