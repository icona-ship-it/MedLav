/**
 * Long placeholder texts for perito-filled sections, aligned to the gold
 * standard perizie in benchmark/gold/ (Lavini / scuola veronese, 2026-06-10).
 *
 * These are GUIDED SKELETONS: the judgments stay with the perito (product
 * constraint "giudizi = placeholder"), but the skeleton mirrors the structure
 * and the formule peritali of the deposited gold reports, so the perito fills
 * in instead of restructuring. All names are redacted role tokens — never
 * real-world data (GDPR).
 *
 * Extracted to a dedicated module to keep section-catalog.ts from growing
 * further past the 300-line rule.
 */

/**
 * Verbale delle operazioni peritali + visita del periziando (CTU/CTP civile,
 * periziando vivente). Skeleton modeled on the gold verbale (TAR collegiale)
 * and the visita in rubriche of the scuola veronese (gold ustioni+psichico).
 */
export const OPERAZIONI_PERITALI_PLACEHOLDER = `*[Inserire qui il verbale delle operazioni peritali e la visita del periziando. Scheletro-guida allineato ai verbali depositati — stile: atti del C.T.U./Collegio all'imperfetto ("procedeva/procedevano"), dichiarazioni delle parti al presente.*

*APERTURA DEL VERBALE*
*"In data DD.MM.YYYY, alle ore HH:MM, si è svolto [in presenza / per via telematica / in modalità duale] l'incontro fra il C.T.U. [o il Collegio di CC.TT.U.] e le Parti."*

*COMPARIZIONI — "In tale occasione, sono comparsi:"*
*- il/la periziando/a [e i congiunti], riconosciuti a mezzo di Carta di identità*
*- per parte ricorrente, [in presenza / per mezzo di collegamento da remoto]: l'Avvocato [nome] unitamente ai CC.TT. nominati [nomi]*
*- per parte resistente, [in presenza / da remoto]: l'Avvocato [nome] e i CC.TT. nominati [nomi]*

*DICHIARAZIONI E ISTANZE DELLE PARTI (un paragrafo per dichiarazione, al tempo presente):*
*- "L'avv. [nome] chiede che sia scritto a verbale quanto di seguito: ..."*
*- "Il Dott./Prof. [C.T.P.] chiede che sia registrato a verbale come ..."*
*- "L'avv. [nome] si riserva di ... solo all'esito di ..." / "non si oppone a ... e chiede che ..."*
*- eventuali contestazioni procedurali, consensi/opposizioni all'acquisizione documentale*

*ATTIVITÀ DEL C.T.U./COLLEGIO (all'imperfetto):*
*- esame della documentazione, discussione del caso, eventuali acquisizioni*
*- chiusura istruttoria: "I CC.TT.U. chiedevano alle parti se vi fossero ulteriori elementi anamnestici e obiettivi che volessero raccogliere, ricevendo risposta negativa."*

*VISITA DEL PERIZIANDO (rubriche):*
*- GENERALITÀ (riconoscimento a mezzo documento d'identità)*
*- ANAMNESI PERSONALE, FAMILIARE E PATOLOGICA REMOTA*
*- ANAMNESI PATOLOGICA PROSSIMA (evento indice e iter clinico, in passato remoto)*
*- STATO ATTUALE (sintomatologia e limitazioni riferite a distanza dall'evento)*
*- ESAME OBIETTIVO per distretti (Capo, Collo, Tronco, Dorso, Addome, Arti) con eventuali richiami [Figura N]*
*- "Si dà atto che tutte le immagini scattate in corso di visita medico-legale venivano condivise dal sottoscritto C.T.U. con le parti."*

*RINVIO E CHIUSURA*
*- "Si concertava un ulteriore appuntamento finalizzato a [discussione del caso / completamento accertamenti], previa [acquisizione documentale / traduzione], stabilito per il giorno DD.MM.YYYY alle ore HH:MM [per via telematica]."*
*- "L'incontro terminava alle ore HH:MM circa."*

*FIRME DEL VERBALE (tutti i comparenti, raggruppati per parte):*
*- per la parte ricorrente: [nome] _______________________*
*- per la parte resistente: [nome] _______________________*
*- Il C.T.U. / I CC.TT.U.: [nome/i] _______________________]*`;

/**
 * Operazioni peritali — variante DECESSO (periziando deceduto, CTU/CTP civile):
 * nessuna visita medico-legale; le operazioni sono riunioni tecniche e
 * acquisizione documentale (gold: decesso ATP 696-bis e RSA/LEA).
 */
export const OPERAZIONI_PERITALI_DECESSO_PLACEHOLDER = `*[Inserire qui il verbale delle operazioni peritali. Periziando deceduto: NESSUNA visita medico-legale — le operazioni consistono in riunioni di discussione tecnica e acquisizione documentale.*

*APERTURA*
*"In data DD.MM.YYYY, alle ore HH:MM, si svolgeva una riunione di discussione tecnica [in presenza / su piattaforma telematica] fra il C.T.U. [o il Collegio di CC.TT.U.] e le parti."*

*PRESENZE (elenco per parte: avvocati e CC.TT.P. con nomi e qualifiche, anche in collegamento da remoto)*

*DISCUSSIONE TECNICA*
*- "Prendeva, dunque, parola il Dott. [C.T.P.], il quale ..." (sintesi degli interventi di ciascun consulente di parte)*
*- atti istruttori: acquisizioni documentali, richieste alle strutture sanitarie, eventuali traduzioni*

*EVENTUALE TENTATIVO DI CONCILIAZIONE*
*- "Essendo dunque fallito il tentativo di conciliazione in questa prima fase dei lavori, si procedeva alla stesura delle bozze di CTU."*

*RINVIO E CHIUSURA*
*- "Si concertava un ulteriore appuntamento finalizzato a [discussione del caso], stabilito per il giorno DD.MM.YYYY alle ore HH:MM."*
*- "L'incontro terminava alle ore HH:MM circa."*

*FIRME DEL VERBALE dei comparenti, raggruppati per parte]*`;

/**
 * "I Dati dell'Incontro Peritale" — variante PENALE delle operazioni peritali
 * (gold CTU penale: decesso, periti collegiali, incontro telematico con i
 * periti di parte di imputati e parte civile — nessuna visita).
 */
export const INCONTRO_PERITALE_PENALE_PLACEHOLDER = `*[Inserire qui i dati dell'incontro peritale (ambito penale).*

*APERTURA*
*"In data DD.MM.YYYY, alle ore HH:MM, in [città / da remoto], i sottoscritti Periti avviavano l'incontro peritale[, tramite piattaforma telematica,] al quale erano collegati:"*
*- per gli imputati: [periti di parte nominati, con specialità]*
*- per la parte civile: [perito di parte]*

*SINTESI DEGLI INTERVENTI di ciascun perito di parte (un paragrafo per intervento)*

*TERMINE PER NOTE*
*"Al concludersi dell'incontro, i Periti proponevano alle Parti un termine di [N] giorni, a partire dal [data], per l'eventuale invio di note al fine di integrare quanto già discusso."*

*DOCUMENTI E RELAZIONI PERVENUTI dopo l'incontro (elenco con date di ricezione)]*`;

/**
 * Guida di completamento dell'Epicrisi stragiudiziale (gold Antoniazzi/Regnoto):
 * scheletro numerato con le formule valutative dei depositati. Appeso in coda
 * alla directive dell'epicrisi — i giudizi restano del perito.
 */
export const EPICRISI_COMPLETAMENTO_GUIDE = `*[Il perito completerà l'epicrisi con, nell'ordine (formule dei benchmark depositati):*
*1) NESSO CAUSALE — "Le lesioni riportate sono compatibili con il meccanismo del trauma e il quadro anatomo-patologico soddisfa i criteri topografico, di modalità, temporale, di efficienza lesiva e di conseguenza fenomenologica, tali che non vi sono dubbi sulla diretta conseguenza fra trauma patito e lesioni riportate." Se preesistenze/concause: "Tale condizione integra esclusivamente una situazione di maggiore suscettibilità individuale, priva di autonoma efficienza causale, non sussistendo presupposti medico-legali per l'applicazione di criteri riduzionistici o differenziali."*
*2) ATTRIBUZIONE — "In considerazione delle evidenze clinico-radiologiche e di quanto rilevato in sede di visita clinica appare corretto attribuire per i postumi stabilizzati di [DIAGNOSI IN MAIUSCOLO]:"*
*3) INABILITÀ TEMPORANEA GRADUATA, una riga per periodo (solo i livelli effettivi): "un periodo di INABILITÀ TEMPORANEA AL 100% di gg. [N]" / "AL 75% di gg. [N]" / "AL 50% di gg. [N]" / "AL 25% di gg. [N]"*
*4) "UN DANNO BIOLOGICO non inferiore ai [N] punti percentuali"*
*5) FORMULA TABELLARE — "Tale valutazione si basa sulle tabelle elaborate dalle Linee Guida per la valutazione medico-legale del danno in ambito civilistico elaborate da SIMLA e pubblicate nel 2016, in quanto è possibile riferire a [classe/voce] la condizione funzionale del periziando." (per polizza infortuni: tabelle ANIA-INAIL)*
*6) GRADO DI SOFFERENZA — "In relazione al grado di sofferenza subita, che va intesa come fenomeno descrittivo di carattere intrinseco, parametro aggiuntivo, si può considerare un grado [lieve/medio/elevato], in relazione ad aspetti ascrivibili a [condizione]."*
*7) SPESE — "Vengono esibite n. [N] ricevute/fatture per un totale di euro [X], spese che appaiono giustificate e congrue, a cui potranno essere aggiunte le eventuali ulteriori spese documentate." (rinvio alla tabella della sezione Spese Mediche)]*`;

/**
 * Considerazioni Medico-Legali (CTU/CTP civile, periziando vivente) — struttura
 * PER QUESITO dei gold depositati: inquadramento, formula di apertura, ogni
 * quesito ri-citato come intestazione con la risposta motivata sotto, chiusura
 * bozza con firma e formula di invio. I giudizi restano al perito.
 */
export const CONSIDERAZIONI_ML_PLACEHOLDER = `*[Inserire qui le considerazioni medico-legali. Questa sezione contiene la valutazione conclusiva del CTU e le risposte ai quesiti del Giudice, organizzate PER QUESITO (struttura dei benchmark depositati).*

*APERTURA (1 paragrafo di inquadramento):*
*"Il caso in oggetto riguarda [inquadramento essenziale della vicenda]."*
*"Venendo a rispondere ai quesiti proposti dal Sig. Giudice, si formulano le seguenti considerazioni medico legali, secondo i punti di seguito riportati[, accorpando i quesiti laddove presentino profili di sovrapponibilità o spostandoli dall'ordine originario, per garantire una più chiara esposizione]."*

*PER CIASCUN QUESITO (ossatura primaria): N) "…testo del quesito ri-citato testualmente tra virgolette…" seguito dalla risposta motivata, con l'analisi INTEGRATA nella risposta (formule: "Venendo a rispondere al quesito posto, in termini di premessa è possibile affermare che…", "Rispondendo al quesito formulato, …"). Elementi da coprire dove pertinenti:*
*- nesso di causalità materiale (criteri cronologico, topografico, di idoneità/efficienza lesiva, di continuità fenomenologica, di esclusione di altre cause) e giuridico secondo il "più probabile che non"; per la malpractice omissiva, giudizio controfattuale ad alta probabilità logica*
*- in presenza di preesistenze: stato anteriore e danno differenziale*
*- condotta sanitaria alla luce delle linee guida e buone pratiche cliniche vigenti al momento dei fatti*
*- danno biologico temporaneo (ITT/ITP): elenco motivato per periodo secondo la formula "va ragionevolmente riconosciuto un periodo di: invalidità temporanea totale pari a NN (lettere) giorni, corrispondenti a [motivazione clinica, es. periodo di ricovero in ambiente nosocomiale], ovvero dal DD.MM.YYYY al DD.MM.YYYY, come da documentazione sanitaria; invalidità temporanea parziale al NN% pari a NN (lettere) giorni, per [motivazione clinica del periodo]"*
*- danno biologico permanente: "Tali postumi, allo stato, configurano un aggravamento anatomo-funzionale dello stato psico-fisico anteriore pari ad un danno biologico a carattere permanente valutabile complessivamente nella misura del NN% (lettere percento), prendendo come riferimento valutativo i parametri indicati da SIMLA, Linee Guida per la valutazione del danno alla persona in ambito civilistico, Giuffrè Editore, 2016." La quantificazione deve intendersi come omnicomprensiva di tutte le ripercussioni negative sugli aspetti dinamico-relazionali del danneggiato.*
*- se il caso riguarda una polizza infortuni privata: valutazione dell'IP secondo la tabella di riferimento delle condizioni di polizza (Tabella Lesioni allegata / tabella ANIA / tabella INAIL), verifica del criterio contrattuale delle conseguenze dirette ed esclusive ("Tale condizione è direttamente ed esclusivamente conseguente al trauma…"), applicazione di franchigie, maggiorazioni e moltiplicatori contrattuali (clausole da riprodurre verbatim quando citate negli atti), tenendo distinta tale valutazione dal danno biologico RC. Formato ITT: "Inabilità Temporanea assoluta al 100%: giorni NN (lettere)". La sezione può aprirsi con la risposta diretta al quesito.*
*- eventuale danno morale ed esistenziale; personalizzazione del danno se applicabile*

*CONCLUSIONI DELL'AUSILIARIO (se nominato): riprodotte integralmente nella risposta sulle lesioni, con intestazione "CONCLUSIONI [SPECIALITÀ]-FORENSI".*

*QUESITO CONCILIATIVO (se tra i quesiti c'è "tenti la conciliazione"): "Si dà atto che, in fase antecedente l'invio delle bozze, non è stato possibile giungere ad una risoluzione conciliativa della controversia, la quale verrà tentata al termine del contradditorio tecnico."*

*CHIUSURA BOZZA: [CITTÀ], [DATA] — firma "Il C.T.U." (o "Il Collegio di CC.TT.U."; se nominato, anche "L'Ausiliario [specialità] del C.T.U.") + formula di invio: "Il testo di cui sopra viene inviato alle parti (legali e consulenti nominati), concedendo il termine di 15 giorni per eventuali osservazioni come da disposizione del Signor Giudice."]*`;

/**
 * Considerazioni Medico-Legali — ambito PENALE (gold CTU penale): sinossi
 * clinico-documentale + risposta per-quesito alla Corte con diagnosi
 * differenziale eziologica pesata sulla scala probabilistica verbale.
 */
export const CONSIDERAZIONI_PENALE_PLACEHOLDER = `*[Inserire qui le considerazioni medico-legali in ambito PENALE (responsabilità medico-sanitaria colposa). Struttura del benchmark depositato:*

*APERTURA: "Il caso in esame riguarda lo studio della vicenda clinica del Sig./della Sig.ra [PERIZIANDO], di anni [N], deceduto/a in data [DATA] presso [LUOGO], al fine di enucleare eventuali profili di responsabilità medico-sanitaria che possano aver avuto un ruolo causale o concausale nel determinismo del decesso."*

***Breve sinossi clinico-documentale***
*Ricostruzione essenziale della vicenda (i dettagli restano nelle sezioni documentali).*

***Risposta ai quesiti posti dall'Ecc.ma Corte / dal Sig. Magistrato***
*"Venendo dunque a rispondere ai quesiti proposti, si propongono le seguenti considerazioni medico legali, accorpando la risposta ad alcuni quesiti per ragioni di economia espositiva."*
*Per ciascun quesito: ri-citazione testuale tra virgolette come intestazione + risposta motivata. Il nesso causale penale e i profili di colpa (imperizia / negligenza / imprudenza rispetto alle linee guida e buone pratiche vigenti al momento dei fatti, condotta esigibile) vanno argomentati DENTRO le risposte, non come blocco separato. Giudizio controfattuale: la condotta alternativa lecita avrebbe evitato l'evento?*

*CAUSA DELLA MORTE — DIAGNOSI DIFFERENZIALE EZIOLOGICA per ipotesi, ciascuna pesata con la scala probabilistica VERBALE penale: "oltre ogni ragionevole dubbio" / "in via di elevatissima probabilità" / "alta probabilità" / "risulterebbe quella più probabile nell'eziopatogenesi" / "altamente improbabile" / "evento del tutto imprevedibile [ed imprevenibile]". Conclusione-tipo: "In definitiva, si ritiene che il decesso… possa essere verosimilmente ascritto a…".*

*NOTA: in ambito penale NON si quantifica il danno biologico (no ITT/ITP, no tabelle SIMLA).]*`;

/**
 * Osservazioni alla bozza (solo CTU): iter completo invio → osservazioni
 * integrali → risposta → deposito, con le formule dei gold.
 */
export const OSSERVAZIONI_BOZZA_PLACEHOLDER = `*[Spazio riservato all'iter bozza → osservazioni → risposta → deposito (struttura dei benchmark depositati):*

*1. CRONOLOGIA DELL'INVIO*
*"In data DD.MM.YYYY, si inviavano le bozze di CTU alle Parti (legali e consulenti nominati), ricevendo conferma di ricezione del testo." [+ eventuale nota sull'invio a mezzo PEC ai patrocinatori]*

*2. OSSERVAZIONI DEI CC.TT.P. — riprodotte INTEGRALMENTE per ciascun consulente:*
*"Le osservazioni alla bozza di CTU redatte dal Dott. [CTP] per [PARTE]:" + testo integrale*
*[Accorpamento opzionale: "Si opta, pertanto, per riportare di seguito integralmente le osservazioni formulate dalle parti; successivamente verrà fornita una risposta unitaria circa la criticità sollevata."]*

*3. RISPOSTA*
*"Risposta del C.T.U.:" (o "Risposta del Collegio di CC.TT.U.:") — controdeduzioni puntuali o unitarie + eventuali modifiche apportate alla relazione*

*4. DEPOSITO*
*"Non essendo pervenute ulteriori note a commento entro i termini, si procede al deposito dell'elaborato tecnico nei tempi concessi dal Giudice."*
*[CITTÀ], [DATA] — Il C.T.U. (firma definitiva)]*`;

/**
 * Tentativo di conciliazione ANTE bozza: dovuto quando il Giudice lo ha
 * demandato (ATP ex art. 696-bis c.p.c. O quesito "tenti la conciliazione" in
 * causa ordinaria — benchmark gold 2026-06-10).
 */
export const CONCILIAZIONE_ANTE_PLACEHOLDER = `*[Inserire qui — quando il Giudice ha demandato il tentativo di conciliazione (ATP ex art. 696-bis c.p.c. o quesito "tenti la conciliazione") — la cronologia del tentativo nella fase antecedente l'invio della bozza:*

*"In data DD.MM.YYYY, si esperiva un primo tentativo di soluzione conciliativa della lite, invitando ad un tavolo di lavoro i legali delle parti, mediante il seguente testo, recapitato a mezzo di posta elettronica certificata." + testo dell'invito*

*Per ogni risposta: "In data DD.MM.YYYY, l'Avv. [nome], in rappresentanza di [parte], … Il testo si riporta integralmente di seguito."*

*Ponte verso la bozza: "In considerazione di quanto sopra, si procedeva alla stesura della bozza di CTU, prevedendo un secondo tentativo di conciliazione successivamente all'invio del testo."*

*Nota: se la conciliazione è già trattata nel verbale dell'incontro con le parti (stile compatto), deselezionare queste sezioni dal selettore.]*`;

/**
 * Tentativo di conciliazione POST bozza: secondo giro + formula di deposito.
 */
export const CONCILIAZIONE_POST_PLACEHOLDER = `*[Inserire qui — quando il Giudice ha demandato il tentativo di conciliazione (ATP ex art. 696-bis c.p.c. o quesito "tenti la conciliazione") — la cronologia del tentativo nella fase successiva all'invio della bozza:*

*"In data DD.MM.YYYY, contestualmente all'invio della bozza di CTU, si esperiva un secondo tentativo di soluzione conciliativa della lite." + posizioni finali dei legali e dei CC.TT.P.*

*\\* \\* \\* \\* \\**

*Chiusura: "Non essendo stato possibile addivenire ad una soluzione bonaria della controversia oggetto di esame, e non essendo pervenute ulteriori note a commento entro i termini, si procede al deposito dell'elaborato tecnico."*
*[CITTÀ], [DATA] — Il C.T.U. / Dr. [nome]]*`;

/**
 * Profilo metodologico (gold Del Porto): frase-ponte metodologica + indice
 * della relazione, subito dopo i quesiti. Placeholder deterministico.
 */
// NB: niente formulazioni "da template" tipo "[Facoltativo: ...]" — nel QA
// 2026-06-11 quella riga è stata letta dai medici come istruzione di prompt
// trapelata. I placeholder parlano al perito come una guida, non come un form.
export const PROFILO_METODOLOGICO_PLACEHOLDER = `Il caso per cui si procede, implica l'espletamento del rilievo e della comparata disamina dei dati, degli esami e delle fasi desumibili da quanto di seguito esposto.

*[Se lo desideri, elenca qui le sezioni della relazione nell'ordine del documento — alcuni periti aprono con questo indice metodologico, altri lo omettono.]*`;

/**
 * Accertamento specialistico dell'Ausiliario (gold CTU danno psichico):
 * sezione autonoma fra le operazioni peritali e le considerazioni.
 */
export const ACCERTAMENTO_AUSILIARIO_PLACEHOLDER = `*[Inserire qui l'accertamento specialistico dell'Ausiliario. Formula di raccordo:*
*"Al termine dell'esame obiettivo-clinico, seguiva l'accertamento di natura [SPECIALITÀ] condotto dall'ausiliario Dr. [NOME], che si riporta integralmente."*

*Scheletro (benchmark depositato):*
*- INTRODUZIONE (scopo dell'accertamento, in punti)*
*- PROCEDIMENTO METODOLOGICO (+ letteratura valutativa di riferimento)*
*- VISITA SPECIALISTICA (anamnesi specialistica remota e prossima)*
*- DATI OSSERVAZIONALI (esame obiettivo specialistico + questionari/testistica somministrata; "Si allega la testistica utilizzata")*
*- CONCLUSIONI [SPECIALITÀ]-FORENSI (riprese integralmente nelle Considerazioni Medico-Legali)]*`;

/**
 * Preventivi e spese per attività medico-legale (gold CTU collegiale):
 * proforme dei CC.TT.P. riportate in coda alle spese.
 */
export const PREVENTIVI_SPESE_ML_PLACEHOLDER = `*[Inserire qui — se pervenute — le proforme di fattura dei consulenti di parte:*
*"Risultano presenti n. [N] proforme di fattura a firma dei CC.TT.P. [NOMI], rispettivamente, che si riportano di seguito." + riproduzione delle proforme]*`;

/**
 * Considerazioni Medico-Legali — variante DECESSO (CTU/CTP civile).
 * Il fulcro è la causa della morte e il nesso "più probabile che non" sul
 * determinismo del decesso; ITT/ITP, IP% e tabelle SIMLA NON si applicano al
 * deceduto (gold: decesso ATP 696-bis). I giudizi restano al perito.
 */
export const CONSIDERAZIONI_DECESSO_PLACEHOLDER = `*[Inserire qui le considerazioni medico-legali per il caso di DECESSO del periziando, organizzate PER QUESITO (struttura del benchmark depositato).*

*APERTURA (inquadramento):*
*"Il caso in oggetto riguarda lo studio della vicenda clinica e delle cause del decesso del Sig./della Sig.ra [PERIZIANDO], di anni [N], avvenuto presso [LUOGO] in data [DATA], nell'ottica di enucleare eventuali profili di responsabilità sanitaria nel determinismo del decesso."*

*RISPOSTA AI QUESITI PROPOSTI DAL GIUDICE:*
*"Venendo dunque a rispondere ai quesiti proposti dal Giudice, si possono formulare le seguenti considerazioni tecniche, accorpando i quesiti laddove presentino profili di sovrapponibilità o spostandoli dall'ordine originario, per garantire una più chiara esposizione."*
*Per ciascun quesito: ri-citazione testuale tra virgolette come intestazione + risposta motivata. Elementi da coprire DENTRO le risposte, dove pertinenti:*
*- CAUSA DEL DECESSO e substrato anatomo-patologico: causa iniziale, intermedia e terminale (scheda di morte), stati morbosi preesistenti, eventuale riscontro autoptico/istologico*
*- nesso di causalità materiale e giuridica sul determinismo del decesso secondo il criterio civilistico del "più probabile che non"; giudizio controfattuale riferito ESPRESSAMENTE all'evento morte (la condotta alternativa corretta avrebbe evitato o significativamente posticipato il decesso?)*
*- ruolo concausale dell'illecito rispetto a preesistenze e comorbidità (stato anteriore): efficienza causale esclusiva, concorrente o assente*
*- condotta sanitaria vs linee guida e buone pratiche cliniche vigenti ALL'EPOCA dei fatti (condotta esigibile)*
*- voci di danno da decesso: danno iure proprio dei congiunti (perdita del rapporto parentale); danno iure hereditatis (danno biologico terminale e danno morale catastrofale, se vi fu un apprezzabile lasso di tempo tra lesione e decesso con lucida percezione)*

*NOTA: ITT/ITP, percentuali di invalidità permanente e tabelle SIMLA NON si applicano al periziando deceduto.]*`;
