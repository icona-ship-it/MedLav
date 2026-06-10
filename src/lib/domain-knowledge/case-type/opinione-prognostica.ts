import type { CaseTypeKnowledge } from '../types';

export const OPINIONE_PROGNOSTICA_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'opinione_prognostica',
  reportSections: [
    {
      id: 'premessa_quesito',
      title: 'Premessa e Quesito',
      description: 'Indicazione del mandato ricevuto, della compagnia o soggetto richiedente, del caso di riferimento. Specificazione del quesito: fornire un\'opinione prognostica sulle lesioni del danneggiato ai fini della determinazione della riserva sinistri.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 200 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica degli eventi clinici rilevanti dalla data del sinistro/evento alla data dell\'opinione prognostica.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'quadro_clinico_attuale',
      title: 'Quadro Clinico Attuale',
      description: 'Descrizione dettagliata dello stato clinico del danneggiato alla data dell\'ultima documentazione disponibile. Indicare le lesioni residue, i deficit funzionali, la sintomatologia riferita e obiettivata, le terapie in corso.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'cronistoria_trattamenti',
      title: 'Cronistoria dei Trattamenti',
      description: 'Riepilogo dei trattamenti effettuati dalla data dell\'evento: interventi chirurgici, terapie farmacologiche, riabilitazione, ausili. Valutare l\'adeguatezza del percorso terapeutico e la risposta clinica ai trattamenti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'stato_lesioni',
      title: 'Stato Attuale delle Lesioni',
      description: 'Valutazione dello stato di evoluzione di ciascuna lesione: in fase acuta, in via di consolidamento, stabilizzata, in peggioramento. Per ogni lesione indicare il grado di stabilizzazione raggiunto.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'prognosi_clinica',
      title: 'Prognosi Clinica',
      description: 'Previsione dell\'evoluzione clinica di ciascuna lesione basata sulla letteratura scientifica e sull\'andamento clinico osservato. Indicare la prognosi quoad valetudinem (rispetto alla guarigione/postumi) con il grado di certezza.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'previsione_stabilizzazione',
      title: 'Previsione di Stabilizzazione dei Postumi',
      description: 'Stima della data probabile di stabilizzazione dei postumi permanenti, indicando i criteri utilizzati (tipo di lesione, eta del paziente, risposta ai trattamenti, letteratura di riferimento). Indicare il livello di confidenza della previsione (alta, media, bassa).',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'stima_danno_provvisoria',
      title: 'Stima Provvisoria del Danno Biologico',
      description: 'Quantificazione provvisoria del danno biologico permanente atteso a stabilizzazione, espressa come range percentuale con livello di confidenza. Indicare la voce tabellare di riferimento (Bareme SIMLA, Art. 138-139 CdA) e i fattori che potrebbero modificare la stima (complicanze, necessita di ulteriori interventi).',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'spese_future',
      title: 'Spese Mediche Future Prevedibili',
      description: 'Stima delle spese mediche future ragionevolmente prevedibili fino alla stabilizzazione e oltre (spese a vita per patologie croniche). Includere: ulteriori interventi, riabilitazione, farmaci, ausili, visite di controllo. Per ogni voce indicare probabilita e range economico.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'considerazioni_riserva',
      title: 'Considerazioni sulla Riserva',
      description: 'Indicazioni utili alla compagnia per la determinazione della riserva sinistri: range di danno biologico atteso (minimo-massimo), periodi ITT/ITP stimati, spese mediche future, fattori di rischio per peggioramento, necessita di rivalutazione a distanza.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Conclusioni',
      description: 'Riepilogo conclusivo dell\'opinione prognostica: data stimata di stabilizzazione, range di danno biologico permanente atteso, periodi ITT/ITP provvisori, spese future prevedibili, raccomandazione sulla tempistica di rivalutazione. Indicare il livello di confidenza complessivo dell\'opinione.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Stabilizzazione postumi da frattura semplice',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 180,
      criticalDelayThresholdDays: 365,
      source: 'Letteratura medico-legale — Tempistiche di consolidamento fratture',
    },
    {
      procedure: 'Stabilizzazione postumi da intervento chirurgico ortopedico',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 730,
      source: 'Letteratura medico-legale — Stabilizzazione post-chirurgica',
    },
    {
      procedure: 'Stabilizzazione postumi da trauma cranico',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 730,
      source: 'Linee guida NICE — Traumatic brain injury recovery',
    },
  ],
  commonAnomalyPatterns: [
    'Quadro clinico in evoluzione con prognosi incerta che richiede rivalutazione',
    'Discrepanza tra la gravita delle lesioni iniziali e l\'andamento clinico osservato',
    'Trattamenti non ancora completati che impediscono una valutazione definitiva',
    'Necessita di ulteriori interventi chirurgici non ancora programmati',
    'Patologie preesistenti che complicano la previsione prognostica',
    'Risposta anomala ai trattamenti (guarigione piu lenta o piu rapida del previsto)',
    'Documentazione clinica insufficiente per formulare una prognosi attendibile',
    'Componente psicologica/psichiatrica non ancora valutata',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Tabelle Art. 138-139 Codice delle Assicurazioni (CdA)',
    'Invalidita Temporanea (ITT/ITP)',
    'Letteratura scientifica su prognosi per patologia',
  ],
  keyTerminology: [
    { term: 'Opinione prognostica', definition: 'Valutazione medico-legale provvisoria che esprime una previsione sull\'evoluzione delle lesioni e sul danno biologico atteso a stabilizzazione, utilizzata dalla compagnia assicurativa per la determinazione della riserva sinistri.' },
    { term: 'Riserva sinistri', definition: 'Accantonamento contabile che la compagnia assicurativa effettua per far fronte al costo stimato di un sinistro. L\'opinione prognostica del medico legale e uno degli elementi utilizzati per la sua quantificazione.' },
    { term: 'Stabilizzazione dei postumi', definition: 'Momento in cui le lesioni raggiungono un equilibrio clinico tale da consentire una valutazione medico-legale definitiva del danno biologico permanente. Prima della stabilizzazione, la valutazione e necessariamente provvisoria.' },
    { term: 'Livello di confidenza', definition: 'Grado di attendibilita della previsione prognostica, espresso come alto (>80%), medio (50-80%) o basso (<50%), in funzione della completezza della documentazione, della stabilita del quadro clinico e della prevedibilita dell\'evoluzione.' },
    { term: 'Prognosi quoad valetudinem', definition: 'Previsione relativa al recupero funzionale del paziente e alla presenza di postumi permanenti. Si distingue dalla prognosi quoad vitam (relativa alla sopravvivenza).' },
    { term: 'Danno biologico provvisorio', definition: 'Stima del danno biologico permanente espressa come range percentuale in attesa della stabilizzazione dei postumi. Ha natura necessariamente approssimativa e deve essere accompagnata dal livello di confidenza.' },
  ],
  synthesisGuidance: `Nell'opinione prognostica, l'obiettivo principale e fornire una previsione attendibile
dell'evoluzione delle lesioni e del danno biologico atteso a stabilizzazione, utile alla
compagnia assicurativa per la determinazione della riserva sinistri.
Analizzare lo stato attuale di ciascuna lesione e il suo grado di evoluzione, valutando
la risposta ai trattamenti gia effettuati e le indicazioni della letteratura scientifica
per il tipo di lesione e l'eta del paziente.
Per ogni previsione, indicare SEMPRE il livello di confidenza (alto, medio, basso) e i
fattori che potrebbero modificare la stima (necessita di ulteriori interventi, complicanze
potenziali, patologie preesistenti).
Esprimere il danno biologico permanente atteso come RANGE percentuale (es. 8-12%) piuttosto
che come valore puntuale, data la natura provvisoria della valutazione. Indicare la data
stimata di stabilizzazione dei postumi e la tempistica consigliata per la rivalutazione.
Stimare le spese mediche future prevedibili con il relativo grado di certezza.
Utilizzare un linguaggio che evidenzi la natura provvisoria dell'opinione: "si stima",
"con ragionevole probabilita", "salvo complicanze", "con riserva di rivalutazione".
Concludere con indicazioni chiare e sintetiche utili alla determinazione della riserva:
range di danno biologico, periodi ITT/ITP stimati, spese future, fattori di rischio.`,
} as const;
