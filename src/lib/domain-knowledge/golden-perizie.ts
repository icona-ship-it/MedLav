import type { CaseType, CaseRole } from '@/types';

interface GoldenPerizia {
  readonly caseType: CaseType;
  readonly role: CaseRole;
  readonly excerpt: string;
}

export const GOLDEN_PERIZIE: readonly GoldenPerizia[] = [
  // ── ORTOPEDICA ──────────────────────────────────────────

  {
    caseType: 'ortopedica',
    role: 'ctu',
    excerpt: `## RIASSUNTO DEL CASO

Il caso riguarda il sig. R.M., di anni 68, sottoposto in data 15/03/2023 a intervento di artroprotesi totale dell'anca destra presso la Clinica San Carlo di Milano. La documentazione acquisita comprende la cartella clinica del ricovero (A), i referti dei controlli ambulatoriali post-operatori (B), gli esami radiologici pre e post-operatori (C) e gli esami ematochimici (D).

Il decorso post-operatorio è stato complicato da lussazione protesica recidivante, diagnosticata in data 22/04/2023 e successivamente in data 10/06/2023, che ha richiesto intervento di revisione in data 28/06/2023.

## CRONOLOGIA MEDICO-LEGALE (estratto)

15/03/2023 — (A) Intervento di artroprotesi totale anca destra. Accesso postero-laterale sec. Kocher-Langenbeck. Impianto stelo non cementato e cotile press-fit. Decorso intraoperatorio regolare, perdita ematica stimata 400 ml.

22/04/2023 — (C) RX bacino con proiezioni assiali: evidenza di lussazione posteriore della protesi d'anca destra. Offset femorale ridotto rispetto al controlaterale.

28/06/2023 — (A) Intervento di revisione protesica anca destra. Sostituzione dell'inserto acetabolare con componente a ritenzione e riposizionamento dello stelo femorale con incremento dell'offset.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Da un lato, si rileva che l'indicazione all'intervento primario era correttamente posta in ragione della coxartrosi avanzata documentata dagli esami strumentali pre-operatori. Dall'altro, l'analisi della documentazione operatoria evidenzia un posizionamento acetabolare con angolo di inclinazione di 55°, superiore al range raccomandato dalle linee guida AAOS (40°-45° sec. Lewinnek et al.), circostanza che ha verosimilmente contribuito all'instabilità protesica.

Il nesso causale tra il posizionamento della componente acetabolare e la lussazione recidivante appare configurabile secondo il criterio del "più probabile che non", in quanto la letteratura scientifica documenta un'incidenza di lussazione significativamente superiore per angoli di abduzione eccedenti i 50° (Callanan et al., JBJS 2011).

Si segnala peraltro che il consenso informato acquisito agli atti menziona genericamente il rischio di lussazione tra le possibili complicanze, senza tuttavia quantificarne l'incidenza né illustrare le specifiche condizioni anatomo-funzionali del paziente.

Ai fini della quantificazione del danno biologico, si stima: ITT giorni 15, ITP al 75% giorni 30, ITP al 50% giorni 60, ITP al 25% giorni 90. Il danno biologico permanente è valutabile nella misura del 18-20% secondo i criteri del Barème SIMLA per gli esiti di artroprotesi d'anca con revisione.`,
  },

  {
    caseType: 'ortopedica',
    role: 'ctp',
    excerpt: `## RIASSUNTO DEL CASO

Il sig. R.M., di anni 68, è stato sottoposto in data 15/03/2023 a intervento di artroprotesi totale dell'anca destra presso la Clinica San Carlo di Milano. L'analisi della documentazione sanitaria evidenzia plurime criticità nella gestione chirurgica e nel follow-up post-operatorio che hanno determinato lussazione protesica recidivante e necessità di revisione chirurgica.

## CRONOLOGIA MEDICO-LEGALE (estratto)

15/03/2023 — (A) Intervento di artroprotesi totale anca destra con accesso postero-laterale. Si rileva che la descrizione operatoria è carente nella specificazione dell'orientamento delle componenti protesiche e non riporta misurazioni intraoperatorie dell'offset e della lunghezza dell'arto.

22/04/2023 — (C) RX bacino: lussazione posteriore della protesi d'anca destra. L'angolo di inclinazione acetabolare misura 55°, nettamente al di fuori della "safe zone" di Lewinnek (40°±10°). Questa evidenza radiografica documenta in modo inequivocabile il malposizionamento della componente acetabolare.

28/06/2023 — (A) Intervento di revisione protesica con sostituzione dell'inserto e riposizionamento dello stelo. L'intervento di revisione conferma implicitamente l'errore di posizionamento iniziale.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Risulta evidente che il posizionamento della componente acetabolare con angolo di inclinazione di 55° costituisce una deviazione significativa rispetto allo standard di cura raccomandato dalle linee guida internazionali (AAOS, EFORT). La letteratura scientifica è univoca nell'identificare il malposizionamento acetabolare quale principale fattore di rischio per lussazione protesica (Biedermann et al., Clin Orthop 2005; Callanan et al., JBJS 2011).

La condotta chirurgica è censurabile sotto il profilo dell'imperizia, in quanto il corretto orientamento delle componenti protesiche rappresenta una competenza fondamentale nella chirurgia sostitutiva dell'anca.

Si rileva inoltre che il consenso informato risulta gravemente carente: non quantifica il rischio di lussazione (stimabile al 2-5% nella protesizzazione primaria), non illustra le alternative terapeutiche e non documenta un'adeguata informazione sulle specificità anatomiche del paziente.

Il nesso di causalità tra la condotta imperita e il danno subito è diretto e incontrovertibile: il malposizionamento ha causato la lussazione recidivante e la necessità di revisione chirurgica, con prolungamento dell'inabilità e peggioramento della prognosi funzionale. Il danno biologico permanente è valutabile nella misura non inferiore al 20% (Barème SIMLA).`,
  },

  // ── ONCOLOGICA ──────────────────────────────────────────

  {
    caseType: 'oncologica',
    role: 'ctu',
    excerpt: `## RIASSUNTO DEL CASO

La sig.ra L.F., di anni 52, lamenta un ritardo diagnostico di carcinoma mammario. In data 08/01/2022 eseguiva mammografia di screening (C) refertata come BIRADS 2 (reperto benigno). A distanza di 14 mesi, in data 10/03/2023, una mammografia con ecografia (C) evidenziava nodulo sospetto di 28 mm al QSE della mammella sinistra, classificato BIRADS 5. L'esame istologico su agobiopsia (D) confermava carcinoma duttale infiltrante, grado 3, Ki-67 45%, HER2 positivo, stadio IIB (pT2N1).

## CRONOLOGIA MEDICO-LEGALE (estratto)

08/01/2022 — (C) Mammografia bilaterale: parenchima mammario a densità ACR C. Si descrive "lieve distorsione architetturale al QSE sinistro, verosimilmente riferibile a esito cicatriziale". Classificazione BIRADS 2.

10/03/2023 — (C) Mammografia con ecografia complementare: nodulo solido ipoecogeno a margini irregolari, 28 mm, QSE mammella sinistra. BIRADS 5.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

L'analisi del caso richiede la valutazione della correttezza della lettura mammografica del 08/01/2022. Da un lato, la distorsione architetturale descritta nel referto poteva effettivamente corrispondere a un esito cicatriziale in un parenchima ad alta densità (ACR C), condizione che notoriamente riduce la sensibilità mammografica. Dall'altro, le linee guida europee (EUSOBI 2017) e nazionali (GISMa) raccomandano che una distorsione architetturale in assenza di pregresso trauma o chirurgia debba essere classificata come almeno BIRADS 3 con indicazione a ecografia complementare e follow-up a breve termine (6 mesi).

Il nesso causale tra l'eventuale sottostima mammografica e il danno lamentato va analizzato in termini di perdita di chance di una diagnosi più precoce. Applicando il criterio del "più probabile che non", si stima che una diagnosi anticipata di 14 mesi avrebbe verosimilmente consentito l'identificazione della neoplasia a uno stadio inferiore (IA-IB), con riduzione significativa della necessità di chemioterapia e miglioramento della prognosi a 5 anni (sopravvivenza stadio I: 98-100% vs stadio IIB: 85-90%).

Si segnala tuttavia che la mammografia presenta limitazioni intrinseche nei seni ad alta densità, con tassi di falsi negativi documentati fino al 20% nella letteratura (Kolb et al., Radiology 2002).`,
  },

  {
    caseType: 'oncologica',
    role: 'ctp',
    excerpt: `## RIASSUNTO DEL CASO

La sig.ra L.F., di anni 52, è stata vittima di un grave ritardo diagnostico di carcinoma mammario. La mammografia del 08/01/2022 presentava una distorsione architetturale al QSE della mammella sinistra che è stata erroneamente classificata come reperto benigno (BIRADS 2), omettendo qualsiasi approfondimento diagnostico. La diagnosi corretta è giunta solo 14 mesi dopo, quando la neoplasia aveva raggiunto lo stadio IIB con metastasi linfonodali.

## CRONOLOGIA MEDICO-LEGALE (estratto)

08/01/2022 — (C) Mammografia bilaterale: descritta "distorsione architetturale al QSE sinistro". Il radiologo ha classificato il reperto come BIRADS 2, omettendo l'indicazione a ecografia complementare e a follow-up ravvicinato, in palese violazione delle linee guida GISMa e EUSOBI.

10/03/2023 — (C) Mammografia con ecografia: nodulo di 28 mm al QSE sinistro, BIRADS 5. Questa localizzazione coincide esattamente con la sede della distorsione architetturale ignorata 14 mesi prima.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Risulta evidente che la lettura della mammografia del 08/01/2022 è stata gravemente inadeguata. La distorsione architetturale in assenza di anamnesi chirurgica o traumatica rappresenta un segno mammografico ad alto valore predittivo per carcinoma (VPP 60-80%, Frankel et al., AJR 2019). La classificazione BIRADS 2 costituisce un errore interpretativo inaccettabile secondo gli standard della radiologia senologica.

La mancata indicazione di ecografia complementare e agobiopsia ha determinato un ritardo diagnostico di almeno 14 mesi, durante i quali la neoplasia è progredita dallo stadio presumibile IA (T1N0) allo stadio accertato IIB (T2N1), con coinvolgimento linfonodale e necessità di chemioterapia neoadiuvante.

Il nesso di causalità è configurabile in termini di perdita di chance: la diagnosi tempestiva avrebbe consentito un trattamento conservativo con prognosi eccellente (sopravvivenza a 5 anni >98%), mentre lo stadio attuale comporta una riduzione prognostica significativa e un aggravamento terapeutico (chemioterapia, mastectomia) evitabile. Il danno biologico permanente, comprensivo del danno differenziale oncologico, è valutabile nella misura non inferiore al 30% (Barème SIMLA, voce "perdita di chance oncologica").`,
  },

  // ── OSTETRICA ───────────────────────────────────────────

  {
    caseType: 'ostetrica',
    role: 'ctu',
    excerpt: `## RIASSUNTO DEL CASO

Il caso riguarda la gestione del parto della sig.ra A.B., primipara di anni 31, avvenuto il 12/07/2023 presso l'Ospedale San Giovanni di Roma. Il neonato ha riportato encefalopatia ipossico-ischemica di grado II sec. Sarnat, con esiti neurologici in corso di definizione. La documentazione comprende la cartella ostetrica (A), il tracciato cardiotocografico (C), i referti neonatologici (B) e gli esami ematochimici (D).

## CRONOLOGIA MEDICO-LEGALE (estratto)

12/07/2023 ore 08:00 — (A) Ricovero per travaglio spontaneo a 39+4 settimane. Membrane integre, dilatazione cervicale 3 cm. CTG in ingresso: tracciato rassicurante con variabilità normale.

12/07/2023 ore 14:30 — (C) CTG: comparsa di decelerazioni variabili ripetitive con riduzione della variabilità a breve termine. La classificazione FIGO corrisponde a tracciato "sospetto".

12/07/2023 ore 16:45 — (A) Decisione per taglio cesareo urgente. Intervallo decisione-nascita: 52 minuti.

12/07/2023 ore 17:37 — (A) Nascita mediante taglio cesareo. Apgar 3/6/7. pH arterioso funicolare 7,02, BE -14 mmol/L.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

L'analisi del tracciato cardiotocografico evidenzia che le decelerazioni variabili ripetitive con riduzione della variabilità sono comparse alle ore 14:30. Da un lato, la decisione di procedere a taglio cesareo è stata assunta alle ore 16:45, con un intervallo di osservazione di oltre 2 ore dal primo tracciato sospetto. Le linee guida NICE (2023) e le raccomandazioni SIGO/AOGOI indicano che un tracciato CTG patologico richiede intervento entro 30 minuti. Dall'altro, la documentazione riporta che tra le 14:30 e le 16:00 sono state attuate manovre conservative (cambio posizione, idratazione, sospensione ossitocina) e che il tracciato ha mostrato transitoria normalizzazione alle ore 15:15.

L'intervallo decisione-nascita di 52 minuti si colloca oltre la soglia raccomandata di 30 minuti per il cesareo urgente (categoria 1 RCOG), circostanza che merita approfondimento. Il pH funicolare di 7,02 con BE -14 documenta un'acidosi metabolica significativa compatibile con sofferenza ipossica intrapartum.

Il nesso causale tra i tempi di intervento e l'esito neonatale richiede ulteriore valutazione alla luce della risonanza magnetica encefalo neonatale e del follow-up neurologico.`,
  },

  {
    caseType: 'ostetrica',
    role: 'ctp',
    excerpt: `## RIASSUNTO DEL CASO

La sig.ra A.B., primipara di anni 31, ha partorito in data 12/07/2023 presso l'Ospedale San Giovanni di Roma. A causa di un grave ritardo nell'esecuzione del taglio cesareo in presenza di sofferenza fetale documentata, il neonato ha riportato encefalopatia ipossico-ischemica di grado II sec. Sarnat, con acidosi metabolica severa (pH 7,02, BE -14).

## CRONOLOGIA MEDICO-LEGALE (estratto)

12/07/2023 ore 14:30 — (C) CTG: decelerazioni variabili ripetitive con riduzione della variabilità. Tracciato classificabile come "patologico" secondo i criteri FIGO. Nonostante la gravità del quadro, non viene disposto alcun intervento immediato.

12/07/2023 ore 16:45 — (A) Solo dopo 2 ore e 15 minuti dal primo tracciato patologico viene presa la decisione per taglio cesareo. Un ritardo ingiustificabile che ha esposto il feto a ipossia prolungata.

12/07/2023 ore 17:37 — (A) Nascita con Apgar 3/6/7. pH funicolare 7,02, BE -14 mmol/L. I parametri neonatali documentano inequivocabilmente una sofferenza fetale severa.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Risulta evidente che la gestione del travaglio è stata gravemente inadeguata sotto molteplici profili.

Il tracciato CTG delle ore 14:30 presentava caratteristiche di patologicità che imponevano un intervento immediato secondo le linee guida NICE, FIGO e SIGO/AOGOI. Il ritardo di 2 ore e 15 minuti nella decisione per cesareo è incompatibile con qualsiasi standard di buona pratica ostetrica. L'intervallo decisione-nascita di 52 minuti eccede inoltre il limite di 30 minuti raccomandato dalla classificazione RCOG per il cesareo di categoria 1 (minaccia immediata per la vita del feto).

L'acidosi metabolica documentata (pH 7,02, BE -14) conferma che il feto ha subito un'ipossia prolungata durante il periodo di inerzia decisionale. I criteri ACOG per l'asfissia intrapartum (pH <7,10, BE <-12, Apgar <5 a 5 minuti, encefalopatia neonatale) sono tutti soddisfatti.

Il nesso causale tra il ritardo nell'espletamento del parto e l'encefalopatia neonatale è diretto: un cesareo tempestivo alle ore 15:00 avrebbe con elevata probabilità evitato o significativamente ridotto il danno ipossico-ischemico. Il danno biologico permanente sarà quantificabile in relazione agli esiti neurologici definitivi.`,
  },

  // ── RC AUTO ────────────────────────────────────────────

  {
    caseType: 'rc_auto',
    role: 'ctu',
    excerpt: `## RIASSUNTO DEL CASO

Il caso riguarda il sig. G.T., di anni 45, coinvolto in data 03/09/2023 in un sinistro stradale con dinamica di tamponamento posteriore ad alta energia, occorso sulla S.S. 36 all'altezza del km 28. La documentazione acquisita comprende il verbale dei Carabinieri e il rapporto del 118 (A), la cartella clinica del Pronto Soccorso dell'Ospedale Manzoni di Lecco (B), i referti degli esami strumentali (C) e la documentazione fisiatrica riabilitativa (D).

Il sig. G.T. riportava distorsione del rachide cervicale (c.d. "colpo di frusta") con diagnosi di whiplash di grado II sec. classificazione Quebec Task Force. Il decorso clinico è stato caratterizzato da cervicalgia persistente con limitazione funzionale e cefalea muscolotensiva, trattate con terapia farmacologica e ciclo riabilitativo.

## CRONOLOGIA MEDICO-LEGALE (estratto)

03/09/2023 ore 18:20 — (A) Sinistro stradale: tamponamento posteriore da veicolo che sopraggiungeva a velocità stimata di 60 km/h. Intervento 118, immobilizzazione con collare cervicale e trasporto in PS.

03/09/2023 ore 19:10 — (B) Accesso PS Ospedale Manzoni: dolore cervicale con contrattura paravertebrale, ROM cervicale limitato in tutte le direzioni. RX rachide cervicale: rettilineizzazione della lordosi fisiologica, non fratture. Diagnosi: distorsione del rachide cervicale. Prognosi 10 giorni.

22/09/2023 — (C) RM rachide cervicale: protrusione discale C4-C5 e C5-C6 con lieve impronta sul sacco durale. Assenza di ernia espulsa e di mielopatia. Edema dei legamenti interspinosi C4-C6 compatibile con recente evento traumatico.

15/12/2023 — (D) Visita fisiatrica conclusiva: residua cervicalgia di grado lieve-moderato con limitazione del ROM cervicale del 15% circa. Completato ciclo di 20 sedute di fisioterapia.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

L'analisi della documentazione consente di formulare le seguenti considerazioni in ordine al nesso causale e alla quantificazione del danno ai sensi dell'Art. 139 del Codice delle Assicurazioni Private (D.Lgs. 209/2005) e successive modificazioni.

Da un lato, la dinamica del sinistro (tamponamento posteriore ad alta energia) è biomeccanicamente compatibile con il meccanismo lesivo del whiplash cervicale, come confermato dall'edema legamentoso riscontrato alla RM eseguita a 19 giorni dal trauma. La continuità clinica tra l'evento traumatico e la sintomatologia è documentata dagli accessi sanitari ravvicinati e dalla risposta al trattamento riabilitativo. Dall'altro, si rileva che le protrusioni discali C4-C5 e C5-C6 potrebbero configurare una condizione preesistente di tipo degenerativo, comune nella fascia di età del periziando, circostanza che impone una valutazione differenziale tra danno traumatico e stato anteriore.

Il nesso causale tra il sinistro e il danno biologico residuo è configurabile secondo il criterio del "più probabile che non" per quanto attiene alla sintomatologia cervicale post-traumatica, mentre per le protrusioni discali si ritiene che il trauma abbia agito come concausa di slatentizzazione di una condizione degenerativa preesistente.

Ai fini della quantificazione del danno, applicando le tabelle di cui all'Art. 139 CdA e i criteri SIMLA, si stima: ITT giorni 5, ITP al 75% giorni 15, ITP al 50% giorni 30, ITP al 25% giorni 45. Il danno biologico permanente è valutabile nella misura del 3-4% per gli esiti di distorsione cervicale con residua limitazione funzionale.`,
  },

  {
    caseType: 'rc_auto',
    role: 'ctp',
    excerpt: `## RIASSUNTO DEL CASO

Il sig. G.T., di anni 45, è stato vittima in data 03/09/2023 di un grave sinistro stradale causato dal tamponamento posteriore ad opera di veicolo che procedeva a velocità elevata sulla S.S. 36. L'impatto ha determinato distorsione del rachide cervicale con lesioni legamentose documentate alla RM e sindrome post-traumatica cervicale persistente, con significative ripercussioni sulla qualità di vita e sulla capacità lavorativa del periziando.

## CRONOLOGIA MEDICO-LEGALE (estratto)

03/09/2023 ore 18:20 — (A) Sinistro stradale di gravità rilevante: tamponamento posteriore a velocità stimata di 60 km/h. L'intervento del 118 con immobilizzazione cervicale e trasporto in PS documenta la serietà dell'evento lesivo.

03/09/2023 ore 19:10 — (B) Accesso PS: cervicalgia intensa con marcata contrattura paravertebrale e importante limitazione funzionale. La prognosi iniziale di soli 10 giorni si è rivelata gravemente sottostimata rispetto al decorso effettivo.

22/09/2023 — (C) RM rachide cervicale: protrusioni discali C4-C5 e C5-C6 con edema dei legamenti interspinosi, reperto che conferma inequivocabilmente la natura traumatica delle lesioni. La presenza di impronta sul sacco durale documenta la rilevanza anatomo-patologica del danno.

15/12/2023 — (D) Visita fisiatrica conclusiva: persistenza di cervicalgia e limitazione funzionale nonostante 20 sedute riabilitative, a dimostrazione della gravità e della cronicizzazione del quadro lesivo.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Risulta evidente che il sinistro del 03/09/2023 ha determinato un danno biologico significativo, la cui entità è stata sottovalutata dalla compagnia assicurativa.

L'edema dei legamenti interspinosi C4-C6 documentato alla RM a 19 giorni dal trauma costituisce una prova oggettiva e incontrovertibile della natura traumatica delle lesioni. La letteratura scientifica (Krakenes et al., Radiology 2006; Myran et al., Eur Spine J 2008) documenta che l'edema legamentoso post-traumatico è un indicatore affidabile di whiplash di grado II-III e correla significativamente con la prognosi sfavorevole a lungo termine.

L'ipotesi di una preesistente degenerazione discale è destituita di fondamento: le protrusioni discali riscontrate alla RM presentano caratteristiche morfologiche compatibili con eziologia traumatica (asimmetria, edema perilesionale) e non con la degenerazione cronica. In ogni caso, anche qualora si volesse riconoscere una minima componente degenerativa, il principio consolidato della "vulnerabilità della vittima" (Cass. Civ. 11/11/2019, n. 28986) impone di risarcire integralmente il danno come effettivamente verificatosi.

Il danno biologico permanente deve essere quantificato nella misura non inferiore al 5-6%, tenuto conto della persistente limitazione funzionale cervicale, della cronicizzazione della sintomatologia algica e della perdita di chance lavorativa. Si rileva inoltre che il periziando ha subito un significativo danno alla vita di relazione, con rinuncia documentata alle attività sportive precedentemente praticate.`,
  },

  // ── PREVIDENZIALE ─────────────────────────────────────────

  {
    caseType: 'previdenziale',
    role: 'ctu',
    excerpt: `## RIASSUNTO DEL CASO

Il caso riguarda il sig. M.C., di anni 58, che ha proposto ricorso avverso il provvedimento dell'INPS di reiezione della domanda di pensione di inabilità ex Art. 2 L. 222/84, ritenendo di essere affetto da pluripatologia invalidante tale da determinare l'assoluta e permanente impossibilità di svolgere qualsiasi attività lavorativa. La documentazione acquisita comprende la cartella sanitaria del medico curante (A), la documentazione specialistica cardiologica e pneumologica (B), gli esami strumentali (C) e il verbale della Commissione Medica INPS (D).

Il quadro clinico è caratterizzato da: cardiopatia ischemica cronica post-infartuale (IMA nel 2019 trattato con PTCA e stenting), BPCO stadio III GOLD con insufficienza respiratoria cronica in ossigenoterapia domiciliare, diabete mellito tipo 2 in terapia insulinica con iniziale nefropatia diabetica, sindrome depressiva reattiva in trattamento farmacologico.

## CRONOLOGIA MEDICO-LEGALE (estratto)

14/03/2019 — (B) IMA anteriore esteso trattato con PTCA primaria e impianto di 2 stent medicati su IVA. Ecocardiogramma alla dimissione: FE 38%, acinesia apicale e della parete anteriore.

15/09/2022 — (C) Spirometria: FEV1 42% del predetto, FVC 58%, FEV1/FVC 55%. Classificazione GOLD stadio III (grave). EGA: pO2 58 mmHg, pCO2 47 mmHg. Prescritta ossigenoterapia domiciliare per almeno 18 ore/die.

22/01/2024 — (D) Visita Commissione Medica INPS: riconosciuta invalidità civile nella misura del 75% con esclusione della inabilità lavorativa ai sensi dell'Art. 2 L. 222/84. La Commissione ha motivato il rigetto ritenendo configurabile una residua capacità lavorativa in mansioni sedentarie leggere.

10/04/2024 — (C) Ecocardiogramma di controllo: FE 35%, insufficienza mitralica di grado moderato. Test del cammino dei 6 minuti: 180 metri (norma >350 m), con desaturazione a 86% al termine del test.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

L'analisi del quadro clinico complessivo richiede la valutazione della capacità lavorativa residua alla luce dei criteri di cui al D.M. 05/02/1992 (tabelle delle percentuali di invalidità civile) e della giurisprudenza consolidata in materia di inabilità previdenziale.

Da un lato, la pluripatologia documentata configura un quadro di significativa compromissione funzionale multiorgano: la cardiopatia ischemica con FE 35% corrisponde alla classe III NYHA, la BPCO stadio III GOLD con insufficienza respiratoria richiede ossigenoterapia continuativa, il diabete complicato da nefropatia aggiunge un ulteriore fattore limitante. L'interazione sinergica tra queste patologie determina una riduzione della capacità funzionale globale superiore alla somma aritmetica delle singole menomazioni, secondo il principio della concorrenza e coesistenza di cui al D.M. 05/02/1992.

Dall'altro, si deve valutare se la residua autonomia nelle attività della vita quotidiana e la stabilità del quadro clinico in terapia farmacologica possano configurare una capacità lavorativa residua, ancorché limitata a mansioni sedentarie e prive di impegno fisico.

La valutazione complessiva, applicando i criteri tabellari del D.M. 05/02/1992 con il metodo a scalare per la pluripatologia, conduce a una stima di invalidità complessiva del 78-82%. Ai fini della configurabilità dell'inabilità ex Art. 2 L. 222/84, il CTU rileva che il test del cammino dei 6 minuti (180 m con desaturazione) e la classe NYHA III documentano una capacità funzionale residua estremamente ridotta, che rende la prestazione lavorativa, anche sedentaria, gravosa e potenzialmente pericolosa per la salute del ricorrente.`,
  },

  {
    caseType: 'previdenziale',
    role: 'ctp',
    excerpt: `## RIASSUNTO DEL CASO

Il sig. M.C., di anni 58, è affetto da gravissima pluripatologia invalidante che lo rende assolutamente e permanentemente incapace di svolgere qualsiasi attività lavorativa. L'INPS ha respinto la domanda di pensione di inabilità con motivazione inadeguata e superficiale, che non ha tenuto conto dell'effettiva compromissione funzionale globale del ricorrente né dell'interazione sinergica tra le plurime patologie.

## CRONOLOGIA MEDICO-LEGALE (estratto)

14/03/2019 — (B) IMA anteriore esteso con grave compromissione della funzione sistolica ventricolare sinistra (FE 38% alla dimissione, successivamente peggiorata al 35%). L'entità del danno miocardico documenta una cardiopatia ischemica di severa gravità.

15/09/2022 — (C) Spirometria: FEV1 42% del predetto, con insufficienza respiratoria cronica che impone ossigenoterapia domiciliare per almeno 18 ore/die. Il periziando è letteralmente dipendente dal supporto di ossigeno per lo svolgimento delle più elementari attività quotidiane.

22/01/2024 — (D) La Commissione Medica INPS ha formulato un giudizio di mera invalidità al 75%, con argomentazioni che ignorano completamente l'effetto sinergico della pluripatologia e l'impatto dell'ossigenoterapia continuativa sulla capacità lavorativa.

10/04/2024 — (C) Test del cammino: soli 180 metri con desaturazione a 86%. Questo dato oggettivo demolisce l'ipotesi di una qualsivoglia capacità lavorativa residua, anche in mansioni sedentarie.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Risulta evidente che la valutazione della Commissione Medica INPS è affetta da gravi vizi metodologici e sostanziali.

In primo luogo, la Commissione ha applicato un criterio meramente aritmetico-sommatorio delle singole menomazioni, in violazione del principio della concorrenza e coesistenza sancito dal D.M. 05/02/1992, che impone di valutare l'effetto sinergico della pluripatologia sulla capacità funzionale globale. Un soggetto cardiopatico in classe NYHA III con BPCO stadio III in ossigenoterapia e diabete complicato presenta una compromissione funzionale radicalmente superiore a quella derivante dalla mera somma delle singole patologie.

In secondo luogo, l'affermazione della Commissione circa una "residua capacità lavorativa in mansioni sedentarie leggere" è destituita di qualsiasi fondamento clinico. Il test del cammino di 180 metri con desaturazione a 86% documenta oggettivamente che il ricorrente non è in grado di sostenere neppure uno sforzo fisico minimo. La necessità di ossigenoterapia per 18 ore/die rende materialmente impossibile il raggiungimento del luogo di lavoro, la permanenza in ambiente lavorativo e lo svolgimento di qualsivoglia mansione con la continuità e la regolarità richieste.

In terzo luogo, la sindrome depressiva reattiva, completamente trascurata dalla Commissione, aggrava ulteriormente il quadro con deficit attentivi, rallentamento ideomotorio e affaticabilità che precludono qualsiasi impegno lavorativo anche intellettuale.

L'invalidità complessiva è valutabile nella misura non inferiore al 100% e configura senza alcun dubbio l'inabilità assoluta e permanente di cui all'Art. 2 L. 222/84. La decisione dell'INPS deve essere integralmente riformata.`,
  },

  // ── INFORTUNI ─────────────────────────────────────────────

  {
    caseType: 'infortuni',
    role: 'ctu',
    excerpt: `## RIASSUNTO DEL CASO

Il caso riguarda il sig. P.L., di anni 52, operaio specializzato presso lo stabilimento Metalworks S.r.l. di Brescia, che in data 18/05/2023 subiva infortunio sul lavoro consistente in caduta dall'alto (altezza stimata 3,5 metri) durante operazioni di manutenzione su carroponte. La documentazione acquisita comprende la denuncia di infortunio INAIL e il verbale dell'ASL-ATS (A), la cartella clinica del ricovero presso il Pronto Soccorso e il reparto di Ortopedia dell'Ospedale Civile di Brescia (B), gli esami strumentali (C) e la documentazione della sorveglianza sanitaria aziendale (D).

Il lavoratore riportava frattura pluriframmentaria del calcagno sinistro (Sanders tipo III) e frattura del piatto tibiale laterale sinistro (Schatzker tipo II), trattate chirurgicamente con ORIF.

## CRONOLOGIA MEDICO-LEGALE (estratto)

18/05/2023 ore 10:30 — (A) Infortunio durante manutenzione del carroponte a quota 3,5 m. Il verbale ASL-ATS rileva: assenza di parapetti o linea vita sul piano di lavoro, cestello elevatore non disponibile, imbracatura di sicurezza non fornita. Il DVR aziendale aggiornato al 01/2023 prevedeva l'utilizzo di piattaforma elevatrice per interventi in quota superiore a 2 m.

18/05/2023 ore 11:15 — (B) Accesso PS: tumefazione e deformità della caviglia e del ginocchio sinistro. TC caviglia: frattura pluriframmentaria del calcagno sinistro, Sanders III, con depressione della faccetta articolare posteriore. TC ginocchio: frattura del piatto tibiale laterale sinistro, Schatzker II, con affondamento di 8 mm.

22/05/2023 — (B) Intervento chirurgico: ORIF calcagno con placca e viti, ORIF piatto tibiale con placca LCP e innesto osseo autologo da cresta iliaca. Decorso post-operatorio regolare.

20/11/2023 — (C) TC di controllo: consolidazione delle fratture in buon allineamento. Residua incongruenza articolare subtalare con gap di 2 mm. Iniziali segni di artrosi post-traumatica del piatto tibiale.

15/02/2024 — (D) Valutazione funzionale conclusiva: deambulazione con zoppia di fuga, ROM caviglia ridotto del 40%, ROM ginocchio -10° estensione/100° flessione. Non in grado di riprendere la mansione precedente (lavoro in quota, stazione eretta prolungata, movimentazione carichi).

## ELEMENTI DI RILIEVO MEDICO-LEGALE

L'analisi del caso richiede la valutazione sotto il duplice profilo della responsabilità datoriale in materia di sicurezza sul lavoro e della quantificazione del danno biologico.

Quanto al profilo della responsabilità, il verbale dell'ASL-ATS documenta la violazione degli artt. 111 e 115 del D.Lgs. 81/2008 (Testo Unico Sicurezza), che impongono l'utilizzo di dispositivi di protezione collettiva (parapetti) e individuale (imbracature) per lavori in quota superiore a 2 metri. Da un lato, il DVR aziendale prevedeva correttamente l'utilizzo di piattaforma elevatrice, indicando che il rischio era stato identificato e valutato. Dall'altro, l'indagine ASL-ATS ha accertato che la piattaforma non era disponibile al momento dell'intervento e che il preposto aveva autorizzato l'esecuzione dei lavori senza dispositivi alternativi, configurando una violazione dell'art. 18, comma 1, lett. f) del D.Lgs. 81/2008.

Il nesso causale tra le violazioni delle norme di sicurezza e l'evento lesivo è diretto: la caduta dall'alto è avvenuta in assenza dei dispositivi di protezione che, se correttamente predisposti, avrebbero impedito o significativamente attenuato le conseguenze dell'evento.

Quanto alla quantificazione del danno, applicando le tabelle INAIL per il danno biologico da infortunio, si stima: ITT giorni 30, ITP al 75% giorni 60, ITP al 50% giorni 90, ITP al 25% giorni 120. Il danno biologico permanente è valutabile nella misura del 22-25% per gli esiti di frattura pluriframmentaria del calcagno (14-16% tab. INAIL) in concorrenza con esiti di frattura del piatto tibiale (10-12% tab. INAIL), con applicazione del metodo riduzionistico.`,
  },

  {
    caseType: 'infortuni',
    role: 'ctp',
    excerpt: `## RIASSUNTO DEL CASO

Il sig. P.L., di anni 52, operaio specializzato presso lo stabilimento Metalworks S.r.l. di Brescia, è stato vittima in data 18/05/2023 di un gravissimo infortunio sul lavoro, precipitando da un'altezza di 3,5 metri durante operazioni di manutenzione su carroponte in totale assenza di dispositivi di protezione. L'infortunio, interamente riconducibile alle gravi carenze datoriali in materia di sicurezza, ha determinato fratture plurime agli arti inferiori con esiti invalidanti permanenti e perdita della capacità lavorativa specifica.

## CRONOLOGIA MEDICO-LEGALE (estratto)

18/05/2023 ore 10:30 — (A) Infortunio per caduta dall'alto in assenza di qualsivoglia misura di protezione. Il verbale ASL-ATS documenta inequivocabilmente: nessun parapetto, nessuna linea vita, nessuna imbracatura, piattaforma elevatrice non disponibile. Il lavoratore è stato esposto a un rischio mortale per la colpevole inerzia del datore di lavoro.

18/05/2023 ore 11:15 — (B) Frattura pluriframmentaria del calcagno sinistro Sanders III e frattura del piatto tibiale laterale Schatzker II. L'entità delle lesioni riflette la gravità della caduta da altezza elevata senza alcuna protezione.

22/05/2023 — (B) Duplice intervento chirurgico di ORIF con necessità di innesto osseo autologo. La complessità del trattamento chirurgico documenta la severità del quadro traumatologico.

15/02/2024 — (D) A distanza di 9 mesi dall'infortunio: deambulazione con zoppia permanente, grave limitazione funzionale di caviglia e ginocchio, impossibilità di riprendere la mansione lavorativa. Un lavoratore integro è stato ridotto a persona con disabilità permanente per esclusiva responsabilità datoriale.

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Risulta evidente che l'infortunio è la diretta e prevedibile conseguenza della sistematica violazione delle norme di sicurezza sul lavoro da parte del datore di lavoro.

Le violazioni accertate dall'ASL-ATS sono di gravità estrema e configurano responsabilità piena e inescusabile ai sensi del D.Lgs. 81/2008. In particolare:

1. **Violazione dell'art. 111** (obbligo di misure di protezione collettiva per lavori in quota): nessun parapetto né linea vita era installato sulla struttura del carroponte, nonostante il DVR stesso prevedesse interventi di manutenzione periodici in quota.

2. **Violazione dell'art. 115** (obbligo di sistemi di arresto caduta): nessuna imbracatura di sicurezza era stata fornita al lavoratore, in spregio all'obbligo normativo per lavori oltre i 2 metri di altezza.

3. **Violazione dell'art. 18, comma 1, lett. f)** (obbligo del datore di lavoro di fornire DPI idonei): la piattaforma elevatrice prevista dal DVR non era disponibile e il preposto ha autorizzato l'intervento senza predisporre misure alternative, configurando una colpa organizzativa dell'impresa.

4. **Violazione dell'art. 37** (obbligo di formazione): la documentazione della sorveglianza sanitaria non attesta una formazione specifica per lavori in quota aggiornata agli ultimi 3 anni.

Il nesso causale è diretto e incontrovertibile: la caduta dall'alto in assenza di protezioni è causa esclusiva dell'evento lesivo. Non è configurabile alcun concorso di colpa del lavoratore, che ha eseguito la mansione assegnata dal preposto con i mezzi messi a disposizione dall'azienda.

Il danno biologico permanente deve essere quantificato nella misura non inferiore al 28-30%, tenuto conto della perdita permanente della capacità lavorativa specifica, della necessità di riqualificazione professionale, del danno alla vita di relazione e dell'incidenza dell'infortunio sulla complessiva qualità di vita. Si rileva inoltre il diritto al risarcimento del danno differenziale rispetto all'indennizzo INAIL, attesa la piena responsabilità datoriale.`,
  },

  // ── GENERICA (fallback) ─────────────────────────────────

  {
    caseType: 'generica',
    role: 'ctu',
    excerpt: `## RIASSUNTO DEL CASO

Il presente caso concerne la valutazione della condotta sanitaria prestata al sig./alla sig.ra [iniziali], in relazione al trattamento presso [struttura]. La documentazione acquisita comprende la cartella clinica (A), i referti dei controlli successivi (B), gli esami strumentali (C) e gli esami ematochimici (D).

## CRONOLOGIA MEDICO-LEGALE (estratto)

[data] — (A) Primo accesso presso la struttura sanitaria. Anamnesi, esame obiettivo e inquadramento diagnostico iniziale. Si rileva [descrizione clinica fedele alla documentazione].

[data] — (C) Esami strumentali di approfondimento. I risultati evidenziano [reperti specifici con valori numerici].

[data] — (A) Trattamento [chirurgico/farmacologico/conservativo]. La documentazione riporta [dettagli procedurali].

## ELEMENTI DI RILIEVO MEDICO-LEGALE

L'analisi della documentazione consente le seguenti considerazioni. Da un lato, si rileva che l'iter diagnostico-terapeutico intrapreso appare [conforme/non conforme] alle linee guida di riferimento [citazione linee guida]. Dall'altro, emergono profili meritevoli di approfondimento relativamente a [specifica criticità].

Il nesso causale tra la condotta sanitaria e il danno lamentato va valutato secondo il criterio civilistico del "più probabile che non" (Cass. S.U. 11/01/2008, n. 577). L'analisi della letteratura scientifica pertinente [citazione] suggerisce che [valutazione bilanciata].

Ai fini della quantificazione del danno biologico, si rinvia ai criteri valutativi del Barème SIMLA, con stima dell'ITT, dell'ITP nelle sue componenti percentuali e del danno biologico permanente, subordinatamente alla stabilizzazione del quadro clinico.`,
  },

  {
    caseType: 'generica',
    role: 'ctp',
    excerpt: `## RIASSUNTO DEL CASO

Il sig./la sig.ra [iniziali] è stato/a sottoposto/a a trattamento sanitario presso [struttura] con esito sfavorevole. L'analisi della documentazione clinica acquisita evidenzia criticità significative nella gestione diagnostico-terapeutica che hanno concorso a determinare il danno lamentato.

## CRONOLOGIA MEDICO-LEGALE (estratto)

[data] — (A) Primo accesso presso la struttura sanitaria. La documentazione clinica risulta carente nella raccolta anamnestica e nell'esame obiettivo, omettendo [specificare elemento mancante].

[data] — (C) Esami strumentali eseguiti con ritardo di [n] giorni rispetto al primo accesso. I risultati, che evidenziavano [reperti specifici], avrebbero dovuto indurre un immediato approfondimento diagnostico.

[data] — (A) Trattamento [descrizione]. Si rilevano le seguenti criticità: [elenco puntuale delle deviazioni dallo standard].

## ELEMENTI DI RILIEVO MEDICO-LEGALE

Risulta evidente che la condotta sanitaria si è discostata in modo significativo dallo standard di diligenza esigibile. In particolare:

1. **Ritardo diagnostico**: l'intervallo di [n] giorni tra la prima presentazione clinica e il completamento dell'iter diagnostico è incompatibile con le linee guida [citazione], che raccomandano [tempistica corretta].

2. **Inadeguatezza terapeutica**: il trattamento prescelto non risulta conforme alle raccomandazioni [linee guida], che indicano [trattamento raccomandato] come standard di cura per la condizione in oggetto.

3. **Carenza documentale**: la documentazione clinica presenta lacune significative che impediscono la ricostruzione completa dell'iter assistenziale, circostanza che, secondo consolidata giurisprudenza (Cass. Civ. 26/07/2017, n. 18392), opera a sfavore della struttura sanitaria.

Il nesso di causalità tra le condotte censurabili e il danno subito è configurabile secondo il criterio della perdita di chance: una gestione conforme allo standard avrebbe, con elevata probabilità, consentito un esito significativamente migliore. Il danno biologico permanente è valutabile nella misura non inferiore a [percentuale]% secondo i criteri del Barème SIMLA.`,
  },
] as const;

/**
 * Retrieve a golden perizia excerpt matching case type and role.
 * Falls back to 'generica' for the same role if no specific match exists.
 */
export function getGoldenPerizia(caseType: CaseType, role: CaseRole): string | null {
  const match = GOLDEN_PERIZIE.find(
    (p) => p.caseType === caseType && p.role === role,
  );
  if (match) return match.excerpt;

  const fallback = GOLDEN_PERIZIE.find(
    (p) => p.caseType === 'generica' && p.role === role,
  );
  return fallback?.excerpt ?? null;
}
