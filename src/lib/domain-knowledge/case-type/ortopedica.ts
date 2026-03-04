import type { CaseTypeKnowledge } from '../types';

export const ORTOPEDICA_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'ortopedica',
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
      id: 'analisi_intervento',
      title: 'Analisi dell\'Intervento Chirurgico',
      description: 'Valutazione della tecnica chirurgica adottata, indicazione all\'intervento, materiali e protesi utilizzate, conformita alle linee guida SIOT (Societa Italiana di Ortopedia e Traumatologia).',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'complicanze',
      title: 'Analisi delle Complicanze',
      description: 'Analisi delle complicanze verificatesi: prevedibilita, prevenibilita, adeguatezza della gestione e tempestivita degli interventi correttivi.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 300 },
    },
    {
      id: 'danno_biologico',
      title: 'Valutazione del Danno Biologico',
      description: 'Quantificazione del danno biologico: periodi di invalidita temporanea totale (ITT) e parziale (ITP), danno biologico permanente secondo il Bareme SIMLA.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 200 },
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
      procedure: 'Protesi anca (artroprotesi)',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 180,
      criticalDelayThresholdDays: 90,
      source: 'Linee guida SIOT - Artroprotesi d\'anca',
    },
    {
      procedure: 'Artroscopia ginocchio',
      expectedFollowUpDays: 14,
      expectedRecoveryDays: 90,
      criticalDelayThresholdDays: 60,
      source: 'Linee guida SIOT - Chirurgia artroscopica',
    },
    {
      procedure: 'Osteosintesi frattura',
      expectedFollowUpDays: 21,
      expectedRecoveryDays: 120,
      criticalDelayThresholdDays: 60,
      source: 'Linee guida AO Foundation - Trattamento fratture',
    },
    {
      procedure: 'Artroprotesi ginocchio',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 180,
      criticalDelayThresholdDays: 90,
      source: 'Linee guida SIOT - Artroprotesi di ginocchio',
    },
  ],
  commonAnomalyPatterns: [
    'Mobilizzazione precoce della protesi con necessita di revisione chirurgica',
    'Infezione del sito chirurgico con ritardo nella diagnosi o nel trattamento',
    'Pseudoartrosi da mancata consolidazione con necessita di reintervento',
    'Sindrome compartimentale non diagnosticata tempestivamente',
    'Lesione iatrogena di nervo periferico durante l\'intervento chirurgico',
    'Trombosi venosa profonda post-operatoria per mancata o inadeguata profilassi',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    'Invalidita Temporanea (ITT/ITP)',
    'Tabelle Ronchi',
    'Tabelle Govoni-Luvoni-Mangili',
  ],
  keyTerminology: [
    { term: 'Osteosintesi', definition: 'Procedura chirurgica di stabilizzazione di una frattura mediante mezzi metallici (placche, viti, chiodi endomidollari) che mantengono i frammenti ossei in posizione corretta durante la guarigione.' },
    { term: 'Artroprotesi', definition: 'Sostituzione chirurgica parziale o totale di un\'articolazione con un impianto artificiale (protesi), indicata in caso di grave danno articolare.' },
    { term: 'Pseudoartrosi', definition: 'Mancata consolidazione di una frattura oltre i tempi fisiologici attesi, con formazione di tessuto fibroso invece di callo osseo, che richiede solitamente reintervento.' },
    { term: 'Consolidazione', definition: 'Processo biologico di guarigione dell\'osso fratturato con formazione di callo osseo. I tempi variano in base alla sede e al tipo di frattura.' },
    { term: 'Vizio di consolidazione', definition: 'Guarigione della frattura in posizione non anatomica (angolazione, rotazione, accorciamento) con possibili conseguenze funzionali permanenti.' },
    { term: 'ROM (Range of Motion)', definition: 'Ampiezza del movimento articolare, misurata in gradi. La limitazione del ROM e un parametro fondamentale per la quantificazione del danno biologico permanente.' },
  ],
  synthesisGuidance: `Nell'analisi del caso ortopedico, focalizzare l'attenzione sulla conformita della tecnica chirurgica
alle linee guida SIOT e alle buone pratiche cliniche consolidate. Verificare l'appropriatezza
dell'indicazione chirurgica, la scelta dei materiali e delle protesi, e la corretta esecuzione tecnica.
Analizzare la gestione delle complicanze con particolare attenzione alla tempestivita della diagnosi
e dell'intervento correttivo. Valutare l'adeguatezza del follow-up post-operatorio, la prescrizione
e il monitoraggio del percorso riabilitativo. Quantificare i periodi di invalidita temporanea (ITT/ITP)
sulla base della documentazione clinica e valutare il danno biologico permanente con riferimento
al Bareme SIMLA. Considerare le concause preesistenti (patologie degenerative, osteoporosi,
comorbidita) nella determinazione del nesso causale.`,
} as const;
