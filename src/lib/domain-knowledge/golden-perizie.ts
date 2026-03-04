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
