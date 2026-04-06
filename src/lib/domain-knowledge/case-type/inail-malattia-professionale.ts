import type { CaseTypeKnowledge } from '../types';

export const INAIL_MALATTIA_PROF_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'inail_malattia_prof',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali: patologia denunciata come malattia professionale, mansione lavorativa, esposizione al rischio, iter INAIL, esito della valutazione e motivi del ricorso.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 500, max: 1000 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica: inizio dell\'esposizione lavorativa, insorgenza dei sintomi, diagnosi, denuncia di malattia professionale, accertamenti INAIL, eventuale rigetto e ricorso. Evoluzione della patologia nel tempo.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'esposizione_lavorativa',
      title: 'Esposizione Lavorativa e Rischio Professionale',
      description: 'Descrizione dettagliata della mansione lavorativa, delle condizioni ambientali, dell\'agente patogeno o del rischio specifico. Durata e intensità dell\'esposizione. Misure di prevenzione adottate dal datore di lavoro. Documenti di valutazione dei rischi (DVR), risultati della sorveglianza sanitaria.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'quadro_clinico',
      title: 'Quadro Clinico e Diagnostico',
      description: 'Descrizione della patologia diagnosticata, degli accertamenti strumentali e di laboratorio, della terapia in corso. Stato funzionale attuale e postumi permanenti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'nesso_causale',
      title: 'Nesso di Causalità Professionale',
      description: 'Analisi del nesso eziologico tra l\'esposizione lavorativa e la patologia. Per malattie tabellate: verifica della presunzione legale. Per malattie non tabellate: dimostrazione dell\'eziologia professionale con criteri epidemiologici, clinici e cronologici. Valutazione delle concause extraprofessionali.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
    {
      id: 'danno_biologico',
      title: 'Valutazione del Danno Biologico INAIL',
      description: 'Quantificazione del danno biologico permanente secondo le tabelle allegate al D.Lgs. 38/2000. Periodi di inabilità temporanea assoluta e parziale. Eventuale calcolo del danno differenziale (civilistico - indennizzo INAIL).',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi: adeguatezza della denuncia, completezza della documentazione sulla esposizione, conformità della valutazione INAIL, profili di responsabilità datoriale, necessità di ulteriori accertamenti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Denuncia malattia professionale — certificato medico',
      expectedFollowUpDays: 5,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 15,
      source: 'D.P.R. 1124/1965 art. 53 — Obbligo denuncia malattia professionale entro 5 giorni',
    },
    {
      procedure: 'Prescrizione diritto — denuncia malattia professionale',
      expectedFollowUpDays: 730,
      expectedRecoveryDays: 1095,
      criticalDelayThresholdDays: 1095,
      source: 'D.P.R. 1124/1965 art. 112 — Prescrizione triennale dalla manifestazione della malattia',
    },
    {
      procedure: 'Accertamenti INAIL — visita medico-legale',
      expectedFollowUpDays: 60,
      expectedRecoveryDays: 180,
      criticalDelayThresholdDays: 180,
      source: 'INAIL — Tempistiche istruttoria malattia professionale',
    },
    {
      procedure: 'Stabilizzazione postumi — valutazione danno biologico',
      expectedFollowUpDays: 180,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 730,
      source: 'INAIL — Valutazione postumi permanenti malattia professionale',
    },
    {
      procedure: 'Revisione per aggravamento',
      expectedFollowUpDays: 365,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 3650,
      source: 'D.P.R. 1124/1965 art. 137 — Revisione entro 10 anni (15 per silicosi/asbestosi)',
    },
  ],
  commonAnomalyPatterns: [
    'Documentazione insufficiente sull\'esposizione lavorativa e sul rischio specifico',
    'Assenza del Documento di Valutazione dei Rischi (DVR) o della cartella di sorveglianza sanitaria',
    'Ritardo nella denuncia di malattia professionale oltre i termini normativi',
    'Mancata distinzione tra eziologia professionale e concause extraprofessionali',
    'Discrepanza tra la patologia diagnosticata e il rischio lavorativo documentato',
    'Assenza di dati epidemiologici sulla prevalenza della patologia nel settore lavorativo',
    'Latenza tra esposizione e insorgenza non compatibile con il tipo di patologia',
    'Documentazione incompleta sui periodi di esposizione e sulle mansioni svolte',
    'Mancata considerazione di pregresse esposizioni in precedenti attività lavorative',
    'Assenza di certificati medici di continuazione INAIL nel decorso',
  ],
  evaluationFrameworks: [
    'Tabelle delle malattie professionali INAIL (D.M. 09/04/2008 e aggiornamenti)',
    'Tabelle INAIL per l\'indennizzo del danno biologico (D.Lgs. 38/2000)',
    'D.P.R. 1124/1965 — Testo unico infortuni e malattie professionali',
    'D.Lgs. 38/2000 — Riforma indennizzo INAIL (danno biologico)',
    'D.Lgs. 81/2008 — Testo unico sicurezza sul lavoro',
    'Bareme SIMLA — per danno differenziale civilistico',
    'Criteri Bradford Hill per nesso causale epidemiologico',
  ],
  keyTerminology: [
    { term: 'Malattia professionale tabellata', definition: 'Patologia inclusa nelle tabelle allegate al D.P.R. 1124/1965 (aggiornate con D.M. 09/04/2008). Per le malattie tabellate vige la presunzione legale del nesso causale: il lavoratore deve provare solo la malattia, la lavorazione e l\'adibizione. L\'INAIL può fornire la prova contraria.' },
    { term: 'Malattia professionale non tabellata', definition: 'Patologia non inclusa nelle tabelle ma di possibile eziologia professionale (sistema misto introdotto dalla Corte Cost. sent. 179/1988). L\'onere della prova del nesso causale grava interamente sul lavoratore, che deve dimostrare con ragionevole probabilità la derivazione professionale.' },
    { term: 'Nesso di causalità professionale', definition: 'Rapporto eziologico tra l\'esposizione lavorativa e la patologia. Si valuta con criterio di ragionevole probabilità (più probabile che non, >50%). Criteri: plausibilità biologica, dose-risposta, temporalità, consistenza epidemiologica, esclusione di cause alternative.' },
    { term: 'Danno biologico INAIL (D.Lgs. 38/2000)', definition: 'Menomazione dell\'integrità psicofisica valutata secondo le tabelle allegate al D.Lgs. 38/2000. Indennizzato in capitale per percentuali 6-15% e in rendita dal 16%. Per percentuali 1-5% nessun indennizzo. La tabella INAIL differisce dal barème civilistico (SIMLA).' },
    { term: 'Danno differenziale', definition: 'Differenza tra il danno biologico complessivo valutato in sede civilistica (barème SIMLA) e l\'indennizzo INAIL (tabelle D.Lgs. 38/2000). Il lavoratore può agire contro il datore per il risarcimento del danno differenziale in caso di responsabilità ex art. 2087 c.c.' },
    { term: 'Concause extraprofessionali', definition: 'Fattori non lavorativi che concorrono alla determinazione della patologia (predisposizione individuale, abitudini voluttuarie, patologie preesistenti). In ambito INAIL, la concausa non esclude il riconoscimento se l\'esposizione lavorativa ha avuto efficienza causale.' },
    { term: 'Sorveglianza sanitaria (D.Lgs. 81/2008)', definition: 'Attività del medico competente finalizzata alla tutela della salute dei lavoratori esposti a rischi professionali. Comprende visite preventive, periodiche, su richiesta e per cambio mansione. La cartella sanitaria e di rischio documenta l\'evoluzione dello stato di salute.' },
  ],
  commonQuesiti: [
    'Accerti il CTU se la patologia riscontrata nel periziando sia riconducibile con ragionevole probabilità all\'esposizione lavorativa, specificando l\'agente patogeno, la durata e l\'intensità dell\'esposizione.',
    'Indichi il CTU se la malattia sia tabellata o non tabellata ai sensi delle vigenti tabelle INAIL, e valuti la sussistenza del nesso causale con l\'attività lavorativa svolta.',
    'Quantifichi il CTU il danno biologico permanente secondo le tabelle allegate al D.Lgs. 38/2000, specificando i periodi di inabilità temporanea assoluta e relativa.',
    'Valuti il CTU l\'eventuale danno differenziale tra la menomazione complessiva (barème civilistico) e l\'indennizzo INAIL, ove venga in rilievo la responsabilità datoriale.',
    'Accerti il CTU se il datore di lavoro abbia adempiuto agli obblighi di prevenzione e sorveglianza sanitaria previsti dal D.Lgs. 81/2008.',
    'Indichi il CTU se la patologia sia suscettibile di aggravamento e se sussistano i presupposti per la revisione ai sensi dell\'art. 137 D.P.R. 1124/1965.',
  ],
  synthesisGuidance: `Nell'analisi della malattia professionale, il nodo centrale è la dimostrazione del nesso
di causalità tra l'esposizione lavorativa e la patologia diagnosticata.
Per malattie tabellate: verificare che la patologia rientri nelle tabelle vigenti (D.M. 09/04/2008),
che la lavorazione sia tra quelle previste e che il lavoratore vi sia stato effettivamente adibito.
In tal caso opera la presunzione legale del nesso.
Per malattie non tabellate: applicare i criteri epidemiologici e clinici per la dimostrazione
del nesso (plausibilità biologica, dose-risposta, temporalità, consistenza con la letteratura
scientifica, esclusione di cause alternative). Il criterio è quello della ragionevole probabilità
("più probabile che non").
Documentare con precisione: la mansione lavorativa effettivamente svolta (non solo quella
contrattuale), l'agente patogeno o il rischio specifico, la durata e l'intensità dell'esposizione,
i risultati della sorveglianza sanitaria, le misure di prevenzione adottate.
Valutare le concause extraprofessionali senza escludere il nesso quando l'esposizione
lavorativa abbia avuto efficienza causale anche parziale.
Per il danno biologico, utilizzare le tabelle INAIL (D.Lgs. 38/2000) per la componente
indennitaria e il barème SIMLA per l'eventuale danno differenziale civilistico.
Considerare la possibilità di revisione per aggravamento e i termini di prescrizione.`,
} as const;
