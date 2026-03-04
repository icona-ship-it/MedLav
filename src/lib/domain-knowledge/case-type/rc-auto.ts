import type { CaseTypeKnowledge } from '../types';

export const RC_AUTO_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'rc_auto',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali: dinamica del sinistro, lesioni riportate, iter diagnostico-terapeutico e conclusioni peritali essenziali.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 500 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica dettagliata degli eventi clinici dal sinistro alla stabilizzazione dei postumi, con date, strutture sanitarie e operatori coinvolti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'analisi_dinamica',
      title: 'Analisi della Dinamica e delle Lesioni',
      description: 'Valutazione della congruita tra la dinamica del sinistro descritta e le lesioni documentate. Analisi biomeccanica della compatibilita lesione-dinamica, confronto con la letteratura scientifica sulle lesioni da trauma stradale.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'danno_biologico',
      title: 'Valutazione del Danno Biologico',
      description: 'Quantificazione del danno biologico: periodi di invalidita temporanea totale (ITT) e parziale (ITP), danno biologico permanente secondo le tabelle di legge (Art. 138-139 CdA) e il Bareme SIMLA. Distinzione tra micropermanenti (fino al 9%) e macropermanenti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'nesso_causale',
      title: 'Nesso Causale',
      description: 'Analisi del nesso di causalita tra il sinistro stradale e le lesioni documentate, valutazione delle concause preesistenti e sopravvenute, compatibilita temporale tra evento e sintomatologia.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi ai fini della valutazione medico-legale: congruita lesioni-dinamica, adeguatezza delle cure, tempestivita del primo soccorso, completezza della documentazione.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Colpo di frusta cervicale (whiplash)',
      expectedFollowUpDays: 7,
      expectedRecoveryDays: 60,
      criticalDelayThresholdDays: 30,
      source: 'Linee guida SIMLA — Traumatologia stradale cervicale',
    },
    {
      procedure: 'Frattura vertebrale da trauma stradale',
      expectedFollowUpDays: 14,
      expectedRecoveryDays: 120,
      criticalDelayThresholdDays: 45,
      source: 'Linee guida SIOeChCF — Fratture vertebrali traumatiche',
    },
    {
      procedure: 'Trauma cranico minore (commotivo)',
      expectedFollowUpDays: 3,
      expectedRecoveryDays: 30,
      criticalDelayThresholdDays: 14,
      source: 'Linee guida NICE — Head injury assessment and management',
    },
    {
      procedure: 'Frattura costale da trauma stradale',
      expectedFollowUpDays: 7,
      expectedRecoveryDays: 45,
      criticalDelayThresholdDays: 21,
      source: 'Linee guida EAST — Blunt thoracic trauma',
    },
  ],
  commonAnomalyPatterns: [
    'Incongruita tra la dinamica del sinistro dichiarata e le lesioni documentate',
    'Primo accesso al pronto soccorso tardivo rispetto al sinistro senza giustificazione',
    'Assenza di documentazione del primo soccorso o del verbale di pronto soccorso',
    'Lesioni preesistenti al sinistro non adeguatamente documentate o distinte dai nuovi esiti',
    'Gap documentale tra il primo soccorso e i controlli successivi',
    'Terapie e trattamenti non coerenti con la tipologia di lesione documentata',
    'Assenza di imaging post-trauma nonostante la sintomatologia riferita',
    'Prolungamento ingiustificato dei periodi di inabilita temporanea',
  ],
  evaluationFrameworks: [
    'Tabelle Ronchi',
    'Tabelle Art. 138-139 Codice delle Assicurazioni (CdA)',
    'Bareme SIMLA',
    'Invalidita Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'Micropermanente', definition: 'Danno biologico permanente di lieve entita, compreso tra l\'1% e il 9%, disciplinato dall\'art. 139 del Codice delle Assicurazioni Private (D.Lgs. 209/2005). La liquidazione segue la tabella ministeriale aggiornata periodicamente.' },
    { term: 'Macropermanente', definition: 'Danno biologico permanente di entita superiore al 9%, disciplinato dall\'art. 138 del Codice delle Assicurazioni Private. La liquidazione segue la tabella unica nazionale approvata con decreto ministeriale.' },
    { term: 'Colpo di frusta (whiplash)', definition: 'Lesione del rachide cervicale causata dal meccanismo di accelerazione-decelerazione tipico del tamponamento. La diagnosi richiede documentazione clinica e strumentale adeguata (art. 139 comma 2 CdA: accertamento clinico strumentale obiettivo).' },
    { term: 'Congruita lesione-dinamica', definition: 'Valutazione della compatibilita biomeccanica tra la dinamica del sinistro (velocita, direzione dell\'impatto, deformazione dei veicoli) e le lesioni riportate dal periziando. Criterio fondamentale nella perizia RC Auto.' },
    { term: 'ITT/ITP', definition: 'Invalidita Temporanea Totale (impossibilita completa di attendere alle ordinarie occupazioni) e Parziale (riduzione percentuale). In RC Auto, i periodi devono essere strettamente correlati alle lesioni da sinistro e documentati clinicamente.' },
    { term: 'Danno differenziale', definition: 'Differenza tra il danno biologico complessivo attuale e quello preesistente al sinistro. Fondamentale quando il periziando presenta patologie pregresse nella stessa sede anatomica interessata dal trauma.' },
  ],
  synthesisGuidance: `Nell'analisi del caso RC Auto, l'attenzione primaria va posta sulla congruita tra la dinamica
del sinistro descritta e le lesioni documentate. Verificare la compatibilita biomeccanica (velocita
dell'impatto, direzione, deformazione veicoli) con le lesioni riportate. Analizzare la tempestivita
del primo accesso sanitario e la completezza dell'iter diagnostico-strumentale post-trauma.
Distinguere con precisione le lesioni direttamente riconducibili al sinistro da eventuali patologie
preesistenti o concomitanti, calcolando il danno differenziale ove necessario.
Quantificare i periodi di invalidita temporanea (ITT/ITP) sulla base della documentazione clinica
e valutare il danno biologico permanente con riferimento alle tabelle di legge: Art. 139 CdA
per le micropermanenti (1-9%) con obbligo di accertamento clinico strumentale obiettivo,
Art. 138 CdA per le macropermanenti (>9%) con riferimento al Bareme SIMLA.
Per le lesioni del rachide cervicale (whiplash), prestare particolare attenzione al requisito
dell'accertamento strumentale obiettivo previsto dall'art. 139 comma 2 CdA, come interpretato
dalla giurisprudenza di legittimita (Cass. Civ. III, 19/01/2018, n. 1272).`,
} as const;
