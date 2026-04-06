import type { CaseType } from '@/types';

export const QUESITI_TEMPLATES: Record<CaseType, readonly string[]> = {
  ortopedica: [
    'Dica il CTU, esaminata la documentazione in atti e visitato il periziando, quale sia stata la condotta diagnostico-terapeutica tenuta dai sanitari della struttura convenuta.',
    'Dica il CTU se tale condotta sia stata conforme alle leges artis e alle linee guida vigenti al momento dei fatti.',
    'In caso di accertata responsabilità, quantifichi il CTU il danno biologico permanente e temporaneo, i periodi di inabilità temporanea (totale e parziale), e la necessità di cure future.',
    'Dica il CTU se residuino esiti invalidanti, quantificandoli secondo i criteri del Barème SIMLA.',
  ],
  oncologica: [
    'Dica il CTU se la diagnosi oncologica sia stata tempestiva ovvero se vi sia stato un ritardo diagnostico, indicandone l\'entità temporale.',
    'Dica il CTU se una diagnosi tempestiva avrebbe consentito un trattamento meno invasivo e/o una prognosi migliore, quantificando la perdita di chance in termini probabilistici.',
    'Quantifichi il CTU il danno biologico differenziale, comprensivo del danno oncologico, e i periodi di inabilità temporanea.',
  ],
  ostetrica: [
    'Dica il CTU se la gestione del travaglio e del parto sia stata conforme alle linee guida SIGO/AOGOI e alle buone pratiche cliniche.',
    'Dica il CTU se il tracciato cardiotocografico sia stato correttamente interpretato e se i tempi di intervento siano stati adeguati.',
    'In caso di accertata responsabilità, quantifichi il CTU il danno biologico permanente e temporaneo a carico del neonato e/o della madre.',
  ],
  anestesiologica: [
    'Dica il CTU se la gestione anestesiologica sia stata conforme alle buone pratiche cliniche e alle linee guida SIAARTI.',
    'Dica il CTU se il monitoraggio intra e post-operatorio sia stato adeguato e se le complicanze siano state tempestivamente riconosciute e gestite.',
    'Quantifichi il CTU il danno biologico permanente e temporaneo conseguente all\'eventuale condotta imperita.',
  ],
  infezione_nosocomiale: [
    'Dica il CTU se la struttura sanitaria abbia adottato adeguate misure di prevenzione delle infezioni nosocomiali secondo le linee guida nazionali e internazionali.',
    'Dica il CTU se l\'infezione contratta sia riconducibile a carenze organizzative o igienico-sanitarie della struttura.',
    'Quantifichi il CTU il danno biologico permanente e temporaneo derivante dall\'infezione nosocomiale, comprensivo del prolungamento della degenza e delle cure aggiuntive.',
  ],
  errore_diagnostico: [
    'Dica il CTU se l\'iter diagnostico seguito dai sanitari sia stato conforme alle linee guida e alle buone pratiche cliniche.',
    'Dica il CTU se una corretta diagnosi avrebbe consentito un trattamento tempestivo con esito migliore, quantificando la perdita di chance.',
    'Quantifichi il CTU il danno biologico permanente e temporaneo, comprensivo del danno da ritardo diagnostico.',
  ],
  rc_auto: [
    'Dica il CTU, esaminata la documentazione in atti e visitato il periziando, quali lesioni personali abbia riportato a seguito del sinistro stradale in oggetto.',
    'Dica il CTU se sussista nesso causale tra il sinistro e le lesioni riscontrate, con particolare riferimento ai criteri di cui all\'Art. 139 del Codice delle Assicurazioni.',
    'Quantifichi il CTU l\'invalidità temporanea (totale e parziale) e il danno biologico permanente secondo le tabelle di legge, indicando eventuali postumi.',
    'Dica il CTU se residui necessità di cure future e/o spese mediche documentate.',
  ],
  previdenziale: [
    'Dica il CTU quale sia lo stato di salute complessivo del periziando, con riferimento a tutte le patologie documentate.',
    'Dica il CTU se le infermità riscontrate comportino una riduzione permanente della capacità lavorativa, quantificandola in misura percentuale secondo le tabelle di cui al D.M. 05/02/1992.',
    'Dica il CTU se il periziando sia da considerarsi invalido civile ai sensi della L. 118/1971 e successive modificazioni, indicando la percentuale di invalidità.',
  ],
  previdenziale_dlgs62: [
    'Accerti il CTU se il periziando sia affetto da condizione di disabilità ai sensi del D.Lgs. 62/2024 e, in caso affermativo, ne descriva l\'entità secondo il modello ICF.',
    'Valuti il CTU se la valutazione multidimensionale effettuata dalla commissione sia conforme ai criteri previsti dal D.Lgs. 62/2024 e dalla classificazione ICF.',
    'Accerti il CTU se il progetto di vita individuale elaborato dalla commissione sia adeguato alle esigenze di sostegno del periziando.',
    'Valuti il CTU le limitazioni dell\'attività e le restrizioni alla partecipazione del periziando, specificando i fattori ambientali facilitanti e le barriere esistenti.',
  ],
  previdenziale_inv_civile: [
    'Quantifichi il CTU la percentuale di invalidità civile del periziando, con riferimento alle tabelle del D.M. 05/02/1992, specificando le singole menomazioni e la percentuale complessiva.',
    'Accerti il CTU se il periziando sia persona non in grado di deambulare senza l\'aiuto permanente di un accompagnatore, ovvero non in grado di compiere gli atti quotidiani della vita senza assistenza continua (L. 18/1980).',
    'Valuti il CTU la sussistenza dei requisiti sanitari per il riconoscimento dell\'handicap grave ai sensi dell\'art. 3 comma 3 della L. 104/1992.',
    'Indichi il CTU la data di insorgenza dell\'invalidità e se le infermità riscontrate siano suscettibili di miglioramento.',
  ],
  infortuni: [
    'Dica il CTU se l\'evento lesivo sia avvenuto in occasione di lavoro e se sussista nesso causale con l\'attività lavorativa svolta.',
    'Dica il CTU se siano state rispettate le norme di sicurezza di cui al D.Lgs. 81/2008 e se le misure di prevenzione adottate dal datore di lavoro fossero adeguate.',
    'Quantifichi il CTU il danno biologico permanente e temporaneo, con riferimento alle tabelle INAIL, indicando il grado di menomazione dell\'integrità psicofisica.',
    'Dica il CTU se residui una riduzione permanente della capacità lavorativa specifica.',
  ],
  inail_malattia_prof: [
    'Accerti il CTU se la patologia riscontrata nel periziando sia riconducibile con ragionevole probabilità all\'esposizione lavorativa, specificando l\'agente patogeno, la durata e l\'intensità dell\'esposizione.',
    'Indichi il CTU se la malattia sia tabellata o non tabellata ai sensi delle vigenti tabelle INAIL.',
    'Quantifichi il CTU il danno biologico permanente secondo le tabelle allegate al D.Lgs. 38/2000, specificando i periodi di inabilità temporanea.',
    'Valuti il CTU l\'eventuale danno differenziale tra la menomazione complessiva e l\'indennizzo INAIL.',
  ],
  inail_infortunio: [
    'Accerti il CTU la dinamica dell\'infortunio e la sussistenza del nesso causale tra l\'evento traumatico e le lesioni documentate.',
    'Quantifichi il CTU il danno biologico permanente secondo le tabelle allegate al D.Lgs. 38/2000.',
    'Valuti il CTU se la percentuale di danno biologico attribuita dall\'INAIL sia congrua rispetto ai postumi accertati.',
    'Accerti il CTU se il datore di lavoro abbia adempiuto agli obblighi di sicurezza previsti dal D.Lgs. 81/2008.',
  ],
  perizia_assicurativa: [
    'Descriva il perito le lesioni riportate dal danneggiato a seguito del sinistro in oggetto, verificando la compatibilità con la dinamica dichiarata.',
    'Valuti il perito il nesso causale tra il sinistro e le lesioni riscontrate, con particolare attenzione a eventuali patologie preesistenti nella medesima sede anatomica.',
    'Quantifichi il perito il danno biologico permanente e i periodi di invalidità temporanea (totale e parziale) con riferimento alle tabelle di legge applicabili.',
    'Esprima il perito giudizio sulla congruità delle spese mediche documentate e sulla necessità delle cure effettuate.',
  ],
  analisi_spese_mediche: [
    'Valuti il perito la congruità delle spese mediche documentate rispetto al quadro clinico del danneggiato, indicando per ciascuna voce se la spesa sia necessaria, pertinente e congrua nell\'importo.',
    'Confronti il perito gli importi delle prestazioni con i tariffari regionali e nazionali di riferimento, segnalando eventuali scostamenti significativi.',
    'Indichi il perito le spese mediche future ragionevolmente prevedibili in relazione all\'evoluzione attesa della patologia.',
    'Esprima il perito un giudizio complessivo sulla rimborsabilità delle spese, indicando l\'importo totale ritenuto congruo.',
  ],
  opinione_prognostica: [
    'Descriva il perito lo stato attuale delle lesioni del danneggiato e il grado di stabilizzazione raggiunto.',
    'Esprima il perito una previsione sull\'evoluzione clinica delle lesioni, indicando la data probabile di stabilizzazione dei postumi.',
    'Fornisca il perito una stima provvisoria del danno biologico permanente atteso, espressa come range percentuale con indicazione del livello di confidenza.',
    'Stimi il perito le spese mediche future prevedibili e indichi la tempistica consigliata per la rivalutazione del caso.',
  ],
  generica: [
    'Dica il CTU, esaminata la documentazione in atti e visitato il periziando, quale sia stata la condotta diagnostico-terapeutica tenuta dai sanitari.',
    'Dica il CTU se tale condotta sia stata conforme alle leges artis e alle linee guida vigenti al momento dei fatti.',
    'In caso di accertata responsabilità, quantifichi il CTU il danno biologico permanente e temporaneo.',
  ],
};
