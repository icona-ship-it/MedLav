import type { CaseTypeKnowledge } from '../types';

export const GENERICA_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'generica',
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
  standardTimelines: [],
  commonAnomalyPatterns: [
    'Mancato rispetto delle linee guida e delle buone pratiche cliniche applicabili',
    'Ritardo nella diagnosi o nel trattamento senza giustificazione clinica documentata',
    'Inadeguatezza del consenso informato o omissione di informazioni rilevanti',
    'Difetto di comunicazione tra operatori sanitari con impatto sulla continuita assistenziale',
    'Mancata o inadeguata documentazione clinica degli eventi rilevanti',
    'Dimissione prematura senza adeguato follow-up programmato',
  ],
  evaluationFrameworks: [
    'Bareme SIMLA',
    'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    'Invalidita Temporanea (ITT/ITP)',
    'Tabelle Ronchi',
    'Tabelle Govoni-Luvoni-Mangili',
  ],
  keyTerminology: [
    { term: 'Danno biologico', definition: 'Lesione dell\'integrita psicofisica della persona, suscettibile di valutazione medico-legale, che incide sulle attivita quotidiane e sugli aspetti dinamico-relazionali della vita del danneggiato, indipendentemente dalla capacita di produrre reddito.' },
    { term: 'Nesso causale', definition: 'Rapporto di causa-effetto tra la condotta sanitaria (azione od omissione) e il danno verificatosi. In ambito civilistico si applica il criterio del "piu probabile che non" (probabilita > 50%).' },
    { term: 'Concause', definition: 'Fattori preesistenti, concomitanti o sopravvenuti che concorrono con la condotta sanitaria nella produzione del danno. La loro presenza non esclude il nesso causale ma puo incidere sulla quantificazione del danno.' },
    { term: 'Consenso informato', definition: 'Diritto del paziente a ricevere informazioni complete su diagnosi, trattamento proposto, alternative, rischi e benefici, e a esprimere la propria volonta consapevole. La violazione del consenso informato e fonte autonoma di responsabilita.' },
    { term: 'Linee guida SNLG', definition: 'Raccomandazioni cliniche pubblicate nel Sistema Nazionale Linee Guida dell\'Istituto Superiore di Sanita, che costituiscono il riferimento per la valutazione della condotta sanitaria ai sensi della L. 24/2017.' },
    { term: 'Responsabilita sanitaria', definition: 'Responsabilita della struttura sanitaria (contrattuale, art. 1218 c.c.) e del professionista sanitario (extracontrattuale, art. 2043 c.c.) per i danni derivanti da prestazioni sanitarie, come disciplinato dalla L. 24/2017.' },
  ],
  synthesisGuidance: `Nell'analisi del caso generico di responsabilita sanitaria, procedere con un approccio sistematico
senza focus specialistico predefinito. Ricostruire la cronologia completa degli eventi clinici
e identificare i momenti critici in cui la condotta sanitaria si e discostata dalle linee guida SNLG
e dalle buone pratiche cliniche applicabili. Analizzare il nesso causale applicando il criterio
civilistico del "piu probabile che non" e considerando le concause preesistenti e sopravvenute.
Verificare la completezza e l'adeguatezza della documentazione clinica, del consenso informato
e della comunicazione tra operatori sanitari. Valutare il danno biologico (temporaneo e permanente)
secondo il Bareme SIMLA. Questa struttura generica va adattata al caso specifico: se emergono
elementi riconducibili a una specialita particolare (ortopedica, oncologica, ostetrica, anestesiologica,
infettivologica o diagnostica), approfondire gli aspetti specifici di quella disciplina.
Mantenere sempre un approccio imparziale e aderente ai dati documentali disponibili.`,
} as const;
