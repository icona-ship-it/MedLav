import type { CaseTypeKnowledge } from '../types';

export const INFORTUNI_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'infortuni',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali: dinamica dell\'infortunio o dell\'esposizione professionale, lesioni o patologie documentate, iter diagnostico-terapeutico e conclusioni peritali.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 500 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica dettagliata dall\'evento infortunistico o dall\'inizio dell\'esposizione professionale alla stabilizzazione dei postumi, con date, strutture sanitarie e operatori coinvolti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'dinamica_infortunio',
      title: 'Dinamica dell\'Infortunio',
      description: 'Ricostruzione dettagliata della dinamica dell\'infortunio sul lavoro o dell\'esposizione a rischio professionale. Descrizione della mansione lavorativa, delle condizioni ambientali, dei dispositivi di protezione individuale e delle circostanze specifiche dell\'evento.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'nesso_causale_lavorativo',
      title: 'Nesso Causale con Attivita Lavorativa',
      description: 'Analisi del nesso di causalita tra l\'attivita lavorativa (infortunio o esposizione professionale) e le lesioni o patologie documentate. Valutazione del rischio lavorativo specifico, della durata e dell\'intensita dell\'esposizione, della compatibilita eziologica.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
    {
      id: 'danno_biologico',
      title: 'Valutazione del Danno Biologico',
      description: 'Quantificazione del danno biologico: periodi di invalidita temporanea totale e parziale, danno biologico permanente secondo le tabelle INAIL. Calcolo del danno differenziale rispetto all\'indennizzo INAIL, ove applicabile.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 150, max: 300 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi: adeguatezza delle misure di prevenzione, rispetto della normativa sulla sicurezza sul lavoro (D.Lgs. 81/2008), eventuale responsabilita datoriale, completezza della documentazione INAIL.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 400 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Infortunio sul lavoro — denuncia INAIL',
      expectedFollowUpDays: 2,
      expectedRecoveryDays: 90,
      criticalDelayThresholdDays: 3,
      source: 'D.P.R. 1124/1965 art. 53 — Obbligo denuncia infortunio entro 2 giorni',
    },
    {
      procedure: 'Malattia professionale — denuncia INAIL',
      expectedFollowUpDays: 5,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 15,
      source: 'D.P.R. 1124/1965 art. 53 — Obbligo denuncia malattia professionale entro 5 giorni',
    },
    {
      procedure: 'Certificato medico iniziale INAIL',
      expectedFollowUpDays: 1,
      expectedRecoveryDays: 40,
      criticalDelayThresholdDays: 3,
      source: 'INAIL — Certificazione medica dell\'infortunio',
    },
    {
      procedure: 'Stabilizzazione postumi per indennizzo',
      expectedFollowUpDays: 180,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 730,
      source: 'INAIL — Valutazione postumi permanenti',
    },
  ],
  commonAnomalyPatterns: [
    'Ritardo nella denuncia dell\'infortunio o della malattia professionale all\'INAIL',
    'Assenza del certificato medico iniziale o dei certificati di continuazione',
    'Mancata documentazione della dinamica dell\'infortunio e delle condizioni lavorative',
    'Discrepanza tra la mansione dichiarata e le lesioni documentate',
    'Assenza di documentazione sulla valutazione dei rischi e sui DPI forniti',
    'Gap documentale tra il primo soccorso e i controlli INAIL successivi',
    'Mancata distinzione tra patologie lavorative e preesistenti nella documentazione',
    'Certificati medici di continuazione non coerenti con il decorso clinico atteso',
  ],
  evaluationFrameworks: [
    'Tabelle INAIL per l\'indennizzo del danno biologico (D.Lgs. 38/2000)',
    'Bareme SIMLA',
    'Invalidita Temporanea (ITT/ITP)',
    'Tabelle delle malattie professionali INAIL',
  ],
  keyTerminology: [
    { term: 'Infortunio sul lavoro', definition: 'Evento traumatico avvenuto per causa violenta in occasione di lavoro, da cui derivi la morte, l\'inabilita permanente o l\'inabilita temporanea assoluta per piu di tre giorni (art. 2 D.P.R. 1124/1965). Comprende l\'infortunio in itinere.' },
    { term: 'Malattia professionale', definition: 'Patologia contratta nell\'esercizio e a causa dell\'attivita lavorativa per esposizione a rischi specifici. Puo essere tabellata (presunzione legale del nesso causale) o non tabellata (onere della prova a carico del lavoratore).' },
    { term: 'Danno biologico INAIL', definition: 'Menomazione dell\'integrita psicofisica della persona valutata secondo le tabelle allegate al D.Lgs. 38/2000. Indennizzato in capitale per percentuali dal 6% al 15% e in rendita per percentuali dal 16% in su.' },
    { term: 'Danno differenziale', definition: 'Differenza tra il danno biologico complessivo (civilistico, Bareme SIMLA) e l\'indennizzo INAIL. Il lavoratore puo agire in giudizio contro il datore di lavoro per ottenere il risarcimento del danno differenziale e complementare.' },
    { term: 'Infortunio in itinere', definition: 'Infortunio occorso durante il normale percorso di andata e ritorno dal luogo di lavoro (art. 12 D.Lgs. 38/2000). Tutelato dall\'INAIL salvo deviazioni non necessitate e interruzioni non dovute a esigenze essenziali.' },
    { term: 'D.Lgs. 81/2008 (TU Sicurezza)', definition: 'Testo Unico sulla salute e sicurezza nei luoghi di lavoro. Disciplina gli obblighi del datore di lavoro in materia di prevenzione, valutazione dei rischi, formazione, sorveglianza sanitaria e fornitura dei DPI. La sua violazione puo fondare la responsabilita datoriale.' },
  ],
  synthesisGuidance: `Nell'analisi del caso di infortunio sul lavoro o malattia professionale, l'attenzione primaria
va posta sul nesso causale tra l'attivita lavorativa e le lesioni o patologie documentate.
Ricostruire dettagliatamente la dinamica dell'infortunio o le caratteristiche dell'esposizione
professionale, specificando la mansione svolta, le condizioni ambientali e i rischi specifici.
Per gli infortuni: verificare la compatibilita tra la dinamica descritta e le lesioni riportate,
la tempestivita del primo soccorso e la completezza della certificazione INAIL (certificato
iniziale e certificati di continuazione).
Per le malattie professionali: documentare la durata e l'intensita dell'esposizione al rischio,
la compatibilita eziologica con la patologia diagnosticata, la latenza tra esposizione e
insorgenza della malattia.
Quantificare il danno biologico con riferimento alle tabelle INAIL (D.Lgs. 38/2000)
per l'indennizzo e al Bareme SIMLA per la valutazione civilistica. Calcolare il danno
differenziale ove richiesto, distinguendo tra la componente gia indennizzata dall'INAIL
e quella residua risarcibile dal datore di lavoro.
Verificare il rispetto della normativa sulla sicurezza sul lavoro (D.Lgs. 81/2008):
valutazione dei rischi, formazione, sorveglianza sanitaria, fornitura dei DPI.
Considerare le concause preesistenti e la loro incidenza nella determinazione del danno.`,
} as const;
