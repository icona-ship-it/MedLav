export const meta = {
  name: 'confronto-rc-gold',
  description: 'Panel multi-agente: confronta i 3 report RC generati coi gold Lavini e produce i punteggi 0-100 per il gate (pnpm gate:rc)',
  whenToUse: 'Dopo ogni rigenerazione dei report benchmark (benchmark/generated/<slug>.md) per aggiornare benchmark/scores/rc-panel-scores.json',
  phases: [
    { title: 'Giudica', detail: '3 giudici per caso (lenti diverse)' },
    { title: 'Verifica', detail: 'verifica avversariale dei findings per caso' },
    { title: 'Sintesi', detail: 'score rettificato + scrittura rc-panel-scores.json' },
  ],
}

const REPO = '/Users/edo_mac_mini/Desktop/Progetti AI/MedLav'
const RUBRIC_VERSION = 'v1-2026-07-02'

const CASES = [
  { slug: 'gold-a-semplice', fascia: 'semplice', gate: 90 },
  { slug: 'gold-b-medio', fascia: 'medio', gate: 85 },
  { slug: 'gold-c-macrodanno', fascia: 'macrodanno', gate: 80 },
]

// Rubrica esplicita e versionata: il punteggio deve essere RIPETIBILE.
// Ancoraggio: 90+ = depositabile con <15 min di ritocchi del perito (solo
// giudizi/visita); 80-89 = ottimo draft, ritocchi mirati; 70-79 = buon draft,
// serve lavoro sostanziale (di solito selettivita); 60-69 = draft usabile con
// difetti strutturali; <60 = da rifare in parti importanti.
const RUBRIC = `RUBRICA ${RUBRIC_VERSION} (pesi su 100):
- fedelta_fatti (30): ogni fatto affermato esiste nei documenti/gold; date, diagnosi, strutture, nomi corretti; nessuna invenzione o interpretazione di testo illeggibile.
- completezza (20): nessun fatto clinicamente rilevante del gold perso; cronologia completa.
- selettivita (20): distillazione da perizia vera — 1 blocco per documento con la citazione-chiave; niente dump verbatim totale, log-terapia, lab seriali, scale, consensi, amministrativo; verbosita proporzionata al gold.
- struttura (10): schema stragiudiziale 7 sezioni (Intestazione, Anamnesi, Fatto+Storia, Doc Sanitaria, Visita scaffold, Spese, Epicrisi finale); ordine e intestazione allineati al gold.
- pulizia_depositabile (10): zero tag macchina, zero marker dentro le «...», zero meta-commenti LLM, zero numeri auto-inventati (ITT/spese) negli scaffold del perito.
- verbatim (10): le citazioni «...» riproducono ESATTAMENTE il testo del medico, una volta, senza parafrasi doppia ne alterazioni.
FLAG separato (non a punteggio): anti_copia = presenza di dati che possono venire SOLO dall'esempio-benchmark nel prompt e non dai documenti del caso (deve essere 0 su Motta e Bigon; su Antoniazzi non distinguibile, segnalare e basta).
Il punteggio del caso = somma pesata. Le sezioni che il perito compila in visita (Visita Clinica, giudizi valutativi, ITT graduata, % danno) NON sono difetti se lasciate a scaffold: e il comportamento corretto.`

const GDPR = `VINCOLO GDPR Art. 9: nei tuoi output NON riportare dati identificativi o clinici dei pazienti (nomi, diagnosi estese). Cita al massimo frammenti minimi (<10 parole) necessari a localizzare un problema, preferendo riferimenti posizionali (sezione, n. riga).`

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['scores', 'findings'],
  properties: {
    scores: {
      type: 'object',
      required: ['fedelta_fatti', 'completezza', 'selettivita', 'struttura', 'pulizia_depositabile', 'verbatim'],
      properties: {
        fedelta_fatti: { type: 'number', description: '0-30' },
        completezza: { type: 'number', description: '0-20' },
        selettivita: { type: 'number', description: '0-20' },
        struttura: { type: 'number', description: '0-10' },
        pulizia_depositabile: { type: 'number', description: '0-10' },
        verbatim: { type: 'number', description: '0-10' },
      },
    },
    antiCopiaLeaks: { type: 'number', description: 'quanti elementi solo-da-esempio trovati (0 se nessuno)' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['categoria', 'descrizione', 'gravita'],
        properties: {
          categoria: { type: 'string' },
          descrizione: { type: 'string', description: 'sintetica, posizionale, senza dati paziente' },
          gravita: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        },
      },
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['esiti'],
  properties: {
    esiti: {
      type: 'array',
      items: {
        type: 'object',
        required: ['descrizione', 'verdetto', 'nota'],
        properties: {
          descrizione: { type: 'string' },
          verdetto: { type: 'string', enum: ['CONFERMATO', 'RIFIUTATO', 'RIDIMENSIONATO'] },
          nota: { type: 'string' },
        },
      },
    },
  },
}

const RECTIFY_SCHEMA = {
  type: 'object',
  required: ['score', 'scoreMedianaGrezza', 'rettifica', 'categorie', 'motivazione', 'findingsConfermati'],
  properties: {
    score: { type: 'number', description: '0-100 finale rettificato' },
    scoreMedianaGrezza: { type: 'number', description: 'somma delle mediane per categoria dei 3 giudici, PRIMA di ogni rettifica' },
    rettifica: { type: 'number', description: 'score - scoreMedianaGrezza (positiva o negativa)' },
    categorie: {
      type: 'object',
      required: ['fedelta_fatti', 'completezza', 'selettivita', 'struttura', 'pulizia_depositabile', 'verbatim'],
      properties: {
        fedelta_fatti: { type: 'number' },
        completezza: { type: 'number' },
        selettivita: { type: 'number' },
        struttura: { type: 'number' },
        pulizia_depositabile: { type: 'number' },
        verbatim: { type: 'number' },
      },
    },
    antiCopiaLeaks: { type: 'number' },
    motivazione: { type: 'string', description: 'max 8 righe, senza dati paziente' },
    findingsConfermati: {
      type: 'array',
      items: {
        type: 'object',
        required: ['categoria', 'descrizione', 'gravita'],
        properties: {
          categoria: { type: 'string' },
          descrizione: { type: 'string' },
          gravita: { type: 'string' },
        },
      },
    },
  },
}

const LENSES = [
  { key: 'fatti', focus: 'FEDELTA DEI FATTI e COMPLETEZZA: confronta fatto per fatto (date, diagnosi, strutture, percorsi di cura). Cerca invenzioni, date sbagliate, fatti del gold assenti nel generato. Dai comunque un punteggio a TUTTE le categorie, ma il tuo giudizio pesa soprattutto su fedelta_fatti e completezza.' },
  { key: 'selettivita', focus: 'SELETTIVITA, VERBOSITA e STRUTTURA: conta i blocchi-documento, misura il rapporto di lunghezza, verifica quali tipi di documento il gold OMETTE/condensa e il generato invece riproduce (log-terapia, lab, scale, consensi, amministrativo), verifica lo schema a 7 sezioni e i duplicati (stesso referto ripetuto). Dai comunque un punteggio a TUTTE le categorie, ma il tuo giudizio pesa soprattutto su selettivita e struttura.' },
  { key: 'depositabilita', focus: 'PULIZIA DEPOSITABILE e VERBATIM: cerca tag macchina, marker dentro le «...», meta-commenti, numeri auto-inventati negli scaffold (ITT/spese), citazioni parafrasate o alterate rispetto ai testi originali, garble OCR passato nel testo. Verifica anti-copia. Dai comunque un punteggio a TUTTE le categorie, ma il tuo giudizio pesa soprattutto su pulizia_depositabile e verbatim.' },
]

phase('Giudica')
const judged = await pipeline(
  CASES,
  (c) => parallel(LENSES.map((lens) => () =>
    agent(
      `Sei un giudice del panel RC di LegMed. Caso "${c.slug}" (fascia ${c.fascia}).\n` +
      `Confronta il report GENERATO "${REPO}/benchmark/generated/${c.slug}.md" col GOLD del perito Lavini "${REPO}/benchmark/gold/${c.slug}.md" (leggili entrambi, integralmente; sono file locali, sola lettura).\n\n` +
      `${RUBRIC}\n\nLA TUA LENTE: ${lens.focus}\n\n${GDPR}\n\n` +
      `Assegna i punteggi per categoria (interi, entro i massimali) e elenca i findings concreti e verificabili (posizionali).`,
      { label: `giudice:${c.slug.split('-')[0]}:${lens.key}`, phase: 'Giudica', schema: JUDGE_SCHEMA, effort: 'high' }
    )
  )),
  (judgments, c) => {
    const valid = judgments.filter(Boolean)
    if (valid.length === 0) throw new Error('nessun giudice valido per ' + c.slug)
    const allFindings = valid.flatMap((j) => j.findings)
    return { judgments: valid, allFindings }
  },
  (acc, c) => agent(
    `Sei il verificatore avversariale del panel RC. Caso "${c.slug}".\n` +
    `File: GENERATO "${REPO}/benchmark/generated/${c.slug}.md", GOLD "${REPO}/benchmark/gold/${c.slug}.md" (sola lettura).\n` +
    `I giudici hanno riportato questi findings. Per OGNUNO, verifica sul file se esiste davvero (usa grep/lettura mirata): CONFERMATO, RIFIUTATO (non esiste / e in realta comportamento corretto, es. scaffold del perito) o RIDIMENSIONATO (esiste ma meno grave). Attenzione ai falsi positivi: le sezioni-scaffold (Visita Clinica, giudizi ITT/danno) sono CORRETTE se vuote.\n${GDPR}\n\nFINDINGS:\n` +
    JSON.stringify(acc.allFindings),
    { label: `verifica:${c.slug.split('-')[0]}`, phase: 'Verifica', schema: VERIFY_SCHEMA, effort: 'high' }
  ).then((esiti) => ({ ...acc, verify: esiti })),
  (acc, c) => agent(
    `Sei il rettificatore del panel RC. Caso "${c.slug}" (fascia ${c.fascia}, gate ${c.gate}).\n` +
    `${RUBRIC}\n\nHai: (1) i punteggi/findings di 3 giudici con lenti diverse, (2) la verifica avversariale dei findings.\n` +
    `Produci il punteggio FINALE rettificato: parti dalla mediana per categoria, correggi al ribasso/rialzo SOLO in base ai findings CONFERMATI (ignora i RIFIUTATI, pesa a meta i RIDIMENSIONATI). Riporta SEMPRE anche scoreMedianaGrezza (somma delle mediane, prima di ogni correzione) e rettifica (differenza): il numero non deve poter essere gonfiato in silenzio (verifica 2026-09-06). Riporta i findings confermati ordinati per gravita.\n${GDPR}\n\n` +
    `GIUDICI:\n${JSON.stringify(acc.judgments)}\n\nVERIFICA:\n${JSON.stringify(acc.verify)}`,
    { label: `rettifica:${c.slug.split('-')[0]}`, phase: 'Sintesi', schema: RECTIFY_SCHEMA, effort: 'high' }
  ).then((r) => ({ slug: c.slug, fascia: c.fascia, gate: c.gate, ...r }))
)

const results = judged.filter(Boolean)
log('Casi valutati: ' + results.length + '/' + CASES.length)

phase('Sintesi')
const WRITE_SCHEMA = {
  type: 'object',
  required: ['scoresPath', 'findingsPath'],
  properties: {
    scoresPath: { type: 'string' },
    findingsPath: { type: 'string' },
  },
}
const written = await agent(
  `Scrivi i risultati del panel RC su disco (SOLO questi due file, niente altro):\n` +
  `1. "${REPO}/benchmark/scores/rc-panel-scores.json" (SOVRASCRIVI) con: { "generatedAt": "<ora ISO corrente, usa il comando date>", "rubricVersion": "${RUBRIC_VERSION}", "scores": { "<slug>": <score> per ognuno dei ${results.length} casi }, "categorie": { "<slug>": {...} }, "antiCopiaLeaks": { "<slug>": N } }.\n` +
  `2. "${REPO}/benchmark/scores/rc-panel-findings-<YYYY-MM-DD-HHmm>.md" con, per caso: score FINALE, mediana grezza e rettifica (sempre entrambe, separate), punteggi per categoria, motivazione, findings confermati per gravita; in testa una tabella Caso | Mediana grezza | Rettifica | Score | Gate.\n` +
  `${GDPR}\n\nRISULTATI:\n` + JSON.stringify(results),
  { label: 'scrivi:scores', phase: 'Sintesi', schema: WRITE_SCHEMA, effort: 'low' }
)

return {
  rubricVersion: RUBRIC_VERSION,
  scores: Object.fromEntries(results.map((r) => [r.slug, r.score])),
  medianeGrezze: Object.fromEntries(results.map((r) => [r.slug, r.scoreMedianaGrezza])),
  rettifiche: Object.fromEntries(results.map((r) => [r.slug, r.rettifica])),
  gates: Object.fromEntries(results.map((r) => [r.slug, r.score >= r.gate ? 'PASS' : 'FAIL'])),
  antiCopia: Object.fromEntries(results.map((r) => [r.slug, r.antiCopiaLeaks])),
  files: written,
}
