import type { CaseTypeKnowledge } from '../types';

export const PERIZIA_ASSICURATIVA_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'perizia_assicurativa',
  reportSections: [
    {
      id: 'premessa_mandato',
      title: 'Premessa e Mandato',
      description: 'Indicazione della compagnia mandante, del sinistro oggetto di valutazione, del danneggiato, della data e circostanze del sinistro. Descrizione del quesito peritale e del mandato conferito.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'documentazione_esaminata',
      title: 'Documentazione Esaminata',
      description: 'Elenco analitico di tutta la documentazione medica e amministrativa acquisita: verbale di pronto soccorso, cartella clinica, referti diagnostici, certificazioni, preventivi di spesa, fatture, ricevute.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 300 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica dettagliata degli eventi clinici dal sinistro alla stabilizzazione dei postumi, con date, strutture sanitarie e operatori coinvolti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'anamnesi_cronistoria',
      title: 'Anamnesi e Cronistoria Clinica',
      description: 'Ricostruzione dettagliata dell\'anamnesi patologica remota e prossima del danneggiato. Cronistoria dell\'iter diagnostico-terapeutico dal sinistro alla data della visita peritale, con particolare attenzione a patologie preesistenti nella stessa sede anatomica.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'esame_obiettivo',
      title: 'Esame Obiettivo (se effettuato)',
      description: 'Descrizione dettagliata dell\'esame obiettivo generale e segmentario con riferimento alla sede delle lesioni. Indicare range di movimento articolare, deficit funzionali, esiti cicatriziali, test clinici specifici.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 300 },
    },
    {
      id: 'nesso_causale',
      title: 'Valutazione del Nesso Causale',
      description: 'Analisi della compatibilita tra la dinamica del sinistro e le lesioni documentate. Valutazione biomeccanica, compatibilita temporale, esclusione di concause preesistenti o sopravvenute. Utilizzo del criterio del "piu probabile che non".',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'danno_biologico',
      title: 'Quantificazione del Danno Biologico',
      description: 'Quantificazione del danno biologico permanente con riferimento alle tabelle di legge (Art. 138-139 CdA, TUN, Bareme SIMLA). Distinzione micropermanenti/macropermanenti. Indicazione della voce tabellare di riferimento.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'invalidita_temporanea',
      title: 'Invalidita Temporanea (ITT/ITP)',
      description: 'Quantificazione dei periodi di invalidita temporanea totale e parziale con date esatte di inizio e fine, percentuali di ITP e criteri di determinazione. Correlazione con i periodi di ricovero, immobilizzazione e convalescenza documentati.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 200 },
    },
    {
      id: 'spese_mediche_congruita',
      title: 'Spese Mediche e Congruita',
      description: 'Analisi delle spese mediche documentate: congruita rispetto al quadro clinico, necessita delle prestazioni, conformita ai tariffari regionali/nazionali. Indicazione delle spese congrue e rimborsabili vs. quelle non pertinenti o eccessive.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'considerazioni_ml',
      title: 'Considerazioni Medico-Legali',
      description: 'Analisi critica complessiva del caso dal punto di vista assicurativo. Valutazione della solidita della richiesta risarcitoria, coerenza della documentazione, profili di rischio per la compagnia mandante.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Conclusioni e Proposta Risarcitoria',
      description: 'Riepilogo quantitativo del danno biologico (permanente e temporaneo), proposta di quantificazione per la compagnia mandante con riferimenti tabellari, indicazione delle spese mediche rimborsabili, suggerimenti per la gestione del sinistro.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
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
      procedure: 'Frattura costale da trauma stradale',
      expectedFollowUpDays: 7,
      expectedRecoveryDays: 45,
      criticalDelayThresholdDays: 21,
      source: 'Linee guida EAST — Blunt thoracic trauma',
    },
    {
      procedure: 'Distorsione articolare post-sinistro',
      expectedFollowUpDays: 7,
      expectedRecoveryDays: 30,
      criticalDelayThresholdDays: 14,
      source: 'Prassi medico-legale assicurativa',
    },
  ],
  commonAnomalyPatterns: [
    'Incongruita tra la dinamica del sinistro dichiarata e le lesioni documentate',
    'Primo accesso sanitario tardivo rispetto alla data del sinistro',
    'Assenza di documentazione del pronto soccorso o intervallo temporale sospetto',
    'Lesioni preesistenti nella stessa sede anatomica non adeguatamente documentate',
    'Spese mediche non congrue rispetto al quadro clinico o eccedenti i tariffari',
    'Prolungamento ingiustificato dei periodi di inabilita temporanea',
    'Terapie non coerenti con la tipologia di lesione o non supportate da evidenze',
    'Assenza di imaging diagnostico nonostante la sintomatologia riferita',
    'Documentazione clinica incompleta o lacunosa nei passaggi critici',
  ],
  evaluationFrameworks: [
    'Tabelle Art. 138-139 Codice delle Assicurazioni (CdA)',
    'Bareme SIMLA',
    'Tabelle Ronchi',
    'Invalidita Temporanea (ITT/ITP)',
    'Tariffari regionali per congruita spese mediche',
  ],
  keyTerminology: [
    { term: 'Sinistro', definition: 'Evento dannoso che determina l\'attivazione della copertura assicurativa RC Auto. La data del sinistro e fondamentale per la determinazione della tabella applicabile (TUN o Milano).' },
    { term: 'Danneggiato', definition: 'Soggetto che ha subito lesioni a seguito del sinistro e che avanza richiesta risarcitoria nei confronti della compagnia assicurativa del responsabile civile.' },
    { term: 'Compagnia mandante', definition: 'Impresa di assicurazione che conferisce l\'incarico al medico legale per la valutazione del danno alla persona del danneggiato/assicurato.' },
    { term: 'Congruita delle spese', definition: 'Valutazione della pertinenza, necessita e adeguatezza economica delle spese mediche sostenute dal danneggiato rispetto al quadro clinico documentato e ai tariffari di riferimento.' },
    { term: 'Micropermanente', definition: 'Danno biologico permanente di lieve entita (1-9%), disciplinato dall\'art. 139 CdA, che richiede accertamento clinico strumentale obiettivo.' },
    { term: 'Proposta risarcitoria', definition: 'Quantificazione economica del danno biologico e delle spese mediche che il medico legale suggerisce alla compagnia mandante come base per l\'offerta risarcitoria al danneggiato.' },
  ],
  synthesisGuidance: `Nella perizia assicurativa, adottare la prospettiva della compagnia mandante con rigore
tecnico e imparzialita scientifica. L'analisi deve essere finalizzata alla quantificazione
oggettiva del danno biologico e alla verifica della congruita della documentazione e delle
spese mediche.
Verificare sistematicamente la compatibilita tra dinamica del sinistro e lesioni riportate,
la tempestivita del primo accesso sanitario, la coerenza dell'iter diagnostico-terapeutico
e l'assenza di patologie preesistenti nella medesima sede anatomica.
Utilizzare terminologia assicurativa formale: "sinistro", "danneggiato", "compagnia mandante",
"proposta risarcitoria". Quantificare il danno biologico con riferimento alle tabelle di legge
(Art. 138-139 CdA, TUN per sinistri dal 25/03/2025, Tabelle Milano per sinistri precedenti).
Per le micropermanenti, verificare il requisito dell'accertamento clinico strumentale obiettivo
(art. 139 comma 2 CdA). Analizzare ogni voce di spesa medica per congruita, necessita e
aderenza ai tariffari regionali/nazionali. Concludere con una proposta risarcitoria chiara
e motivata, indicando il range di danno biologico permanente, i periodi ITT/ITP e l'importo
delle spese mediche rimborsabili.`,
} as const;
