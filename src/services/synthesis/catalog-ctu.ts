/**
 * CTU/CTP giudiziale section catalog (Sprint 2.6 split of section-catalog.ts):
 * the CTU section template, the CTP derivation (CTU minus osservazioni_bozza),
 * the penale considerazioni section and the penale/decesso plan transforms.
 *
 * MECHANICAL extraction — string contents are byte-identical to the original
 * to preserve generation_metadata.promptVersion (ADR-011, Sprint 2.3 hash).
 */
import type { SectionSpec } from './section-generation-types';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import {
  TOKENS_SMALL,
  TOKENS_MEDIUM,
  TOKENS_LARGE,
  TOKENS_HUGE,
  TOKENS_NONE,
  NO_EVN_RULE,
  PREMESSE_ATTI_EXCLUSION,
  CITATION_FORMAT,
  ANTI_REPETITION_AND_LENGTH_RULES,
  DOC_SANITARIA_PLACEHOLDER,
  DOC_SANITARIA_INTRO,
  DOC_REPRODUCTION_RULES,
  DOC_SANITARIA_NEUTRALITY,
} from './catalog-shared';
import {
  DOCUMENT_ANALYSIS_FORMULATIONS,
  DOCUMENTAZIONE_SANITARIA_EXAMPLE,
} from './peritale-formulations';
import {
  OPERAZIONI_PERITALI_PLACEHOLDER,
  OPERAZIONI_PERITALI_DECESSO_PLACEHOLDER,
  INCONTRO_PERITALE_PENALE_PLACEHOLDER,
  CONSIDERAZIONI_DECESSO_PLACEHOLDER,
  CONSIDERAZIONI_ML_PLACEHOLDER,
  CONSIDERAZIONI_PENALE_PLACEHOLDER,
  OSSERVAZIONI_BOZZA_PLACEHOLDER,
  CONCILIAZIONE_ANTE_PLACEHOLDER,
  CONCILIAZIONE_POST_PLACEHOLDER,
  PROFILO_METODOLOGICO_PLACEHOLDER,
  ACCERTAMENTO_AUSILIARIO_PLACEHOLDER,
  PREVENTIVI_SPESE_ML_PLACEHOLDER,
} from './section-placeholders';

// ── CTU Giudiziale sections (15) ────────────────────────────────────

export const CTU_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione',
    title: 'Intestazione',
    // SMALL (4000 tok) not TINY (2000): CTU complessi con CC.TT.P. multipli +
    // termini multi-fase + fondo spese produrrebbero 1500-2000 parole formali
    // = ~2700 tok output. TINY=2000 saturava con rischio truncatura silente.
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata', 'events-medical', 'events-non-medical'],
    contextMaxChars: 300,
    needsOcr: false,
    condition: 'has-perizia-metadata',
    promptDirective: `Genera l'intestazione formale della perizia CTU, replicando il FORMATO BENCHMARK Del Porto / Mao:

STRUTTURA OBBLIGATORIA (in quest'ordine, in Markdown):

1) USA H1 MARKDOWN per intestazione tribunale (verra' renderizzato in font monospace con character spacing, come da benchmark):
   \`\`\`
   # TRIBUNALE ORDINARIO DI [CITTA]
   # SEZIONE [CIVILE/PENALE/CENTRALE CIVILE | PROCEDIMENTI SPECIALI SOMMARI]
   \`\`\`

2) NUMERO DI RUOLO (riga normale, grassetto):
   "**Numero di Ruolo Generale n. NNNNN/YYYY**"

3) TIPO DI PROCEDIMENTO (riga normale):
   Es. "Accertamento tecnico preventivo (ex art. 696 bis c.p.c.)" / "Consulenza Tecnica d'Ufficio"

4) OGGETTO DELLA PERIZIA (riga in grassetto):
   "**relativo alla vicenda clinica del/della sig./sig.ra COGNOME NOME**"

5) SEPARATORE asterischi su riga propria, centrato:
   "* * * * *"

6) DESTINATARIO (allineato in modo da apparire a destra; il rendering DOCX lo gestisce):
   "Ill.mo Sig./Sig.ra"
   "**Dott./Dott.ssa NOME COGNOME**"
   "Giudice Delegato/Istruttore"
   "c/o il Tribunale di [CITTA]"

7) PARAGRAFO DI CONFERIMENTO (passato remoto, formale, in prosa giustificata):
   "Il giorno DD.MM.YYYY il Dott. [GIUDICE], Giudice Delegato presso il Tribunale Ordinario di [CITTA] – Sezione [X], conferiva al sottoscritto Dott. [CTU], medico legale presso [STRUTTURA], l'incarico di eseguire indagine medico-legale sulla vicenda clinica relativa a:"

8) BLOCCO DATI PERIZIANDO (nome in grassetto):
   "**NOME COGNOME**"
   "nato/a a [LUOGO] il DD.MM.YYYY, residente a [LUOGO] in [INDIRIZZO]."

9) CONSULENTI TECNICI DI PARTE (se documentati, riga per parte):
   "La parte ricorrente nominava quali propri CC.TT.P. [NOMI]."
   "La parte resistente [NOME ASL/AZIENDA] nominava quali propri CC.TT.P. [NOMI]."

10) DATE OPERAZIONI E TERMINI (se documentate):
   - Data inizio operazioni peritali
   - Termini per bozza, osservazioni CC.TT.P., deposito definitivo
   - Fondo spese se documentato

REGOLA ASSOLUTA — VIETATO INVENTARE QUALSIASI DATO:
Questa perizia sara' depositata in Tribunale e firmata dal CTU. Inventare dati anche solo per "completezza" e' un errore gravissimo. Per ogni campo:
1) Cerca nei METADATI PERIZIA del prompt utente.
2) Se assente, cerca negli ATTI/EVENTI forniti (memorie difensive, ricorsi, intestazioni di cartelle cliniche).
3) Se ancora assente, scrivi letteralmente \`[da compilare dal perito]\` o ometti la voce.

VIETATO TASSATIVAMENTE: R.G. fittizi, Giudici inventati, parti inventate, CC.TT.P. non nominati, CF/indirizzi/date di nascita non documentati, termini procedurali non risultanti dagli atti.

Stile formale da perizia depositabile in Tribunale, passato remoto.
${NO_EVN_RULE}`,
  },
  {
    id: 'quesiti',
    title: 'Quesiti',
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata'],
    contextMaxChars: 500,
    needsOcr: false,
    // QA 2026-06-11: niente condition 'has-quesiti' — in 6 gold su 6 la CTU HA
    // i quesiti; se il form non li contiene la sezione NON sparisce: in
    // resolveSectionPlan viene degradata a placeholder con invito a inserirli.
    // Benchmark gold 2026-06-10: in 6 gold su 6 i quesiti sono un UNICO blocco
    // virgolettato fedele all'ordinanza, mai una lista rinumerata dall'estensore.
    promptDirective: `Riproduci i quesiti del Giudice come UNICO blocco virgolettato FEDELE all'ordinanza di conferimento.
REGOLE VINCOLANTI:
- Conserva la formula di rito iniziale se presente (es. "Letti gli atti e documenti di causa, visitato il periziando...").
- Conserva la numerazione/elencazione ORIGINALE dell'ordinanza: trattini, lettere a)-l), numeri romani I)-IV), sotto-punti 8.1/8.2. NON rinumerare: numera SOLO se e come l'ordinanza numera.
- NON modificare, riassumere o parafrasare il testo dei quesiti. Se un quesito contiene sotto-punti, riportali tutti fedelmente.
${NO_EVN_RULE}`,
  },
  {
    // Benchmark gold Del Porto (2026-06-10): frase-ponte metodologica + indice
    // della relazione, subito dopo i quesiti. Deterministica, deselezionabile.
    id: 'profilo_metodologico',
    title: 'Profilo Metodologico',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: PROFILO_METODOLOGICO_PLACEHOLDER,
    promptDirective: '',
  },
  {
    id: 'documentazione_atti',
    title: 'I Dati della Documentazione in Atti',
    // HUGE (was LARGE): il caso reale Tedesco (~30 atti) ha sfondato il tetto
    // 10K token a 29.430 char (finishReason=length → throw → retry inutili a
    // parità di budget). L'assunzione "32K char ≈ 8K token" del vecchio
    // commento era ottimista: un inventario denso di date/nomi/numeri scende a
    // ~3 char/token, quindi il soft-cap char scattava DOPO il muro token. Con
    // 20K token il soft-cap a 32K char (~11K token worst case) torna a fare il
    // suo lavoro: taglio pulito a boundary di paragrafo, mai troncamento LLM.
    maxTokens: TOKENS_HUGE,
    maxChars: 32_000,
    dataSources: ['events-non-medical'],
    contextMaxChars: 500,
    needsOcr: true,
    verifyQuotes: true,
    condition: 'has-non-medical-docs',
    promptDirective: `Riproduzione FEDELE e VERBATIM dei documenti NON sanitari presenti nel fascicolo, in ordine cronologico:
ricorsi, memorie difensive, atti di citazione, testimonianze, dichiarazioni, verbali di udienza, provvedimenti del Giudice, clausole di polizza, e la documentazione AMMINISTRATIVA rilevante (contratti di ingresso/ospitalità, fatture, carta dei servizi, schede di valutazione regionali, delibere).
${CITATION_FORMAT}
- Ogni atto introdotto da una riga con tipo + autore/avvocato + data di deposito. Formule di introduzione (benchmark):
  **[Tipo atto] redatto dall'Avv. [nome] in rappresentanza di [parte], datato DD.MM.YYYY:** "..."
  **Messaggio a mezzo PEC indirizzato a [struttura], redatto dal Dott. [autore] per conto di [parte], in data DD.MM.YYYY:** "..."
  **Dichiarazione testimoniale resa da [testimone], [relazione con il periziando], in data DD.MM.YYYY:** "..."
- Riproduci il contenuto VIRGOLETTATO mantenendo la NUMERAZIONE ORIGINALE dei punti dell'atto (1), 2), 3)...), le CONCLUSIONI delle parti e i virgolettati testuali (PEC, clausole, certificati) come nell'originale. NON riassumere il testo dell'atto.
- CHIUSURA DI SEZIONE (inventario, benchmark): separatore "* * * * *" su riga propria + formula "Si dà inoltre atto di aver preso visione dei seguenti documenti, di cui si omette la recensione per motivi di economia espositiva." seguita dall'elenco RAGGRUPPATO PER PARTE ("Documenti allegati da parte ricorrente/attrice:" / "da parte resistente/convenuta – [parte]:" / "da terza chiamata – [parte]:"), una voce per riga con numero di documento, tipo e data.
REGOLA DI NEUTRALITÀ: riproduci senza commentare, valutare o evidenziare criticità, lacune, ritardi o discrepanze. Riporta solo ciò che gli atti dichiarano, lasciando ogni giudizio al perito.
${NO_EVN_RULE}`,
  },
  {
    // Benchmark gold 2026-06-10: 5 gold su 6 NON hanno una sezione Premesse —
    // ricorsi e memorie vivono UNA sola volta dentro "I Dati della Documentazione
    // in Atti". La sezione resta disponibile per il profilo Del Porto (atti
    // processuali separati): resolveSectionPlan la sopprime quando
    // documentazione_atti è attiva (mutuamente esclusive, niente doppioni).
    id: 'premesse',
    title: 'Premesse',
    maxTokens: TOKENS_LARGE,
    // Stesso cap di documentazione_atti: il verbatim di ricorso + memorie nel
    // gold Del Porto supera ampiamente il vecchio budget MEDIUM.
    maxChars: 32_000,
    dataSources: ['events-non-medical'],
    contextMaxChars: 500,
    needsOcr: true,
    verifyQuotes: true,
    condition: 'has-legal-docs',
    promptDirective: `Riproduzione FEDELE e VERBATIM degli atti processuali introduttivi presenti nel fascicolo: ricorso introduttivo (es. ricorso ex art. 696-bis c.p.c.), atto di citazione, memorie difensive e comparse di costituzione.
Per ogni atto usa la formula di introduzione:
**Ricorso per Consulenza Tecnica Preventiva redatto dall'Avv. [nome] per parte ricorrente in data DD.MM.YYYY:** "..."
**Memoria difensiva di costituzione nell'interesse di [parte], redatta dall'Avv. [nome], in data DD.MM.YYYY:** "..."
- Riproduci il contenuto VIRGOLETTATO mantenendo la NUMERAZIONE ORIGINALE dei punti dell'atto (1), 2), 3)...) e le CONCLUSIONI delle parti come nell'originale. NON riassumere il testo dell'atto.
${PREMESSE_ATTI_EXCLUSION}
REGOLA DI NEUTRALITÀ: riproduci senza commentare, valutare o evidenziare criticità. Riporta solo ciò che gli atti dichiarano, lasciando ogni giudizio al perito.
${NO_EVN_RULE}`,
  },
  {
    id: 'documentazione_sanitaria',
    title: 'I Dati della Documentazione Sanitaria in Atti',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    // DETERMINISTIC default: the doctor's text is reproduced VERBATIM from the
    // OCR (no LLM) via the DOC_SANITARIA sentinel. The promptDirective below is
    // the "elaborated (AI)" variant, used only when the perito regenerates with
    // isPlaceholder disabled (buildDocSanitariaLlmSpec).
    isPlaceholder: true,
    placeholderText: DOC_SANITARIA_PLACEHOLDER,
    promptDirective: `${DOC_SANITARIA_INTRO}

${DOC_REPRODUCTION_RULES}

${DOC_SANITARIA_NEUTRALITY}

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}

${DOCUMENT_ANALYSIS_FORMULATIONS}

${DOCUMENTAZIONE_SANITARIA_EXAMPLE}`,
  },
  {
    id: 'pareri_tecnici',
    title: 'Precedenti Pareri Tecnici',
    // Benchmark gold 2026-06-10: i pareri di parte e i moduli dei fiduciari
    // assicurativi vanno riprodotti INTEGRALMENTE (non solo le conclusioni) →
    // budget HUGE con cap chars come la documentazione sanitaria.
    maxTokens: TOKENS_HUGE,
    maxChars: 60_000,
    dataSources: ['events-perizie'],
    contextMaxChars: 500,
    needsOcr: true,
    verifyQuotes: true,
    condition: 'has-perizie-docs',
    promptDirective: `Riproduci INTEGRALMENTE ogni parere tecnico precedente (CTP, CTU, perizie di parte): intestazione del parere, ricostruzione della vicenda, esame obiettivo, valutazione medico-legale e conclusioni, conservando le sotto-rubriche originali (es. VISITA DEL DANNEGGIATO, PARERE MEDICO-LEGALE).
Per le relazioni dei fiduciari assicurativi conserva la struttura a campi del modulo (DATI IDENTIFICATIVI / GENERALITÀ DEL DANNEGGIATO / GIUDIZIO SUL NESSO DI CAUSALITÀ / TIPOLOGIA E LOCALIZZAZIONE DELLE LESIONI / VALUTAZIONE RC / VALUTAZIONE POLIZZA INFORTUNI con tabella di riferimento ANIA/INAIL/di polizza e punteggi / CONGRUITÀ SPESE MEDICHE / FIRMA DEL FIDUCIARIO). Riporta verbatim le clausole di polizza citate nel parere.
Formula di introduzione per ogni parere:
**Parere medico legale redatto dal Dott. [nome], specialista in [specialità], per parte ricorrente/resistente – [parte], in data DD.MM.YYYY:** "..."
**Relazione medico legale a firma della Dott.ssa [CTP] per conto del Sig. [periziando], in data DD.MM.YYYY:** "..."
Se sono disponibili immagini diagnostiche citate nei pareri, inseriscile INLINE dopo la citazione pertinente.
${NO_EVN_RULE}`,
  },
  {
    // Ordine benchmark gold 2026-06-10: doc sanitaria → pareri tecnici → spese
    // (2 gold su 3 con entrambe le sezioni; Del Porto usa l'ordine inverso —
    // scelta documentata in ARCHITECTURE-DECISIONS).
    id: 'spese_mediche',
    title: 'Spese Mediche Esibite',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-expense-events',
    // DETERMINISTIC (B-pillar): the expense table is rendered mechanically from
    // every spesa_medica event at read time — NOT narrated by the LLM. This
    // guarantees Lavini's requirements by construction: ogni voce inclusa (anche
    // senza data → '—'), imposta di bollo come riga separata, nessuna voce persa.
    // La valutazione di congruità è un GIUDIZIO → resta al perito (placeholder).
    isPlaceholder: true,
    placeholderText: `Le spese mediche documentate sono riepilogate nella tabella seguente, calcolata automaticamente dalle voci di spesa del fascicolo.

${DETERMINISTIC_MARKERS.SPESE}

*[Il perito valuta la congruità rispetto al quadro clinico documentato. Struttura dei benchmark (quesito spese): per CATEGORIE DI CONGRUITÀ — spese pertinenti e congrue / non valutabili / non saldate ma congrue / non pertinenti / intestate a soggetto diverso / a finalità medico-legale rimesse al Giudice ("si rimettono alla discrezione del Sig. Giudice le spese relative a…") — ciascuna con tabella N. documento/Data/Acquisto/Importo + TOTALE.]*`,
    promptDirective: '',
  },
  {
    // Proforme dei CC.TT.P. (gold CTU collegiale): in coda alle spese.
    id: 'preventivi_spese_ml',
    title: 'Preventivi e Spese per Attività Medico-Legale',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-ctp-nominati',
    isPlaceholder: true,
    placeholderText: PREVENTIVI_SPESE_ML_PLACEHOLDER,
    promptDirective: '',
  },
  {
    id: 'operazioni_peritali',
    title: 'I Dati delle Operazioni Tecniche',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    // Benchmark gold 2026-06-10: scheletro-verbale completo (apertura, comparizioni,
    // dichiarazioni a verbale, attività del CTU, visita in rubriche, rinvio, firme).
    // Varianti decesso/penale swappate da applyDecessoSections/applyPenaleSections.
    placeholderText: OPERAZIONI_PERITALI_PLACEHOLDER,
    promptDirective: '',
  },
  {
    // Accertamento specialistico dell'Ausiliario (gold CTU danno psichico):
    // presente solo quando il perito ha nominato un ausiliario nei metadati.
    id: 'accertamento_ausiliario',
    title: 'Accertamento Specialistico dell\'Ausiliario',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-ausiliario',
    isPlaceholder: true,
    placeholderText: ACCERTAMENTO_AUSILIARIO_PLACEHOLDER,
    promptDirective: '',
  },
  {
    // Solo nei procedimenti ATP ex art. 696-bis c.p.c. (funzione conciliativa):
    // il tentativo di conciliazione antecedente l'invio della bozza è un atto
    // dovuto del CTU, riportato come sezione propria nei benchmark Calascibetta/
    // Caccialanza. Placeholder: lo compila il perito dopo le operazioni.
    id: 'conciliazione_ante_bozza',
    title: 'I Dati Relativi alla Disponibilità ad Esperire un Tentativo di Conciliazione in Fase Antecedente l\'Invio della Bozza di CTU',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-conciliazione-procedure',
    isPlaceholder: true,
    placeholderText: CONCILIAZIONE_ANTE_PLACEHOLDER,
    promptDirective: '',
  },
  {
    id: 'considerazioni_ml',
    title: 'Considerazioni Medico-Legali',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: CONSIDERAZIONI_ML_PLACEHOLDER,
    promptDirective: '',
  },
  {
    id: 'bibliografia',
    title: 'Bibliografia',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['pubmed-references'],
    contextMaxChars: 0,
    needsOcr: false,
    placeholderText: `*[Inserire bibliografia pertinente. Fonti tipiche:*
*- Linee guida delle societa scientifiche di riferimento per la patologia in esame*
*- Tabelle SIMLA per la valutazione del danno biologico*
*- Letteratura medico-legale e giuridica rilevante*
*- Protocolli e standard di buona pratica clinica applicabili al caso]*`,
    promptDirective: `Genera la sezione Bibliografia del report medico-legale.

Ti vengono forniti riferimenti scientifici PubMed pertinenti alle diagnosi del caso.
Per CIASCUN articolo, formatta come citazione bibliografica in stile Vancouver:

Autori. Titolo. Rivista. Anno;DOI (se disponibile). PMID: numero.

Organizza le citazioni per argomento/diagnosi, con un breve sottotitolo per ciascun gruppo.

Dopo le citazioni PubMed, aggiungi la nota:

*[Il perito potra integrare questa sezione con ulteriori fonti:*
*- Linee guida delle societa scientifiche di riferimento*
*- Tabelle SIMLA per la valutazione del danno biologico*
*- Letteratura medico-legale e giuridica aggiuntiva]*

${NO_EVN_RULE}`,
  },
  {
    id: 'osservazioni_bozza',
    title: 'I Dati dell\'Invio delle Bozze di CTU alle Parti, loro Osservazioni e Relativa Risposta',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: OSSERVAZIONI_BOZZA_PLACEHOLDER,
    promptDirective: '',
  },
  {
    // Secondo giro conciliativo (post-bozza) nei procedimenti ATP ex art.
    // 696-bis c.p.c.: cronologia datata + esito, chiusura con deposito.
    id: 'conciliazione_post_bozza',
    title: 'I Dati Relativi alla Disponibilità ad Esperire un Tentativo di Conciliazione in Fase Successiva all\'Invio della Bozza di CTU',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-conciliazione-procedure',
    isPlaceholder: true,
    placeholderText: CONCILIAZIONE_POST_PLACEHOLDER,
    promptDirective: '',
  },
];

// ── CTP sections (derived from CTU, without osservazioni_bozza) ─────

function buildCTPSections(): SectionSpec[] {
  // CTP uses same objective sections as CTU, minus osservazioni_bozza.
  // No bias toward critical profiles — 100% objective like CTU.
  return CTU_SECTIONS.filter((s) => s.id !== 'osservazioni_bozza');
}

export const CTP_SECTIONS: SectionSpec[] = buildCTPSections();

/**
 * Considerazioni medico-legali in ambito PENALE (responsabilità medico-sanitaria
 * colposa). Diversa dalla civilistica: NON si valuta il danno (no ITT/ITP/SIMLA);
 * il fulcro è la causa dell'evento/morte, il nesso causale penale e i profili di
 * colpa, con scala probabilistica VERBALE (benchmark CTU penale "Vitali").
 * Placeholder: lo compila il perito.
 */
export const CONSIDERAZIONI_PENALE_SECTION: SectionSpec = {
  id: 'considerazioni_penale',
  title: 'Considerazioni Medico-Legali',
  maxTokens: TOKENS_NONE,
  dataSources: [],
  contextMaxChars: 0,
  needsOcr: false,
  isPlaceholder: true,
  placeholderText: CONSIDERAZIONI_PENALE_PLACEHOLDER,
  promptDirective: '',
};

/**
 * Trasforma il piano CTU/CTP civile in penale: sostituisce considerazioni_ml con
 * considerazioni_penale, esclude le sezioni puramente civilistiche (spese mediche)
 * e sostituisce le operazioni peritali con "I Dati dell'Incontro Peritale"
 * (benchmark CTU penale: nessuna visita, incontro con i periti di parte di
 * imputati e parte civile). Stesso id per non rompere selettore/regen. Pura.
 */
export function applyPenaleSections(specs: SectionSpec[]): SectionSpec[] {
  return specs
    .filter((s) => s.id !== 'spese_mediche')
    .map((s) => {
      if (s.id === 'considerazioni_ml') return CONSIDERAZIONI_PENALE_SECTION;
      if (s.id === 'operazioni_peritali') {
        return {
          ...s,
          title: 'I Dati dell\'Incontro Peritale',
          placeholderText: INCONTRO_PERITALE_PENALE_PLACEHOLDER,
        };
      }
      return s;
    });
}

/**
 * Variante DECESSO del piano CTU/CTP civile (periziando deceduto): le
 * considerazioni guidano su causa della morte, nesso "più probabile che non" e
 * danno iure proprio/hereditatis (NO ITT/ITP/SIMLA sul deceduto); le operazioni
 * peritali diventano un verbale di riunione tecnica senza visita. Stessi id e
 * titoli (nessun impatto su selettore/regen/parser). Non si applica in ambito
 * penale, dove la morte è già il fulcro di considerazioni_penale. Pura.
 */
export function applyDecessoSections(specs: SectionSpec[]): SectionSpec[] {
  return specs.map((s) => {
    if (s.id === 'considerazioni_ml') {
      return { ...s, placeholderText: CONSIDERAZIONI_DECESSO_PLACEHOLDER };
    }
    if (s.id === 'operazioni_peritali') {
      return { ...s, placeholderText: OPERAZIONI_PERITALI_DECESSO_PLACEHOLDER };
    }
    return s;
  });
}
