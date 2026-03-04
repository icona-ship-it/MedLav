import type { CaseTypeKnowledge } from '../types';

export const INFEZIONE_NOSOCOMIALE_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'infezione_nosocomiale',
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
      id: 'analisi_infettiva',
      title: 'Analisi dell\'Infezione',
      description: 'Analisi dell\'infezione: tempistica di insorgenza rispetto al ricovero/intervento, agente eziologico isolato, profilo di resistenza, adeguatezza della profilassi antibiotica preoperatoria e delle misure di prevenzione.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'gestione_terapeutica',
      title: 'Gestione Terapeutica dell\'Infezione',
      description: 'Valutazione dell\'adeguatezza della terapia antibiotica (empirica e mirata), tempestivita dell\'avvio del trattamento, aderenza ai risultati dell\'antibiogramma e gestione complessiva del quadro infettivo.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
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
      procedure: 'Profilassi antibiotica pre-chirurgica',
      expectedFollowUpDays: 0,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 0,
      source: 'Linee guida SNLG/ISS - La profilassi antibiotica va somministrata 30-60 minuti prima dell\'incisione chirurgica',
    },
    {
      procedure: 'Risultati antibiogramma da coltura',
      expectedFollowUpDays: 2,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 3,
      source: 'Standard microbiologici - Risultati antibiogramma attesi entro 48-72 ore dalla coltura',
    },
    {
      procedure: 'Risultati emocolture',
      expectedFollowUpDays: 1,
      expectedRecoveryDays: 0,
      criticalDelayThresholdDays: 2,
      source: 'Standard microbiologici - Risultati preliminari emocolture entro 24-48 ore',
    },
  ],
  commonAnomalyPatterns: [
    'Mancata somministrazione della profilassi antibiotica preoperatoria nei tempi raccomandati',
    'Profilassi antibiotica con molecola inadeguata rispetto al tipo di intervento e all\'ecologia locale',
    'Ritardo nell\'avvio della terapia antibiotica mirata dopo disponibilita dell\'antibiogramma',
    'Mancata esecuzione di colture e antibiogramma in presenza di segni clinici di infezione',
    'Terapia antibiotica empirica protratta senza esecuzione di indagini microbiologiche colturali',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    'Invalidita Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'ICA (Infezione Correlata all\'Assistenza)', definition: 'Infezione che si manifesta durante o dopo il ricovero ospedaliero, non presente ne in incubazione al momento dell\'ammissione. Include le infezioni del sito chirurgico, batteriemie, infezioni urinarie e polmoniti associate a ventilazione.' },
    { term: 'Antibiogramma', definition: 'Test di laboratorio che determina la sensibilita di un microrganismo isolato ai diversi antibiotici, fondamentale per guidare la terapia antibiotica mirata.' },
    { term: 'MIC (Concentrazione Minima Inibente)', definition: 'La piu bassa concentrazione di un antibiotico in grado di inibire la crescita di un microrganismo in vitro. Parametro utilizzato per definire la sensibilita o resistenza del germe.' },
    { term: 'MRSA', definition: 'Staphylococcus aureus meticillino-resistente: ceppo di stafilococco resistente alla meticillina e a tutti i beta-lattamici, frequente causa di infezioni nosocomiali gravi.' },
    { term: 'Sepsi', definition: 'Disfunzione d\'organo pericolosa per la vita causata da una risposta disregolata dell\'organismo all\'infezione (definizione Sepsis-3). Richiede riconoscimento e trattamento immediato.' },
    { term: 'Shock settico', definition: 'Sottocategoria della sepsi con grave compromissione circolatoria e metabolica: ipotensione persistente nonostante adeguata rianimazione volemica, con necessita di vasopressori e lattato > 2 mmol/L.' },
    { term: 'Bundle sepsi', definition: 'Insieme di interventi diagnostico-terapeutici da attuare entro tempi definiti (1 ora e 3 ore) nella gestione della sepsi: emocolture, lattato, antibiotici empirici, rianimazione volemica.' },
  ],
  synthesisGuidance: `Nell'analisi del caso di infezione nosocomiale, ricostruire con precisione la cronologia dell'infezione:
data di insorgenza dei primi segni clinici, tempistica delle indagini microbiologiche, momento
della diagnosi e avvio della terapia. Verificare l'adeguatezza della profilassi antibiotica preoperatoria
(molecola, dosaggio, timing rispetto all'incisione) secondo le linee guida SNLG. Analizzare il germe
isolato e il suo profilo di resistenza in relazione all'ecologia microbiologica della struttura sanitaria.
Valutare se la terapia antibiotica empirica iniziale era appropriata e se e stata prontamente adeguata
ai risultati dell'antibiogramma. Nei casi di sepsi, verificare l'aderenza al bundle della Surviving
Sepsis Campaign (emocolture prima dell'antibiotico, antibiotico entro 1 ora, rianimazione volemica).
Esaminare le misure di prevenzione adottate dalla struttura: protocolli di igiene delle mani, gestione
dei dispositivi invasivi, sorveglianza microbiologica. Considerare i fattori di rischio del paziente
(immunodepressione, diabete, eta avanzata, dispositivi invasivi) come possibili concause.`,
} as const;
