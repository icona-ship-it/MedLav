import type { CaseTypeKnowledge } from '../types';

export const PREVIDENZIALE_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'previdenziale',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali: patologie documentate, iter previdenziale, quesito peritale e conclusioni essenziali sulla capacita lavorativa.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 500, max: 1000 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica dettagliata dell\'evoluzione delle patologie, degli accertamenti diagnostici, delle terapie e delle valutazioni medico-legali pregresse.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'quadro_clinico',
      title: 'Quadro Clinico Attuale',
      description: 'Descrizione dettagliata delle patologie in atto, dello stato funzionale attuale, delle terapie in corso, degli ausili e protesi utilizzati e del loro impatto sulle attivita della vita quotidiana.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'capacita_lavorativa',
      title: 'Valutazione della Capacita Lavorativa',
      description: 'Valutazione della capacita lavorativa residua in relazione alle patologie documentate, alle limitazioni funzionali e alla mansione lavorativa. Riferimento alle tabelle INPS per l\'invalidita civile o alle tabelle pensionistiche applicabili.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi per la valutazione previdenziale: evoluzione delle patologie, risposta alle terapie, prognosi, limitazioni funzionali oggettivabili, impatto sulla vita quotidiana e sulla capacita lavorativa.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Revisione invalidita civile',
      expectedFollowUpDays: 180,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 365,
      source: 'INPS — Tempistiche revisione invalidita civile',
    },
    {
      procedure: 'Aggravamento patologia cronica',
      expectedFollowUpDays: 90,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 180,
      source: 'Criterio medico-legale — Monitoraggio patologie croniche',
    },
  ],
  commonAnomalyPatterns: [
    'Documentazione clinica insufficiente a supportare il grado di invalidita richiesto',
    'Discrepanza tra la sintomatologia riferita e i riscontri oggettivi strumentali',
    'Assenza di documentazione specialistica recente nonostante patologie dichiarate in evoluzione',
    'Terapie dichiarate non supportate da prescrizioni o documentazione farmaceutica',
    'Mancata esecuzione di accertamenti strumentali appropriati per le patologie dichiarate',
    'Incongruita tra le limitazioni funzionali dichiarate e la documentazione clinica disponibile',
    'Assenza di follow-up specialistico per patologie croniche che lo richiederebbero',
  ],
  evaluationFrameworks: [
    'Tabelle INPS per l\'invalidita civile (D.M. 05/02/1992)',
    'Tabelle pensionistiche INPS',
    'Bareme SIMLA',
    'Invalidita Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'Invalidita civile', definition: 'Riduzione della capacita lavorativa generica superiore a un terzo (art. 2 L. 118/1971). Si distingue in gradi: invalido con percentuale 46-73% (iscrizione collocamento mirato), 74-99% (assegno mensile), 100% (pensione di inabilita), 100% con necessita di accompagnamento (indennita di accompagnamento).' },
    { term: 'Capacita lavorativa residua', definition: 'Valutazione delle attivita lavorative che il soggetto puo ancora svolgere in relazione alle menomazioni accertate. Si distingue tra capacita lavorativa generica (attivita confacenti) e specifica (mansione abituale).' },
    { term: 'Handicap (L. 104/1992)', definition: 'Situazione di svantaggio sociale derivante da una minorazione fisica, psichica o sensoriale che causa difficolta di apprendimento, relazione o integrazione lavorativa. Puo essere riconosciuto come grave (art. 3 comma 3) con diritto a permessi e agevolazioni.' },
    { term: 'Tabelle INPS', definition: 'Tabelle ministeriali (D.M. 05/02/1992) che elencano le infermita e le relative percentuali di invalidita. Per patologie non tabellate si procede per analogia con le voci tabellari piu affini. In caso di pluripatologia si applica la formula di Balthazard.' },
    { term: 'Formula di Balthazard', definition: 'Formula matematica per il calcolo dell\'invalidita complessiva in caso di pluripatologia: IV = IV1 + IV2 - (IV1 x IV2). Evita la somma aritmetica che porterebbe a percentuali irrealistiche e tiene conto della residua integrita.' },
    { term: 'Indennita di accompagnamento', definition: 'Provvidenza economica riconosciuta agli invalidi civili totali (100%) che necessitano di assistenza continua per il compimento degli atti quotidiani della vita o che non sono in grado di deambulare senza l\'aiuto permanente di un accompagnatore.' },
  ],
  synthesisGuidance: `Nell'analisi del caso previdenziale, procedere con una valutazione sistematica del quadro
clinico complessivo del periziando. Documentare ogni patologia con i relativi riscontri
diagnostici strumentali e la risposta alle terapie in corso. Valutare le limitazioni funzionali
in modo oggettivo, distinguendo tra quanto riferito dal periziando e quanto oggettivabile
con gli accertamenti clinici e strumentali disponibili.
Per l'invalidita civile, fare riferimento alle tabelle del D.M. 05/02/1992, applicando
la formula di Balthazard in caso di pluripatologia. Per patologie non tabellate, procedere
per analogia con le voci piu affini, motivando il criterio analogico adottato.
Valutare l'impatto delle patologie sulla vita quotidiana (autonomia negli atti della vita
quotidiana, necessita di ausili o assistenza) e sulla capacita lavorativa (attivita confacenti,
limitazioni ergonomiche, controindicazioni specifiche).
Considerare la prognosi delle patologie e la possibilita di miglioramento con le terapie
disponibili. Documentare con precisione lo stato attuale, fornendo una valutazione che
consenta alla commissione medica o al giudice di apprezzare compiutamente il quadro
clinico e le sue conseguenze sulla sfera lavorativa e relazionale del periziando.`,
} as const;
