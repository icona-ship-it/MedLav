import type { CaseTypeKnowledge } from '../types';

export const ONCOLOGICA_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'oncologica',
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
      id: 'timeline_diagnostica',
      title: 'Timeline Diagnostica',
      description: 'Ricostruzione della sequenza temporale dal primo sospetto clinico alla diagnosi definitiva, evidenziando ogni passaggio diagnostico, i tempi intercorsi e le eventuali omissioni.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'analisi_ritardo',
      title: 'Analisi del Ritardo Diagnostico',
      description: 'Quantificazione del ritardo diagnostico in giorni, analisi dell\'impatto del ritardo sulla stadiazione della neoplasia e sulle opzioni terapeutiche disponibili.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'loss_of_chance',
      title: 'Perdita di Chance',
      description: 'Valutazione della probabilita di sopravvivenza e/o guarigione persa a causa del ritardo diagnostico o terapeutico, con riferimento ai dati epidemiologici e alla letteratura scientifica.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 300 },
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
      procedure: 'Sospetto mammario - biopsia',
      expectedFollowUpDays: 14,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 30,
      source: 'Linee guida AIOM - Neoplasie della mammella',
    },
    {
      procedure: 'Sospetto colon - colonscopia',
      expectedFollowUpDays: 21,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 45,
      source: 'Linee guida AIOM - Tumori del colon-retto',
    },
    {
      procedure: 'Sospetto polmonare - TC torace',
      expectedFollowUpDays: 7,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 21,
      source: 'Linee guida AIOM - Neoplasie del polmone',
    },
    {
      procedure: 'Diagnosi definitiva - inizio chemioterapia',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 60,
      source: 'Linee guida AIOM - Tempistiche trattamento oncologico',
    },
  ],
  commonAnomalyPatterns: [
    'Ritardo nella refertazione di esami diagnostici con sospetto oncologico',
    'Mancata prescrizione di esami di approfondimento a fronte di reperti sospetti',
    'Sottovalutazione di sintomi sentinella (calo ponderale, sanguinamento, massa palpabile)',
    'Errore nella stadiazione (staging) con conseguente sottostima della malattia',
    'Mancato follow-up dei marker tumorali in pazienti con anamnesi oncologica positiva',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    'Invalidita Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'Staging TNM', definition: 'Sistema internazionale di classificazione dei tumori basato su tre parametri: T (dimensione e estensione del tumore primitivo), N (coinvolgimento dei linfonodi regionali), M (presenza di metastasi a distanza).' },
    { term: 'Grading', definition: 'Classificazione istologica del grado di differenziazione cellulare del tumore (G1-G4), che indica l\'aggressivita biologica della neoplasia. Grading piu alto corrisponde a maggiore aggressivita.' },
    { term: 'Marker tumorali', definition: 'Sostanze (proteine, antigeni) misurabili nel sangue il cui livello puo aumentare in presenza di neoplasia. Utilizzati per screening, monitoraggio terapia e follow-up (es. PSA, CEA, CA 125, CA 19-9).' },
    { term: 'Screening', definition: 'Programma di diagnosi precoce su popolazione asintomatica a rischio, finalizzato a identificare la neoplasia in stadio iniziale quando il trattamento ha maggiore probabilita di successo.' },
    { term: 'Performance status', definition: 'Scala di valutazione (ECOG/Karnofsky) delle condizioni generali del paziente oncologico, che misura l\'autonomia funzionale e influenza le decisioni terapeutiche.' },
    { term: 'Sopravvivenza libera da malattia', definition: 'Periodo di tempo dalla fine del trattamento al momento della recidiva o dell\'ultimo follow-up negativo. Parametro fondamentale per valutare l\'efficacia del trattamento e quantificare la perdita di chance.' },
  ],
  synthesisGuidance: `Nell'analisi del caso oncologico, ricostruire con precisione la timeline diagnostica quantificando
in giorni ogni ritardo tra il primo sospetto clinico e la diagnosi definitiva. Confrontare la stadiazione
al momento della diagnosi effettiva con quella attesa in caso di diagnosi tempestiva, utilizzando
i dati epidemiologici disponibili in letteratura. Calcolare la perdita di chance di sopravvivenza
e/o guarigione sulla base delle curve di sopravvivenza stadio-specifiche pubblicate nelle linee guida
AIOM. Verificare se i protocolli di screening applicabili sono stati rispettati e se i sintomi sentinella
sono stati adeguatamente investigati. Analizzare la catena delle responsabilita (medico di base,
specialista, struttura) nella genesi del ritardo diagnostico. Valutare l'impatto del ritardo sulle opzioni
terapeutiche disponibili (chirurgia conservativa vs demolitiva, chemioterapia adiuvante vs palliativa).`,
} as const;
