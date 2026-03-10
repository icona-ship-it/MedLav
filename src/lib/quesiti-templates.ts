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
  infortuni: [
    'Dica il CTU se l\'evento lesivo sia avvenuto in occasione di lavoro e se sussista nesso causale con l\'attività lavorativa svolta.',
    'Dica il CTU se siano state rispettate le norme di sicurezza di cui al D.Lgs. 81/2008 e se le misure di prevenzione adottate dal datore di lavoro fossero adeguate.',
    'Quantifichi il CTU il danno biologico permanente e temporaneo, con riferimento alle tabelle INAIL, indicando il grado di menomazione dell\'integrità psicofisica.',
    'Dica il CTU se residui una riduzione permanente della capacità lavorativa specifica.',
  ],
  generica: [
    'Dica il CTU, esaminata la documentazione in atti e visitato il periziando, quale sia stata la condotta diagnostico-terapeutica tenuta dai sanitari.',
    'Dica il CTU se tale condotta sia stata conforme alle leges artis e alle linee guida vigenti al momento dei fatti.',
    'In caso di accertata responsabilità, quantifichi il CTU il danno biologico permanente e temporaneo.',
  ],
};
