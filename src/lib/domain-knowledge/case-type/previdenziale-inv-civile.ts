import type { CaseTypeKnowledge } from '../types';

export const PREVIDENZIALE_INV_CIVILE_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'previdenziale_inv_civile',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali: patologie accertate, prestazione richiesta (invalidità civile, accompagnamento, L.104, L.222), esito del verbale della commissione medica, motivi del ricorso.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 500, max: 1000 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica: domanda amministrativa, visita della commissione ASL/INPS, verbale, eventuale ricorso amministrativo, ricorso giurisdizionale. Evoluzione delle patologie nel tempo.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'quadro_clinico',
      title: 'Quadro Clinico Attuale',
      description: 'Descrizione dettagliata di tutte le patologie in atto, con riscontri diagnostici strumentali e di laboratorio. Terapie in corso, ausili e protesi. Stato funzionale attuale con impatto sulle attività della vita quotidiana e sulla deambulazione.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'valutazione_percentuale',
      title: 'Valutazione Medico-Legale Percentuale',
      description: 'Quantificazione della percentuale di invalidità civile per ciascuna patologia secondo le tabelle del D.M. 05/02/1992. Applicazione della formula di Balthazard per la pluripatologia. Motivazione per patologie non tabellate (criterio analogico). Confronto con la percentuale attribuita dalla commissione medica.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'capacita_lavorativa',
      title: 'Valutazione della Capacità Lavorativa',
      description: 'Valutazione della capacità lavorativa generica residua e specifica. Per L. 222/1984: distinzione tra assegno ordinario di invalidità (riduzione >2/3 in occupazioni confacenti) e pensione di inabilità (assoluta e permanente impossibilità a qualsiasi attività lavorativa). Data di insorgenza e reversibilità.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'accompagnamento_autonomia',
      title: 'Autonomia negli Atti della Vita Quotidiana',
      description: 'Valutazione della capacità di compiere autonomamente gli atti quotidiani della vita e della capacità di deambulazione. Rilevante per l\'indennità di accompagnamento (L. 18/1980): necessità di assistenza continua o impossibilità di deambulare senza accompagnatore permanente.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi: congruità della percentuale assegnata, completezza della valutazione, eventuali patologie non considerate, prognosi, sussistenza dei requisiti per handicap grave (L. 104 art. 3 comma 3).',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Domanda di invalidità civile — visita commissione',
      expectedFollowUpDays: 90,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 270,
      source: 'INPS — Tempistiche visita commissione invalidità civile',
    },
    {
      procedure: 'Revisione invalidità civile',
      expectedFollowUpDays: 180,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 365,
      source: 'INPS — Tempistiche revisione invalidità civile',
    },
    {
      procedure: 'ATP/Ricorso giurisdizionale — deposito CTU',
      expectedFollowUpDays: 60,
      expectedRecoveryDays: 180,
      criticalDelayThresholdDays: 120,
      source: 'Prassi tribunale — Termini deposito perizia previdenziale',
    },
    {
      procedure: 'Aggravamento patologia cronica — nuova domanda',
      expectedFollowUpDays: 90,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 180,
      source: 'Criterio medico-legale — Monitoraggio patologie croniche',
    },
  ],
  commonAnomalyPatterns: [
    'Documentazione clinica insufficiente a supportare il grado di invalidità richiesto',
    'Discrepanza tra la sintomatologia riferita e i riscontri oggettivi strumentali',
    'Assenza di documentazione specialistica recente per patologie dichiarate in evoluzione',
    'Percentuale di invalidità nel verbale non coerente con le tabelle del D.M. 05/02/1992',
    'Patologie documentate non considerate nella valutazione della commissione medica',
    'Mancata applicazione o errata applicazione della formula di Balthazard per pluripatologia',
    'Terapie dichiarate non supportate da prescrizioni mediche documentate',
    'Incongruità tra le limitazioni funzionali dichiarate e la documentazione clinica disponibile',
    'Assenza di valutazione dell\'autonomia negli atti della vita quotidiana per richiesta di accompagnamento',
    'Mancata distinzione tra patologie stabilizzate e patologie in evoluzione',
  ],
  evaluationFrameworks: [
    'Tabelle INPS per l\'invalidità civile (D.M. 05/02/1992)',
    'Formula di Balthazard per pluripatologia',
    'L. 118/1971 — Invalidità civile',
    'L. 18/1980 — Indennità di accompagnamento',
    'L. 104/1992 — Handicap e handicap grave',
    'L. 222/1984 — Assegno ordinario di invalidità e pensione di inabilità',
    'L. 138/2001 — Cecità civile',
    'L. 381/1970 — Sordità civile',
  ],
  keyTerminology: [
    { term: 'Invalidità civile', definition: 'Riduzione della capacità lavorativa generica determinata da menomazioni fisiche, psichiche o sensoriali (art. 2 L. 118/1971). Gradi: 46-73% iscrizione collocamento mirato, 74-99% assegno mensile, 100% pensione di inabilità, 100% con necessità accompagnamento = indennità di accompagnamento.' },
    { term: 'Tabelle D.M. 05/02/1992', definition: 'Tabelle ministeriali che elencano le infermità invalidanti con le relative percentuali di riduzione della capacità lavorativa. Per patologie non tabellate si procede per analogia. Le percentuali fisse sono vincolanti; le percentuali con range consentono valutazione discrezionale motivata.' },
    { term: 'Formula di Balthazard', definition: 'Formula per il calcolo dell\'invalidità complessiva in caso di pluripatologia: IV totale = IV1 + IV2 - (IV1 × IV2). Impedisce la somma aritmetica che porterebbe a percentuali superiori al 100% e tiene conto della ridotta integrita residua.' },
    { term: 'Indennità di accompagnamento (L. 18/1980)', definition: 'Provvidenza economica per invalidi civili totali (100%) che: a) non sono in grado di deambulare senza l\'aiuto permanente di un accompagnatore, oppure b) necessitano di assistenza continua per il compimento degli atti quotidiani della vita. I due requisiti sono alternativi, non cumulativi.' },
    { term: 'Handicap grave (L. 104/1992 art. 3 comma 3)', definition: 'Situazione di handicap che ha determinato un processo di svantaggio sociale o di emarginazione tale che la persona necessita di un intervento assistenziale permanente, continuativo e globale nella sfera individuale o in quella relazionale. Dà diritto a permessi lavorativi e agevolazioni fiscali.' },
    { term: 'Assegno ordinario di invalidità (L. 222/1984)', definition: 'Prestazione previdenziale INPS per lavoratori la cui capacità lavorativa, in occupazioni confacenti alle proprie attitudini, sia ridotta in modo permanente a meno di un terzo. Richiede requisito contributivo (5 anni, di cui 3 nell\'ultimo quinquennio). Revisibile ogni 3 anni.' },
    { term: 'Pensione di inabilità (L. 222/1984)', definition: 'Prestazione previdenziale INPS per lavoratori con assoluta e permanente impossibilità a svolgere qualsiasi attività lavorativa. Richiede stesso requisito contributivo dell\'assegno ordinario. Non compatibile con attività lavorativa.' },
    { term: 'Capacità lavorativa generica vs specifica', definition: 'Generica: idoneità a svolgere attività lavorative confacenti alle proprie attitudini (rilevante per invalidità civile e L. 222). Specifica: idoneità alla mansione lavorativa abituale (rilevante per inidoneità al lavoro). La valutazione previdenziale considera primariamente la generica.' },
  ],
  synthesisGuidance: `Nell'analisi del caso previdenziale (invalidità civile, accompagnamento, L. 104, L. 222),
procedere con una valutazione sistematica e rigorosa di ogni patologia documentata.
Per ciascuna infermità: identificare la voce tabellare corrispondente nelle tabelle del
D.M. 05/02/1992 (codice e descrizione), attribuire la percentuale di invalidità motivando
la scelta all'interno di eventuali range, e applicare la formula di Balthazard per il calcolo
della percentuale complessiva in caso di pluripatologia.
Per patologie non tabellate, procedere per analogia con la voce più affine, motivando
espressamente il criterio analogico adottato.
Distinguere chiaramente tra:
- Invalidità civile percentuale (L. 118/1971): soglie 46%, 67%, 74%, 100%
- Accompagnamento (L. 18/1980): impossibilità deambulazione O necessità assistenza atti quotidiani
- Handicap e handicap grave (L. 104/1992): svantaggio sociale, necessità assistenza permanente
- Capacità lavorativa in occupazioni confacenti (L. 222/1984): riduzione >2/3 o inabilità assoluta
Valutare con rigore l'autonomia negli atti della vita quotidiana: alimentazione, igiene
personale, vestizione, deambulazione, spostamenti, comunicazione, assunzione farmaci.
Documentare con precisione lo stato attuale, confrontandolo con la valutazione della
commissione medica contenuta nel verbale impugnato, evidenziando specificatamente
ogni discrepanza e la relativa motivazione medico-legale.`,
} as const;
