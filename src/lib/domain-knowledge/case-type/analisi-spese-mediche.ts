import type { CaseTypeKnowledge } from '../types';

export const ANALISI_SPESE_MEDICHE_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'analisi_spese_mediche',
  reportSections: [
    {
      id: 'premessa',
      title: 'Premessa',
      description: 'Indicazione del mandato ricevuto, del soggetto richiedente (compagnia, studio legale, parte), del caso di riferimento e dell\'oggetto specifico dell\'analisi: valutazione di congruita e rimborsabilita delle spese mediche documentate.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 200 },
    },
    {
      id: 'documentazione_spesa',
      title: 'Documentazione di Spesa Esaminata',
      description: 'Elenco analitico di tutta la documentazione di spesa acquisita: fatture, ricevute, preventivi, note spese, prescrizioni mediche correlate. Per ogni documento indicare data, emittente, importo e prestazione.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 300 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica degli eventi clinici rilevanti ai fini della valutazione delle spese, con date delle prestazioni sanitarie e dei trattamenti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'analisi_voci_spesa',
      title: 'Analisi per Voce di Spesa',
      description: 'Esame analitico di ciascuna voce di spesa: descrizione della prestazione, importo richiesto, confronto con tariffari di riferimento (nomenclatore tariffario regionale, tariffario nazionale SSN), codice ICD/prestazione se disponibile. Per ogni voce esprimere giudizio di congruita.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 800 },
    },
    {
      id: 'congruita_quadro_clinico',
      title: 'Congruita Rispetto al Quadro Clinico',
      description: 'Valutazione della coerenza complessiva delle spese sostenute rispetto alla patologia documentata, alla gravita delle lesioni e all\'iter terapeutico atteso per il tipo di caso. Evidenziare prestazioni eccessive, duplicate o non pertinenti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'necessita_pertinenza',
      title: 'Necessita e Pertinenza delle Prestazioni',
      description: 'Per ogni categoria di prestazione (visite specialistiche, diagnostica, fisioterapia, farmaci, ausili), valutare la necessita medica, la pertinenza rispetto al quadro clinico e la conformita alle linee guida e buone pratiche cliniche.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'spese_future',
      title: 'Spese Future Prevedibili',
      description: 'Stima delle spese mediche future ragionevolmente prevedibili in relazione all\'evoluzione attesa della patologia: ulteriori interventi, terapie riabilitative, farmaci, ausili, visite di controllo. Indicare il grado di probabilita e il range economico stimato.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'riepilogo_importi',
      title: 'Riepilogo Importi',
      description: 'Tabella riepilogativa con: importo totale richiesto, importo ritenuto congruo e rimborsabile, importo non congruo o non pertinente con motivazione sintetica, spese future stimate. Fornire totali per categoria di spesa.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 100, max: 200 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Conclusioni sulla Rimborsabilita',
      description: 'Giudizio conclusivo sulla rimborsabilita complessiva delle spese mediche documentate. Indicare l\'importo totale ritenuto congruo e rimborsabile, le voci escluse con motivazione, le raccomandazioni per la gestione del caso.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [],
  commonAnomalyPatterns: [
    'Spese mediche per prestazioni non correlate al quadro clinico documentato',
    'Importi significativamente superiori ai tariffari regionali o nazionali di riferimento',
    'Prestazioni duplicate o ripetute senza giustificazione clinica',
    'Assenza di prescrizione medica per prestazioni che la richiedono',
    'Trattamenti fisioterapici in numero eccessivo rispetto alle linee guida',
    'Farmaci non pertinenti alla patologia o in dosaggi non giustificati',
    'Ausili e presidi non congrui rispetto al deficit funzionale documentato',
    'Spese per prestazioni in strutture private quando il SSN offre la stessa prestazione',
    'Documentazione di spesa incompleta o non verificabile (ricevute senza dettaglio)',
  ],
  evaluationFrameworks: [
    'Nomenclatore Tariffario Regionale',
    'Tariffario Nazionale SSN',
    'Linee guida riabilitative per patologia',
    'Prontuario Farmaceutico Nazionale',
  ],
  keyTerminology: [
    { term: 'Congruita della spesa', definition: 'Adeguatezza dell\'importo richiesto rispetto alla prestazione effettuata, valutata mediante confronto con i tariffari di riferimento (regionali, nazionali, convenzionali).' },
    { term: 'Necessita della prestazione', definition: 'Valutazione della indispensabilita della prestazione sanitaria rispetto al quadro clinico del paziente. Una prestazione e necessaria quando la sua omissione avrebbe comportato un peggioramento clinico o un ritardo nella guarigione.' },
    { term: 'Pertinenza', definition: 'Correlazione diretta tra la prestazione sanitaria e la patologia oggetto del caso. Prestazioni non pertinenti sono quelle rivolte a patologie diverse o preesistenti non aggravate dal sinistro.' },
    { term: 'Nomenclatore tariffario', definition: 'Elenco ufficiale delle prestazioni sanitarie con i relativi costi massimi rimborsabili, stabilito a livello regionale o nazionale. Costituisce il parametro di riferimento per la valutazione della congruita economica.' },
    { term: 'Spese future', definition: 'Costi sanitari ragionevolmente prevedibili in relazione all\'evoluzione attesa della patologia. Devono essere stimati con ragionevole certezza medico-legale e supportati da evidenze cliniche.' },
  ],
  synthesisGuidance: `Nell'analisi delle spese mediche, procedere con un approccio sistematico voce per voce.
Per ogni prestazione o spesa documentata, valutare tre aspetti distinti: la necessita medica
(la prestazione era clinicamente indicata?), la pertinenza (la prestazione e correlata alla
patologia oggetto del caso?) e la congruita economica (l'importo e in linea con i tariffari
di riferimento?).
Confrontare sistematicamente gli importi con i nomenclatori tariffari regionali e nazionali.
Per le prestazioni fisioterapiche, verificare la coerenza del numero di sedute con le linee
guida riabilitative. Per i farmaci, verificare la pertinenza rispetto alla patologia e la
conformita al Prontuario Farmaceutico Nazionale.
Quando disponibili, indicare i codici ICD della patologia e i codici delle prestazioni per
facilitare il confronto tariffario. Distinguere chiaramente tra spese congrue/rimborsabili
e spese non congrue, motivando ogni esclusione. Concludere con un riepilogo tabellare chiaro
che indichi l'importo totale richiesto, l'importo ritenuto congruo e la differenza, suddivisi
per categoria di spesa. Stimare le spese future prevedibili con il relativo grado di certezza.`,
} as const;
