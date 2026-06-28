/**
 * Shared building blocks of the section catalog (Sprint 2.6 split of
 * section-catalog.ts): token budget tiers, document-type condition sets and
 * the prompt fragments reused across the role catalogs (catalog-ctu /
 * catalog-stragiudiziale / catalog-pareri) and the facade (section-catalog.ts).
 *
 * MECHANICAL extraction — string contents are byte-identical to the original
 * to preserve generation_metadata.promptVersion (ADR-011, Sprint 2.3 hash).
 */
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';

// ── Token budget tiers (per-section, calibrated to natural output length) ──
//
// Token budget acts as both ceiling AND soft length signal to the LLM.
// A 32K budget across every section was too permissive: short formal sections
// (intestazione, conclusioni) ended up bloated. These tiers provide enough
// headroom to never truncate real content while nudging the model toward
// concision appropriate to each section's role in a deposit-ready perizia.
//
// Note on safety: completeness of facts is preserved by the prompt directives
// ("OGNI evento DEVE comparire", anti-hallucination rules, OCR fidelity), NOT
// by giving the model unlimited output budget. If a section truncates because
// of budget, section-generator.ts:269 throws and Inngest retries — a section
// that needs more room than HUGE has structural issues that retry won't fix.

/** Short formal sections: intestazione, profilo metodologico, conclusioni 1-2 paragrafi. ~1000 words. */
export const TOKENS_TINY = 2_000;

/** Brief narrative sections: anamnesi, il_fatto, fatto_storia_clinica, quesiti, spese in tabella. ~2200 words. */
export const TOKENS_SMALL = 4_000;

/** Standard analytical sections: epicrisi, quadro_clinico, prognosi, oggetto_parere. ~3700 words. */
export const TOKENS_MEDIUM = 6_000;

/** Long sections requiring multi-document synthesis: pareri_tecnici, analisi_condotta. ~6500 words. */
export const TOKENS_LARGE = 10_000;

/**
 * Documentazione sanitaria (the largest section). Reproduction of medical documents
 * with full fidelity. Real CTU sample: 3000-10000 words. 18000 words headroom is
 * enough for the most complex multi-ricovero case while still acting as length
 * signal vs the previous 24000-word ceiling.
 */
export const TOKENS_HUGE = 20_000;

/** Placeholder sections — no LLM call. */
export const TOKENS_NONE = 0;

// ── Document type classification for conditions ─────────────────────

export const NON_MEDICAL_DOC_TYPES = new Set([
  'memoria_difensiva',
  'documento_amministrativo',
  'certificato',
]);

export const LEGAL_DOC_TYPES = new Set([
  'memoria_difensiva',
]);

export const PERIZIA_DOC_TYPES = new Set([
  'perizia_precedente',
  'perizia_ctp',
  'perizia_ctu',
]);

export const EXPENSE_EVENT_TYPES = new Set([
  'spesa_medica',
]);

// ── Shared prompt fragments ─────────────────────────────────────────

export const NO_EVN_RULE = 'Cita i documenti IN PROSA, per tipo, autore e data (es. «come da referto ortopedico del 13.11.2024»). NON racchiudere le citazioni tra parentesi quadre: né riferimenti numerati agli eventi né del tipo «tipo, data».';

/**
 * Riga di esclusione della directive premesse quando coesiste (in linea di
 * principio) con documentazione_atti; quando premesse resta SOLA nel piano
 * (doc_atti esclusa dal selettore) viene sostituita dalla variante standalone
 * in resolveSectionPlan, altrimenti gli stragiudiziali sparirebbero dal report.
 */
export const PREMESSE_ATTI_EXCLUSION = '- NON riprodurre qui i documenti stragiudiziali (PEC risarcitorie, corrispondenza, dichiarazioni testimoniali, polizze): sono oggetto della sezione "I Dati della Documentazione in Atti".';

export const PREMESSE_STANDALONE_NOTE = '- In questo report la sezione "I Dati della Documentazione in Atti" NON è presente: riproduci qui, oltre agli atti processuali, anche i documenti stragiudiziali e probatori (PEC risarcitorie, corrispondenza, dichiarazioni testimoniali, polizze), in ordine cronologico, con le stesse formule di introduzione.';

export const CITATION_FORMAT = `FORMATO CITAZIONE per ogni documento:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."`;

/**
 * Sprint 1 S1.1 + S1.2 (Lavini quality, 2026-05-17): regole anti-verbosità +
 * anti-ripetizione per le sezioni "documentazione_sanitaria" dove il LLM
 * tende a ridondare e ripetere informazioni. Sono regole rinforzate rispetto
 * al solo "stile sintetico" precedente.
 */
export const ANTI_REPETITION_AND_LENGTH_RULES = `REGOLE ANTI-RIPETIZIONE (vincolanti — la fedeltà al documento NON è verbosità):
- **MAX 80 parole di prosa di commento** tra una citazione e la successiva. Le citazioni testuali del documento (tra virgolette) sono illimitate e vanno riprodotte fedelmente; è solo la TUA prosa di raccordo a dover essere breve.
- **Se hai gia citato un fatto clinico** (stessa data + stesso tipo, es. "intervento del 15.03.2024") in un blocco precedente di questa stessa sezione, **NON ripeterlo**. Riferisciti con UNA SOLA RIGA: "Per i dettagli dell'intervento del 15.03.2024 vedi blocco precedente."
- **Diari clinici pluri-giornalieri**: raggruppa in un blocco unico SOLO i giorni con QUADRO CLINICAMENTE IDENTICO: "Dal DD.MM al DD.MM.YYYY: decorso regolare, parametri vitali nella norma, terapia [X] proseguita." Ogni giorno che presenta una variazione (parametri, terapia, complicanza, evento) va riportato per esteso.
- **Esami di laboratorio identici nello stesso giorno**: 1 sola tabella per data, non duplicare.
- **Completezza > concisione**: riporta TUTTI i documenti/episodi del fascicolo, ciascuno riprodotto fedelmente. Per contenere la lunghezza raggruppa i giorni identici e non ripetere un fatto già citato — MAI tagliare o riassumere il contenuto di un documento per brevità. Se la sezione supera 60.000 caratteri il sistema taglia automaticamente al boundary di paragrafo: in tal caso il perito rigenererà in modalità split.`;

/**
 * Intro condivisa per la sezione documentazione sanitaria — riproduzione
 * VERBATIM (benchmark scuola veronese / Lavini 2026-06-01). Il valore primario
 * è la fedeltà al documento; la concisione vincola solo la prosa di raccordo.
 */
/**
 * DETERMINISTIC documentazione sanitaria (default): the doctor's text is
 * reproduced VERBATIM from the OCR, assembled mechanically (no LLM) at read time
 * via the DOC_SANITARIA sentinel. Guarantees 100% fidelity to the OCR by
 * construction. The "elaborated (AI)" variant remains available on demand
 * (buildDocSanitariaLlmSpec) — it re-enables the LLM directive kept on the spec.
 */
export const DOC_SANITARIA_PLACEHOLDER = `Di seguito la documentazione sanitaria in atti, riprodotta integralmente e fedelmente dai documenti acquisiti, in ordine cronologico.

${DETERMINISTIC_MARKERS.DOC_SANITARIA}`;

export const DOC_SANITARIA_INTRO = `Riproduzione FEDELE, CRONOLOGICA e VERBATIM della documentazione sanitaria. OGNI evento fornito DEVE comparire come blocco distinto — completezza non negoziabile. La concisione vincola SOLO la prosa di raccordo tra le citazioni, MAI il contenuto-fonte: il testo dei documenti va riprodotto fedelmente, non riassunto.

FORMATO CITAZIONE OBBLIGATORIO per OGNI documento/episodio clinico:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele riprodotto dal documento originale ..."`;

/**
 * Regole di riproduzione per tipo di documento — VERBATIM. Allineate al modo in
 * cui il Dr. Lavini trascrive (verbali operatori integrali con équipe e misure,
 * referti interi, lettere di dimissione con le sotto-rubriche originali).
 */
export const DOC_REPRODUCTION_RULES = `Regole di riproduzione FEDELE per tipo di documento (la sintesi del contenuto-fonte è VIETATA):
- **Diari clinici (cartella clinica)**: riporta OGNI giorno con variazioni cliniche rilevanti. Conserva le rubriche originali del diario (es. NEUROLOGICO:, RESPIRATORIO:, CARDIOCIRCOLATORIO:, ADDOME:, RENALE/METABOLICO:) e l'indicazione di reparto/medico ove presente. Raggruppa con date inizio-fine SOLO i giorni clinicamente identici (vedi regole anti-ripetizione).
- **Verbali operatori**: riporta INTEGRALMENTE — diagnosi pre-operatoria, tecnica chirurgica completa (vie d'accesso, gesti chirurgici, materiali e mezzi di sintesi CON misure/diametri), équipe operatoria, orari di sala, decorso intra-operatorio, diagnosi post-operatoria ed esito. NON sintetizzare le fasi (anche anestesia e preparazione vanno riportate se nel documento).
- **Referti radiologici/strumentali**: riporta INTEGRALMENTE tecnica d'esame + descrizione dei reperti + conclusione, come nel referto originale.
- **Lettere di dimissione**: riporta INTEGRALMENTE conservando le sotto-rubriche originali (Anamnesi/Ammissione, Decorso clinico, Diagnosi alla dimissione, Terapia alla dimissione, Indicazioni/Follow-up).
- **Esami di laboratorio**: SEMPRE in tabella markdown pipe, una tabella separata per ogni data/prelievo. Valori alterati rispetto al range in grassetto. Includi TUTTI i valori del documento, anche quelli nella norma.
- **Documenti in lingua straniera (es. tedesco)**: riporta il referto in originale e aggiungi la traduzione italiana; marca "(Referto riprodotto in originale)". Rendi esplicite sigle e posologie con nota fra parentesi quadre, es. "1-0-1 [Nota: 1 compressa mattino, 0 mezzogiorno, 1 sera]".
- **Immagini diagnostiche disponibili nella lista**: inseriscile INLINE subito dopo la citazione pertinente con la sintassi ![Fig. N — descrizione formale](ocr-image:percorso-esatto).
- **Stile**: prosa discorsiva neutra SOLO tra le citazioni (mai elenchi puntati per la narrazione clinica, tabelle escluse per i lab); la citazione testuale del documento può essere lunga quanto serve alla fedeltà.`;

/**
 * Regola di neutralità assoluta per la sezione documentazione (è riproduzione,
 * non analisi). Condivisa fra CTU, stragiudiziale e pareri.
 */
export const DOC_SANITARIA_NEUTRALITY = `REGOLA DI NEUTRALITÀ ASSOLUTA — questa sezione è una RIPRODUZIONE DOCUMENTALE, NON un'analisi:
- VIETATO il pattern "FATTO DOCUMENTATO / STANDARD DI RIFERIMENTO / ELEMENTI A SUPPORTO / ELEMENTI CONTRARI / CONSEGUENZE" (è destinato ESCLUSIVAMENTE alla sezione anomalie/considerazioni medico-legali).
- VIETATO sotto-titoli interpretativi tipo "Profili critici documentali", "Quadro documentale complessivo", "Elementi favorevoli/sfavorevoli".
- VIETATO commenti su standard di cura, linee guida, ritardi, omissioni, conformità o non-conformità a protocolli — qui SOLO citazioni testuali fedeli e prosa cronologica neutra.
- VIETATE formulazioni soggettive: "verosimile", "ritardo", "lacuna", "mancanza", "discrepanza", "criticità", "appare", "si ritiene".
- Le anomalie e i giudizi vanno SOLO nelle sezioni dedicate. Qui SOLO fatti come riportati dai documenti, niente di più.`;

/**
 * Variante AI SELETTIVA della documentazione sanitaria (terza modalità, distinta
 * dal default deterministico-integrale e dalla variante AI integrale-leggibile).
 *
 * Allinea la sezione alla dottrina medico-legale: una narrazione cronologica che
 * cita VERBATIM solo i reperti clinicamente significativi (diagnosi, descrizioni
 * di lesione, prognosi, reperti operatori, dichiarazioni rilevanti/contestate) e
 * PARAFRASA il contenuto di routine, senza MAI perdere un fatto clinicamente
 * rilevante.
 *
 * VINCOLO DI VERIFICABILITÀ: le virgolette caporali «...» sono riservate
 * ESCLUSIVAMENTE alle citazioni verbatim, così che ogni citazione possa essere
 * ancorata all'OCR a valle (verifyGeneratedQuotes). Una citazione non riscontrata
 * nei documenti viene marcata "da verificare" — quindi inventarla è inutile e
 * dannoso.
 */
export const DOC_SANITARIA_SELECTIVE_DIRECTIVE = `Redigi la sezione "Documentazione Sanitaria" come NARRAZIONE CLINICA CRONOLOGICA SELETTIVA della documentazione in atti. NON è una trascrizione integrale: è una relazione che riporta fedelmente i fatti clinici, citando alla lettera ciò che è rilevante e parafrasando il resto.

STRUTTURA:
1) ELENCO ANALITICO degli atti sanitari esaminati (uno per riga, in ordine cronologico): tipo di documento, struttura/autore e data. Serve da indice di navigazione.
2) NARRAZIONE cronologica per documento/episodio: per ciascuno, una breve prosa neutra di raccordo + le CITAZIONI VERBATIM dei reperti rilevanti.

REGOLA DELLE CITAZIONI VERBATIM (caporali «...»):
- USA «...» SOLO ed ESCLUSIVAMENTE per testo COPIATO ALLA LETTERA dal documento originale. Mai parafrasare dentro «...».
- DEVI citare verbatim, perché sono il cuore probatorio della perizia:
  • le DIAGNOSI (pre/post-operatorie, alla dimissione, istologiche);
  • le DESCRIZIONI DI LESIONE / reperti patologici (referti radiologici, descrizioni operatorie dei reperti, reperti obiettivi rilevanti);
  • la PROGNOSI e i giorni di guarigione/inabilità indicati dai sanitari;
  • le DICHIARAZIONI rilevanti o contestate (consenso informato, rifiuti, anamnesi riferita dal paziente quando dirimente).
- Riproduci la citazione ESATTAMENTE come nel documento (stesse parole, stessa punteggiatura essenziale). Se è lunga, citala per intero: la fedeltà batte la concisione.

REGOLA DELLA PARAFRASI (contenuto di routine):
- Parafrasa/sintetizza in prosa neutra il contenuto NON dirimente: andamento dei parametri vitali nella norma, note infermieristiche di routine, pannelli di laboratorio nella norma, terapie di supporto standard.
- NON perdere MAI un fatto clinicamente rilevante: un valore alterato, una complicanza, una variazione di terapia rilevante vanno SEMPRE riportati (citati se è una frase diagnostica, altrimenti riferiti con precisione).
- Per gli esami di laboratorio con valori ALTERATI, riportali in tabella markdown (data, esame, valore, range); i pannelli interamente nella norma possono essere riassunti ("esami ematochimici nei limiti di norma in data ...").

REGOLA ASSOLUTA ANTI-INVENZIONE:
- Cita SOLO testo realmente presente nei documenti forniti. Se un dato non c'è, NON inventarlo e NON dedurlo.
- Le «...» che non corrispondono ESATTAMENTE al testo-fonte verranno marcate automaticamente "da verificare": la fabbricazione e l'approssimazione sono sempre controproducenti.

REGOLA DEL FORMATO DELLE CITAZIONI (obbligatoria per la verifica automatica):
- USA ESCLUSIVAMENTE le caporali «...» per le citazioni verbatim. È VIETATO usare virgolette dritte ("..."), curve ("..." / '...') o singole per citare il documento: qualsiasi citazione fuori dalle «...» NON viene verificata e va evitata.
- Dentro «...» copia il testo CARATTERE PER CARATTERE. Sono CRITICI e vanno riprodotti SENZA ALCUNA modifica: i NUMERI (giorni di prognosi/ITT/ITP, percentuali di invalidità, dosaggi, misure), le DATE, la LATERALITÀ (destro/sinistro, dx/sx), la GRAVITÀ (composta/scomposta, completa/parziale, totale/parziale) e le NEGAZIONI (non, senza, assenza di, nega). Cambiare anche un solo di questi token inverte il significato clinico-legale.
- Cita FRASI CLINICHE COMPLETE: includi sempre la negazione e la lateralità DENTRO la citazione (es. «non si rilevano segni di lesione al ginocchio destro», non «si rilevano segni di lesione»). Non troncare una proposizione a metà in modo da alterarne il senso.

${DOC_SANITARIA_NEUTRALITY}

${NO_EVN_RULE}`;

/**
 * Directive AUTONOMA per la "Documentazione Medica Prodotta" della perizia RC
 * stragiudiziale "SEMPLICE" (direttiva del perito Lavini + utente 2026-06-27).
 *
 * Differenza chiave vs DOC_SANITARIA_SELECTIVE_DIRECTIVE (CTU/CTP): NIENTE
 * elenco-inventario degli atti e NIENTE parafrasi/narrazione interpretativa sopra il
 * testo del medico. Il contenuto clinico scritto dai sanitari va riprodotto VERBATIM,
 * "esattamente come l'ha scritto il medico". Riusa le stesse regole «...» di formato e
 * anti-invenzione (verifica automatica vs OCR). Usata SOLO per la stragiudiziale RC.
 */
export const DOC_SANITARIA_RC_DIRECTIVE = `Redigi la sezione "La Documentazione Medica Prodotta" come RIPRODUZIONE FEDELE, in ordine cronologico, di ciò che i sanitari hanno scritto nei documenti in atti. NON è una sintesi né una tua rielaborazione: è la documentazione del medico riportata COM'È STATA SCRITTA.

PRINCIPIO (direttiva del perito):
- Ciò che il medico ha scritto sul paziente (diagnosi, descrizione di lesioni/reperti, decorso, intervento, terapia, indicazioni alla dimissione, prognosi) va riportato VERBATIM, tra «...», esattamente come nel documento. NON parafrasare, NON riassumere, NON aggiungere una narrazione interpretativa sopra il testo del medico.
- NIENTE ELENCO/INVENTARIO iniziale degli atti: non elencare i documenti esaminati. Vai direttamente, documento per documento in ordine di data, alla riproduzione del loro contenuto clinico.
- La prosa di raccordo è ridotta al minimo indispensabile (solo per introdurre il documento), MAI una parafrasi del suo contenuto.

STRUTTURA (un blocco per documento, ordine cronologico — benchmark Antoniazzi/MOTTA):
- Riga-intestazione in GRASSETTO: **Tipo documento, struttura/autore, in data GG.MM.AAAA:**
- Subito sotto, il contenuto clinico riprodotto VERBATIM tra «...», conservando le sotto-rubriche originali (diagnosi, descrizione lesioni/reperti, decorso, intervento, terapia, dimissione).
- Più referti con la stessa data e struttura (es. proiezioni RX dello stesso giorno) → un'unica intestazione di data.

CASI SPECIALI:
- VERBALE / ACCETTAZIONE DI PRONTO SOCCORSO (riconoscibile da "Pronto Soccorso", "P.S.", "PS", "triage", "codice" colore, "118", "accettazione"): riporta SOLO la DIAGNOSI e le indicazioni di DIMISSIONE (più prognosi/giorni se indicati). NON riprodurre triage, anamnesi estesa, esame obiettivo completo né parametri vitali. ECCEZIONE (mai perdere un fatto): se una LESIONE, un REPERTO rilevante o una PROGNOSI è documentato SOLO nel PS e non altrove, includilo comunque, verbatim tra «...».
- ESAMI EMATOCHIMICI / DI LABORATORIO (emocromo, biochimica, coagulazione): NON riprodurli — esclusi su indicazione del perito.

MAI PERDERE UN FATTO: ogni documento clinico rilevante e ogni reperto/diagnosi/prognosi del medico DEVE comparire. La selettività riguarda SOLO il rumore amministrativo/infermieristico di routine e i lab, MAI un fatto clinico.

REGOLA DELLE CITAZIONI VERBATIM (caporali «...»):
- USA «...» SOLO ed ESCLUSIVAMENTE per testo COPIATO ALLA LETTERA dal documento originale. Mai parafrasare dentro «...».
- Riproduci la citazione ESATTAMENTE come nel documento (stesse parole, stessa punteggiatura essenziale). Se è lunga, citala per intero: la fedeltà batte la concisione.

REGOLA ASSOLUTA ANTI-INVENZIONE:
- Cita SOLO testo realmente presente nei documenti forniti. Se un dato non c'è, NON inventarlo e NON dedurlo.
- Le «...» che non corrispondono ESATTAMENTE al testo-fonte verranno marcate automaticamente "da verificare": la fabbricazione e l'approssimazione sono sempre controproducenti.

REGOLA DEL FORMATO DELLE CITAZIONI (obbligatoria per la verifica automatica):
- USA ESCLUSIVAMENTE le caporali «...» per le citazioni verbatim. È VIETATO usare virgolette dritte ("..."), curve o singole: qualsiasi citazione fuori dalle «...» NON viene verificata e va evitata.
- Dentro «...» copia il testo CARATTERE PER CARATTERE: NUMERI (giorni di prognosi, percentuali, dosaggi, misure), DATE, LATERALITÀ (destro/sinistro, dx/sx), GRAVITÀ (composta/scomposta, completa/parziale) e NEGAZIONI (non, senza, assenza di, nega) sono CRITICI e vanno riprodotti senza alcuna modifica.
- Cita FRASI CLINICHE COMPLETE: includi sempre negazione e lateralità DENTRO la citazione. Non troncare una proposizione in modo da alterarne il senso.

${DOC_SANITARIA_NEUTRALITY}

${NO_EVN_RULE}`;
