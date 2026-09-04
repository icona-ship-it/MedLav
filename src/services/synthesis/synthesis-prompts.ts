import type { CaseType, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import { calculationsToITTITPSegments, formatITTITPTable } from '../calculations/medico-legal-calc';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { DocumentSummary } from './document-summarizer';
import { formatDate, formatEventDateByPrecision } from '@/lib/format';
import { getSourceReliabilityScore, getReliabilityLabel } from '../consolidation/source-reliability';

const CASE_TYPE_LABELS: Record<CaseType, string> = {
  ortopedica: 'Malasanità Ortopedica',
  oncologica: 'Ritardo Diagnostico Oncologico',
  ostetrica: 'Errore Ostetrico',
  anestesiologica: 'Errore Anestesiologico',
  infezione_nosocomiale: 'Infezione Nosocomiale',
  errore_diagnostico: 'Errore Diagnostico',
  rc_auto: 'RC Auto — Lesioni da Sinistro Stradale',
  generica: 'Responsabilità Professionale Generica',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'A - CARTELLA CLINICA',
  referto_controllo: 'B - REFERTI CONTROLLI MEDICI',
  esame_strumentale: 'C - REFERTI RADIOLOGICI ED ESAMI STRUMENTALI',
  esame_ematochimico: 'D - ESAMI EMATOCHIMICI',
  altro: 'ALTRO',
};

// Etichette per l'INTESTAZIONE del blocco doc-sanitaria: singolari e in
// sentence-case, come nei gold (Antoniazzi/Motta) — non le categorie plurali
// maiuscole di SOURCE_TYPE_LABELS, adatte all'indice cronologico CTU ma non a un
// titolo-documento ("Referto radiologico, Ospedale X, in data ...").
const DOC_BLOCK_TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'Cartella clinica',
  referto_controllo: 'Referto di controllo medico',
  esame_strumentale: 'Referto di esame strumentale',
  esame_ematochimico: 'Referto di esami ematochimici',
  altro: 'Documento sanitario',
};

// Etichette-blocco dal TIPO DOCUMENTO CLASSIFICATO (documents.document_type):
// più affidabile del sourceType del singolo evento estratto (feedback beta
// 2026-07-20: uno storico appuntamenti era intestato "Referto di controllo
// medico" perché i suoi eventi-appuntamento avevano quel sourceType).
const DOCUMENT_TYPE_BLOCK_LABELS: Record<string, string> = {
  cartella_clinica: 'Cartella clinica',
  referto_specialistico: 'Referto specialistico',
  esame_strumentale: 'Referto di esame strumentale',
  esame_laboratorio: 'Referto di esami di laboratorio',
  lettera_dimissione: 'Lettera di dimissione',
  certificato: 'Certificato medico',
  perizia_precedente: 'Perizia precedente',
  perizia_ctp: 'Perizia di parte',
  perizia_ctu: "Perizia d'ufficio",
  spese_mediche: 'Documento di spesa',
  memoria_difensiva: 'Memoria difensiva',
};

/** Metadati minimi per-documento per l'intestazione-blocco della doc-sanitaria. */
export interface DocBlockMeta {
  documentId: string;
  documentType?: string | null;
}

const CHRONOLOGY_SOURCES_GUIDE = `Le categorie delle fonti sono:
**(A) CARTELLA CLINICA** — diagnosi, parametri vitali, esami, anamnesi, terapie, descrizioni operatorie, diari clinici, lettere di dimissione
**(B) REFERTI CONTROLLI MEDICI** — visite specialistiche, follow-up, certificati
**(C) REFERTI RADIOLOGICI ED ESAMI STRUMENTALI** — RX, TAC, RM, ECG, ecografie
**(D) ESAMI EMATOCHIMICI** — emocromo, biochimica, coagulazione, markers`;

const ABSOLUTE_RULES = `## REGOLE ASSOLUTE

### Stile medico-legale: completezza dei FATTI, concisione della PROSA
- Scrivi nello stile delle perizie reali depositate in tribunale: prosa formale ma DENSA, NO perifrasi, NO frasi di circostanza, NO ripetizioni cosmetiche.
- La completezza richiesta riguarda i FATTI documentali (date, diagnosi, esami, terapie, autori, strutture), NON la lunghezza della prosa che li veicola.
- Un report di 4.000 parole con tutti i fatti pertinenti è SUPERIORE a un report di 8.000 parole con gli stessi fatti diluiti in formulazioni ridondanti — anche perché il perito che lo riceve deve poterlo leggere e correggere in tempi ragionevoli.
- È PREFERIBILE un report PIÙ BREVE ma ACCURATO a un report lungo con informazioni inventate, ridondanti o pleonastiche.
- Ogni paragrafo deve introdurre informazione NUOVA. Se stai per ripetere un fatto già esposto in una sezione precedente, riferisciti senza riprodurlo.

### Completezza dei fatti (NON NEGOZIABILE)
- NON omettere NESSUN evento dalla documentazione sanitaria
- Riportare i dati FEDELMENTE come dal documento (date, diagnosi, parametri, dosaggi, autori, strutture). NON parafrasare ciò che è citato fra virgolette.
- NON inventare dati non presenti negli eventi
- NON inventare MAI date. Se un evento non ha data, scrivi "data non documentata" o "in data non precisata". NON usare date fittizie come 01/01/1900 o simili
- Quando una data è segnata come "sconosciuta" o vuota, indicalo esplicitamente nel testo: "in data non risultante dalla documentazione in atti"
- Quando un evento ha data "Data non documentata", usa la formula "in data non risultante dalla documentazione in atti" o "in data imprecisata". NON scrivere MAI la stringa letterale "Data non documentata" nel report
- Linguaggio medico-legale formale
- Scrivi in italiano
- Usa intestazioni markdown (## per parti, ### per sotto-sezioni)
- La sezione DATI DELLA DOCUMENTAZIONE SANITARIA deve essere COMPLETA — ogni evento fornito deve comparire
- ABBREVIAZIONI MEDICHE: alla PRIMA occorrenza di ogni abbreviazione nel report, espandila con il significato tra parentesi. Esempi: "ITT (Invalidità Temporanea Totale)", "ITP (Invalidità Temporanea Parziale)", "PA (pressione arteriosa)", "FC (frequenza cardiaca)", "SpO2 (saturazione periferica di ossigeno)", "EV (endovena)", "RM (risonanza magnetica)". Le occorrenze successive possono usare solo l'abbreviazione
- DISCREPANZE TRA FONTI: quando un evento ha una nota di discrepanza (⚠), RIPORTALA nel report con ENTRAMBE le versioni. Il perito deve poter vedere le informazioni contrastanti per decidere autonomamente
- Scrivi SEMPRE in prosa discorsiva, MAI elenchi puntati per la narrazione clinica (le tabelle markdown per dati strutturati sono l'unica eccezione e vanno usate dove indicato)
- Quando citi linee guida cliniche, indica SEMPRE fonte e anno nel formato [Fonte, Anno]
- Quando due fonti discordano, privilegia la fonte con affidabilità maggiore (punteggio più alto)
- Cita i documenti per tipo, autore e data. NON usare riferimenti numerati agli eventi come [documento, data]

## EVENTI A BASSA AFFIDABILITÀ OCR
- Gli eventi marcati con "⚠ BASSA AFFIDABILITÀ OCR" hanno un riconoscimento testuale incerto. Trattali come dati da verificare: usa formulazioni cautelative come "dalla documentazione — il cui testo risulta parzialmente leggibile — sembrerebbe emergere..." o "dato soggetto a verifica per qualità del documento originale"
- Gli eventi marcati con "[Affidabilità OCR media]" vanno riportati ma con indicazione che il dato potrebbe necessitare di conferma sul documento originale
- NON trattare mai dati a bassa affidabilità come fatti certi nel report

## DIVIETO ASSOLUTO DI INVENZIONE (ANTI-HALLUCINATION)
- Basa il report ESCLUSIVAMENTE sugli eventi forniti nella sezione "TUTTI GLI EVENTI CLINICI IN ORDINE CRONOLOGICO". NON aggiungere fatti, diagnosi, nomi di medici, strutture o date che non compaiono negli eventi.
- NON inventare referenze bibliografiche o citazioni di studi scientifici. Cita SOLO linee guida effettivamente fornite nella sezione RAG o framework valutativi indicati nelle istruzioni di sistema.
- NON inventare nomi di pazienti, medici o strutture. Usa SOLO quelli presenti negli eventi. Se mancano, usa "[struttura non indicata]", "[medico non indicato]".
- NON aggiungere dettagli clinici dalla tua conoscenza medica. Se la documentazione non riporta un dato (es. dosaggio farmaco, parametro vitale), NON inventarlo.
- Se un evento ha tipo "spesa_medica", riporta SOLO importo, prestazione e struttura come indicati nell'evento. NON inventare tariffari o confronti non documentati.

## OGGETTIVITÀ ASSOLUTA (REGOLA FONDAMENTALE)
- Il report è un DOCUMENTO DI LAVORO per il medico legale. Il TUO compito è organizzare e presentare i FATTI. Il medico legale formulerà le PROPRIE opinioni e conclusioni
- OGNI affermazione del report deve essere OGGETTIVAMENTE VERIFICABILE dalla documentazione in atti
- NON esprimere MAI: opinioni, deduzioni, supposizioni, giudizi di merito, conclusioni su responsabilità o colpa
- NON usare MAI espressioni soggettive come: "si ritiene", "appare evidente", "è verosimile", "a parere dello scrivente", "risulta probabile", "è ragionevole concludere"
- Presentare i profili critici come FATTI DOCUMENTATI con evidenza a supporto e contraria, SENZA esprimere un giudizio
- Il report è materiale legale: ogni parola deve descrivere un FATTO verificabile, non un'opinione

## FORMATO IMMAGINI NEL REPORT
- Includi immagini SOLO se sono elencate nella sezione "IMMAGINI DIAGNOSTICHE DISPONIBILI" dei dati forniti. Se nessuna immagine è elencata, NON generare MAI riferimenti ![...](ocr-image:...). Descrivi i referti solo a parole.
- NON INVENTARE MAI riferimenti a immagini. Se un esame RX/TC/RM è menzionato ma nessuna immagine è disponibile, riporta solo il testo del referto senza inserire figure.
- Quando immagini SONO disponibili: inseriscile INLINE nel punto cronologico appropriato usando ESATTAMENTE il percorso fornito nella lista immagini.
- Sintassi: ![Fig. N — Descrizione formale](ocr-image:percorso-esatto-dalla-lista)

## FORMATO DATI TABULARI
- Quando riporti DATI TABULARI (esami di laboratorio, parametri vitali, spese mediche, scale di valutazione), usa SEMPRE il formato tabella markdown pipe:
  | Analita | Valore | Riferimento |
  |---------|--------|-------------|
  | Emoglobina | 9.7 g/dL | 13.0-17.0 |
  NON descrivere i valori uno per uno come testo discorsivo. La tabella è più chiara e leggibile.
- Per gli esami ematochimici: includi TUTTI i valori riportati nel documento originale. Crea una tabella SEPARATA per ogni data/prelievo. NON omettere valori nella norma — il medico legale necessita del quadro completo.
- Per le spese mediche: riporta TUTTE le voci in tabella con Data, Descrizione e Importo.

## TRASCRIZIONE FEDELE DAL TESTO OCR (quando fornito)
- Se il TESTO OCR DEI DOCUMENTI ORIGINALI è fornito, USALO come fonte primaria per la trascrizione
- Il testo tra virgolette ("...") DEVE corrispondere al testo OCR originale — NON parafrasare, NON riorganizzare il testo citato
- Testo illeggibile nell'OCR → riportare "[non leggibile]"
- Tabelle di esami di laboratorio: riportare valori ESATTI dal testo OCR, con la stessa formattazione
- Dato presente negli eventi ma NON nel testo OCR → segnalare [dato non verificabile nel testo OCR]
- Gli eventi servono come INDICE e STRUTTURA cronologica; il CONTENUTO dettagliato viene dal testo OCR
- Per ogni documento OCR, riprodurre il contenuto nella sezione appropriata in base al tipo documento`;

// ── Formatting helpers ──

export function formatEventsForPrompt(events: ConsolidatedEvent[]): string {
  return events.map((e) => {
    // Data PRECISION-AWARE: una menzione "solo anno" non diventa "01.01.YYYY" (fix
    // Bigon). Gestisce anche la sentinella 1900-01-01 → "s.d." (no sentinel_date_leak).
    const date = formatEventDateByPrecision(e.eventDate, e.datePrecision);
    const precision = e.datePrecision !== 'giorno' ? ` [data ${e.datePrecision}]` : '';
    // Ambito temporale (0034): il LLM deve sapere che un fatto è solo RIFERITO
    // (anamnesi) o solo PREVISTO — altrimenti l'epicrisi narra come avvenuto
    // un esame programmato che i calcoli escludono (giro avversariale 2026-09-04).
    const scopeTag = e.temporalScope === 'retrospettivo'
      ? ' [RIFERITO IN ANAMNESI: non è un atto di questo documento]'
      : e.temporalScope === 'programmato'
        ? ' [PROGRAMMATO: previsto, NON documentato come eseguito]'
        : '';
    const sourceLabel = SOURCE_TYPE_LABELS[e.sourceType] ?? e.sourceType;
    const reliabilityScore = getSourceReliabilityScore(e.sourceType);
    const reliabilityLabel = getReliabilityLabel(reliabilityScore);
    const diagnosis = e.diagnosis ? `\n   Diagnosi: ${e.diagnosis}` : '';
    const doctor = e.doctor ? `\n   Medico: ${e.doctor}` : '';
    const facility = e.facility ? `\n   Struttura: ${e.facility}` : '';
    const confidenceQualifier = formatConfidenceQualifier(e.confidence);
    const discrepancy = e.discrepancyNote && e.discrepancyNote.includes('⚠')
      ? `\n   ${e.discrepancyNote}`
      : '';
    const verbatim = e.sourceText && e.sourceText.trim().length > 0
      ? `\n   CITAZIONE TESTUALE (riproduci virgolettata, NON parafrasare): "${e.sourceText.trim()}"`
      : '';
    return `${e.orderNumber}. ${date}${precision}${scopeTag} | FONTE: ${sourceLabel} [${reliabilityLabel} ${reliabilityScore}/100] | TIPO: ${e.eventType.toUpperCase()}${confidenceQualifier}
   TITOLO: ${e.title}
   DESCRIZIONE: ${e.description}${diagnosis}${doctor}${facility}${verbatim}${discrepancy}`;
  }).join('\n\n');
}

/**
 * Formatta gli eventi RAGGRUPPATI PER DOCUMENTO fisico (documentId): un ATTO = un blocco,
 * come nel gold Lavini — invece di un blocco per evento, che frammenta lo stesso documento
 * (es. una lettera di dimissione) in decine di voci quasi-duplicate. Usato dalla
 * "Documentazione Medica Prodotta" della perizia RC (driver del gonfiore 3,7x su Bigon).
 */
export function formatEventsByDocumentForPrompt(
  events: ConsolidatedEvent[],
  docsMeta?: ReadonlyArray<DocBlockMeta>,
): string {
  const byDoc = new Map<string, ConsolidatedEvent[]>();
  for (const e of events) {
    const arr = byDoc.get(e.documentId);
    if (arr) arr.push(e);
    else byDoc.set(e.documentId, [e]);
  }
  const metaByDoc = new Map((docsMeta ?? []).map((d) => [d.documentId, d.documentType ?? null]));
  // Data e struttura del blocco dai soli eventi 'corrente' (0034): l'anamnesi
  // di un referto del 22.05 non lo data al 27.02 né lo attribuisce al centro
  // esterno citato. Fallback: tutti (righe legacy, documenti di sole menzioni).
  const datingOf = (evs: ConsolidatedEvent[]): ConsolidatedEvent[] => {
    const current = evs.filter((e) => e.temporalScope !== 'retrospettivo' && e.temporalScope !== 'programmato');
    return current.length > 0 ? current : evs;
  };
  const earliest = (evs: ConsolidatedEvent[]): string =>
    datingOf(evs).reduce((min, e) => (e.eventDate && e.eventDate < min ? e.eventDate : min), '9999-12-31');
  const groups = Array.from(byDoc.values()).sort((a, b) => earliest(a).localeCompare(earliest(b)));

  return groups.map((allEvs, i) => {
    const evs = datingOf(allEvs);
    const rep = evs.find((e) => e.facility) ?? evs[0];
    // DATA DEL BLOCCO dai fatti, mai inventata (feedback beta 2026-07-20): una
    // data unica se il documento ne ha una sola O se una data DOMINA nettamente
    // (≥60% degli eventi datati — es. verbale di PS del 18.04 il cui testo
    // anamnestico cita un intervento preesistente del 03.03: la data del
    // documento è il 18.04, non un falso intervallo che ingloba la
    // preesistenza); date sparse senza dominante (storici appuntamenti,
    // cartelle di ricovero) → intervallo "dal X al Y"; nessuna data valida →
    // la data del rappresentativo precision-aware ('2002', 's.d.', ...).
    const datedIso = evs
      .filter((e) => e.datePrecision == null || e.datePrecision === 'giorno')
      .map((e) => e.eventDate)
      .filter((d): d is string => !!d && d !== '1900-01-01' && /^\d{4}-\d{2}-\d{2}$/.test(d));
    const dayIso = Array.from(new Set(datedIso)).sort();
    const dateCounts = new Map<string, number>();
    for (const d of datedIso) dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
    const dominant = Array.from(dateCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const date = dayIso.length === 1
      ? formatEventDateByPrecision(dayIso[0], 'giorno')
      : dayIso.length > 1 && dominant[1] / datedIso.length >= 0.6
        ? formatEventDateByPrecision(dominant[0], 'giorno')
        : dayIso.length > 1
          ? `dal ${formatEventDateByPrecision(dayIso[0], 'giorno')} al ${formatEventDateByPrecision(dayIso[dayIso.length - 1], 'giorno')}`
          : formatEventDateByPrecision(rep.eventDate, rep.datePrecision);
    // Il LABEL della doc-sanitaria NON deve portare il codice classificatore (A-/B-/C-/D-):
    // l'LLM lo copiava nel titolo grassetto del blocco ("**B - Referto...:**" su Bigon).
    // Qui resta solo il nome leggibile. Le categorie (A/B/C/D) per la citazione CTU/CTP
    // restano in formatEventsForPrompt / CHRONOLOGY_SOURCES_GUIDE, non toccate.
    // PRIORITÀ ETICHETTA: (1) tipo documento CLASSIFICATO quando informativo
    // (≠ altro); (2) sourceType degli eventi quando CONCORDI; (3) neutro
    // "Documento sanitario" — su un atto legale un'etichetta neutra-ma-vera
    // batte una specifica-ma-sbagliata.
    const docType = metaByDoc.get(rep.documentId);
    const classifiedLabel = docType && docType !== 'altro' ? DOCUMENT_TYPE_BLOCK_LABELS[docType] : undefined;
    const eventTypes = new Set(evs.map((e) => e.sourceType));
    const consensusLabel = eventTypes.size === 1 ? DOC_BLOCK_TYPE_LABELS[rep.sourceType] : undefined;
    const sourceLabel = classifiedLabel ?? consensusLabel ?? 'Documento sanitario';
    // Intestazione DETERMINISTICA pronta (formato gold Antoniazzi): "**Tipo, struttura,
    // in data DATA:**". Fornita all'LLM da copiare IDENTICA come prima riga del blocco,
    // così smette di comporre titoli-evento data-prima. Backstop deterministico in
    // section-generator (normalizeDocSanitariaBlockHeaders) se non obbedisce.
    const canonicalHeader = buildDocSanitariaBlockHeader(sourceLabel, rep.facility, date);
    // CONTENUTO: TUTTI gli eventi del documento (anche riferiti/previsti — mai
    // perdere un fatto), con l'ambito dichiarato così il LLM non li narra come
    // atti del documento.
    const content = allEvs.map((e) => {
      // Cap sulle description LUNGHE (fonte delle "descrizioni lunghissime"): il
      // sourceText (ancora verbatim ≤200 char) è preferito; la description LLM,
      // quando usata, è capata a ~300 char su confine di parola.
      const src = e.sourceText?.trim();
      const txt = src || capText(e.description?.trim() || e.title || '', 300);
      const diag = e.diagnosis ? `\n     [Diagnosi: ${e.diagnosis}]` : '';
      const scope = e.temporalScope === 'retrospettivo' ? ' [riferito in anamnesi]'
        : e.temporalScope === 'programmato' ? ' [programmato, non eseguito nel documento]'
          : '';
      return `   • ${txt}${scope}${diag}`;
    }).join('\n');
    return `DOCUMENTO ${i + 1}\nINTESTAZIONE-BLOCCO (copiala IDENTICA come PRIMA RIGA del blocco, in grassetto, senza anteporre la data né aggiungere un titolo dell'evento):\n${canonicalHeader}\nCONTENUTO-FONTE (cita da qui, verbatim tra «...»; raccordo minimo, MAI parafrasi lunga):\n${content}`;
  }).join('\n\n');
}

/** Intestazione canonica del blocco doc-sanitaria (formato gold Antoniazzi).
 * `date` può essere una data singola ("16.07.2023" → "in data 16.07.2023"),
 * un intervallo già costruito ("dal X al Y") o "s.d." (senza data): negli
 * ultimi due casi il prefisso "in data" viene omesso. */
export function buildDocSanitariaBlockHeader(label: string, facility: string | null, date: string): string {
  const fac = facility ? `, ${facility}` : '';
  const dateClause = date === 's.d.' || date.startsWith('dal ') ? date : `in data ${date}`;
  return `**${label}${fac}, ${dateClause}:**`;
}

/** Taglia un testo a maxLen su confine di parola, aggiungendo "…" se tagliato. */
function capText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

/**
 * Format a confidence qualifier for events with low OCR confidence.
 * Signals to the LLM that low-confidence events should be treated cautiously.
 */
function formatConfidenceQualifier(confidence: number): string {
  if (confidence < 50) {
    return ' | ⚠ BASSA AFFIDABILITÀ OCR — verificare fonte';
  }
  if (confidence < 70) {
    return ' | [Affidabilità OCR media]';
  }
  return '';
}

export function formatAnomaliesForPrompt(anomalies: DetectedAnomaly[]): string {
  if (anomalies.length === 0) return 'Nessuna anomalia rilevata.';
  return anomalies.map((a) => {
    const involvedDates = a.involvedEvents.map((e) => `${formatDate(e.date)} - ${e.title}`).join(', ');
    // Include perito's confirmation note when present — promised by UI label "sarà inclusa nel report".
    // The note carries clinical/legal context the perito wants integrated (e.g. "il trattamento risulta
    // documentato in relazione successiva", "la complicanza era preesistente"). The LLM must respect it.
    const peritoLine = a.resolutionNote && a.resolutionNote.trim().length > 0
      ? `\n  NOTA DEL PERITO (vincolante — integra nel testo del report): "${a.resolutionNote.trim()}"`
      : '';
    return `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description} (Eventi: ${involvedDates})${peritoLine}\n  ANALISI DOCUMENTALE: indica la conseguenza clinica DOCUMENTATA e la quantificazione del danno basata su criteri tabellari e evidenze in atti.`;
  }).join('\n');
}

export function formatMissingDocsForPrompt(missingDocuments: MissingDocument[]): string {
  if (missingDocuments.length === 0) return 'Nessuna documentazione mancante rilevata.';
  return missingDocuments.map((d) => `- ${d.documentName}: ${d.reason}`).join('\n');
}

export function formatCalculationsForPrompt(calculations?: MedicoLegalCalculation[]): string {
  if (!calculations || calculations.length === 0) return '';
  const lines = calculations.map((c) => {
    const dateRange = c.startDate && c.endDate ? ` (${formatDate(c.startDate)} — ${formatDate(c.endDate)})` : '';
    const tableRef = c.tableReference ? `\n  Rif. tabellare: ${c.tableReference}` : '';
    return `- ${c.label}: ${c.value}${dateRange}\n  ${c.notes}${tableRef}`;
  });
  // A2 (Lavini): render a ready-made graduated ITT/ITP table so the report
  // contains a proper table (the perito asked for a table, not only prose).
  const ittItpSegments = calculationsToITTITPSegments(calculations);
  const ittItpTable = formatITTITPTable(ittItpSegments);
  const ittItpBlock = ittItpTable
    ? `\n\n### TABELLA INVALIDITÀ TEMPORANEA (ITT/ITP graduata)
Riproduci questa tabella TESTUALMENTE (in formato Markdown) nella sezione che tratta il danno biologico temporaneo (Considerazioni Medico-Legali / Epicrisi). Sono valori PROPOSTI: il perito li verifica e corregge.

${ittItpTable}`
    : '';

  return `\n## PERIODI MEDICO-LEGALI CALCOLATI (proposti, il perito deve verificare)

${lines.join('\n')}${ittItpBlock}

### ISTRUZIONI PER INTEGRAZIONE NEL REPORT
Nella sezione "Valutazione del danno biologico" e nelle "Conclusioni", INTEGRA questi dati:
- INCLUDI la tabella ITT/ITP graduata qui sopra (se presente) in formato Markdown, e accompagnala con una sintesi narrativa
- Riporta i periodi di ITT e ITP con date precise e durata in giorni nel testo delle conclusioni
- Indica i criteri tabellari utilizzati (es. Tabella Unica Nazionale DPR 12/2025, Tabelle Milano 2024)
- Nella conclusione, sintetizza: "I periodi di invalidità temporanea totale ammontano a X giorni (dal DD.MM.YYYY al DD.MM.YYYY), mentre l'invalidità temporanea parziale è quantificata in Y giorni..."
- NON limitarti a elencare i calcoli — integra i dati come parte dell'argomentazione medico-legale
- Se i calcoli includono riferimenti tabellari, citali esplicitamente nella valutazione del danno`;
}

export function formatPeriziaMetadataForPrompt(periziaMetadata?: PeriziaMetadata): string {
  if (!periziaMetadata) return '';

  const lines: string[] = [];

  // Dati identificativi del periziando inseriti dal perito — AUTORITATIVI per
  // l'intestazione. Senza questi il generatore dell'header estraeva il nome solo
  // dai documenti, ignorando quello digitato nel form (dato che "spariva").
  if (periziaMetadata.patientFullName) lines.push(`PAZIENTE (nome e cognome): ${periziaMetadata.patientFullName}`);
  if (periziaMetadata.patientDateOfBirth) lines.push(`PAZIENTE — data di nascita: ${periziaMetadata.patientDateOfBirth}`);
  if (periziaMetadata.patientAddress) lines.push(`PAZIENTE — residenza: ${periziaMetadata.patientAddress}`);
  if (periziaMetadata.patientFiscalCode) lines.push(`PAZIENTE — codice fiscale: ${periziaMetadata.patientFiscalCode}`);
  if (periziaMetadata.patientPhone) lines.push(`PAZIENTE — telefono: ${periziaMetadata.patientPhone}`);

  if (periziaMetadata.ctuName) lines.push(`CTU: ${periziaMetadata.ctuName}`);
  if (periziaMetadata.ctuTitle) lines.push(`QUALIFICA CTU: ${periziaMetadata.ctuTitle}`);
  if (periziaMetadata.parteRicorrente) lines.push(`PARTE RICORRENTE: ${periziaMetadata.parteRicorrente}`);
  if (periziaMetadata.parteResistente) lines.push(`PARTE RESISTENTE: ${periziaMetadata.parteResistente}`);
  if (periziaMetadata.dataIncarico) lines.push(`DATA INCARICO: ${periziaMetadata.dataIncarico}`);
  if (periziaMetadata.dataOperazioni) lines.push(`DATA OPERAZIONI: ${periziaMetadata.dataOperazioni}`);
  if (periziaMetadata.dataDeposito) lines.push(`TERMINE DEPOSITO: ${periziaMetadata.dataDeposito}`);
  if (periziaMetadata.fondoSpese) lines.push(`FONDO SPESE: ${periziaMetadata.fondoSpese}`);

  if (periziaMetadata.esameObiettivo) {
    lines.push('');
    lines.push('ESAME OBIETTIVO:');
    lines.push(periziaMetadata.esameObiettivo);
  }

  if (periziaMetadata.speseMediche) {
    lines.push('');
    lines.push('SPESE MEDICHE:');
    lines.push(periziaMetadata.speseMediche);
  }

  if (lines.length === 0) return '';

  return `\n## DATI PERIZIA FORMALE\n\n${lines.join('\n')}\n`;
}

export function formatImageAnalysisForPrompt(
  imageAnalysis?: Array<{ pageNumber: number; imageType: string; description: string; confidence: number; storagePath?: string }>,
): string {
  if (!imageAnalysis || imageAnalysis.length === 0) return '';
  const filtered = filterMedicalImages(imageAnalysis);
  if (filtered.length === 0) return '';
  const lines = filtered.map((img, index) => {
    const figNum = index + 1;
    const pathRef = img.storagePath
      ? `\n  Sintassi per includere: ![Fig. ${figNum} — ${img.imageType}](ocr-image:${img.storagePath})`
      : '';
    return `- Fig. ${figNum}: Pagina ${img.pageNumber} (${img.imageType}): ${img.description}${pathRef}`;
  });
  return `\n## IMMAGINI DIAGNOSTICHE DISPONIBILI

Le seguenti immagini sono state estratte dalla documentazione e analizzate automaticamente.
Sintassi per includere: ![Fig. N — Didascalia](ocr-image:percorso)

REGOLE PER LE IMMAGINI:
- Includi le immagini ESCLUSIVAMENTE INLINE nella documentazione sanitaria, subito dopo la citazione del documento/referto pertinente. Le foto cliniche vanno in ESAME OBIETTIVO.
- NON creare una sezione "ALLEGATI ICONOGRAFICI" separata.
- Didascalia formale: "Fig. N — Tipo esame, distretto anatomico, data"
- Tra immagini consecutive, inserire un breve commento descrittivo che le colleghi al contesto clinico.

${lines.join('\n')}

`;
}

// ── Image filtering ──

const ADMIN_IMAGE_KEYWORDS = [
  'logo', 'intestazione', 'timbro', 'firma', 'header', 'footer',
  'watermark', 'stemma', 'sigillo', 'letterhead', 'bollo',
];

/**
 * Filter out non-medical images (logos, stamps, headers) keeping only
 * diagnostic/clinical images (RX, TAC, RM, ecografia, endoscopia, foto cliniche).
 */
export function filterMedicalImages<T extends { imageType: string; description: string }>(
  images: T[],
): T[] {
  return images.filter((img) => {
    const typeLower = img.imageType.toLowerCase();
    // Exclude explicitly non-medical types
    if (typeLower === 'altro') return false;
    // Exclude images whose description contains admin keywords
    const descLower = img.description.toLowerCase();
    if (ADMIN_IMAGE_KEYWORDS.some((kw) => descLower.includes(kw))) return false;
    return true;
  });
}

// ── OCR text formatting for faithful transcription ──

type DocumentCategory = 'sanitario' | 'non_sanitario' | 'spese' | 'perizie' | 'memorie';

function categorizeDocumentType(docType: string): DocumentCategory {
  switch (docType) {
    case 'memoria_difensiva': return 'memorie';
    case 'spese_mediche': return 'spese';
    case 'perizia_precedente':
    case 'perizia_ctp':
    case 'perizia_ctu': return 'perizie';
    case 'certificato': return 'non_sanitario';
    default: return 'sanitario';
  }
}

function formatSingleDocOcr(doc: DocumentOcrContext): string {
  let text = `#### ${doc.fileName} (${doc.documentType})\n`;
  for (const page of doc.pages) {
    text += `--- Pagina ${page.pageNumber} ---\n${page.ocrText}\n\n`;
  }
  return text + '\n';
}

/**
 * Maximum OCR chars to include in synthesis prompt.
 * ~200K tokens budget for OCR, leaving ~60K for system prompt + events + output.
 * Ratio ~0.55 token/char for Italian medical text → 200K / 0.55 ≈ 360K chars.
 */
const MAX_OCR_CHARS = 360_000;

/**
 * Truncate OCR documents proportionally to fit within a character budget.
 * Each document gets a budget proportional to its original size.
 * Pages are truncated from the end; if a single page exceeds budget, its text is cut.
 */
export function truncateOcrProportionally(
  docs: DocumentOcrContext[],
  maxChars: number,
): DocumentOcrContext[] {
  const totalChars = docs.reduce((sum, d) => sum + d.totalChars, 0);
  if (totalChars <= maxChars) return docs;

  const ratio = maxChars / totalChars;

  return docs.map((doc) => {
    const docBudget = Math.floor(doc.totalChars * ratio);
    let remaining = docBudget;
    const truncatedPages: Array<{ pageNumber: number; ocrText: string }> = [];

    for (const page of doc.pages) {
      if (remaining <= 0) break;

      if (page.ocrText.length <= remaining) {
        truncatedPages.push(page);
        remaining -= page.ocrText.length;
      } else {
        // Truncate this page's text to fit remaining budget
        const truncatedText = page.ocrText.slice(0, remaining)
          + `\n\n[... troncato, ${page.ocrText.length} chars originali ...]`;
        truncatedPages.push({ pageNumber: page.pageNumber, ocrText: truncatedText });
        remaining = 0;
      }
    }

    const omittedPages = doc.pages.length - truncatedPages.length;
    if (omittedPages > 0) {
      const lastPage = doc.pages[doc.pages.length - 1];
      truncatedPages.push({
        pageNumber: lastPage.pageNumber,
        ocrText: `[... ${omittedPages} pagine omesse per limiti di contesto, ${doc.totalChars - docBudget} chars non inclusi ...]`,
      });
    }

    const newTotalChars = truncatedPages.reduce((sum, p) => sum + p.ocrText.length, 0);
    return {
      ...doc,
      pages: truncatedPages,
      totalChars: newTotalChars,
    };
  });
}

/**
 * Format OCR text from all documents, organized by category for the LLM.
 * Returns empty string if no OCR text is available.
 * Applies proportional truncation if total OCR exceeds MAX_OCR_CHARS.
 */
export function formatDocumentsOcrForPrompt(docs?: DocumentOcrContext[]): string {
  if (!docs || docs.length === 0) return '';

  const totalChars = docs.reduce((sum, d) => sum + d.totalChars, 0);
  const effectiveDocs = totalChars > MAX_OCR_CHARS
    ? truncateOcrProportionally(docs, MAX_OCR_CHARS)
    : docs;
  const wasTruncated = totalChars > MAX_OCR_CHARS;

  const categorized = {
    memorie: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'memorie'),
    non_sanitario: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'non_sanitario'),
    sanitario: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'sanitario'),
    spese: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'spese'),
    perizie: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'perizie'),
  };

  const effectiveChars = effectiveDocs.reduce((sum, d) => sum + d.totalChars, 0);
  let result = `\n## TESTO OCR DEI DOCUMENTI ORIGINALI (${docs.length} documenti, ${totalChars} caratteri)\n\n`;
  if (wasTruncated) {
    result += `**NOTA: Il testo OCR è stato troncato proporzionalmente da ${totalChars} a ~${effectiveChars} caratteri per rispettare i limiti di contesto. Ogni documento mantiene la proporzione originale.**\n\n`;
  }
  result += 'Di seguito il testo OCR dei documenti originali. Usa questo testo per TRASCRIVERE FEDELMENTE il contenuto nel report, nelle sezioni appropriate.\n\n';

  if (categorized.memorie.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "PREMESSE" (memorie, ricorsi)\n\n';
    for (const doc of categorized.memorie) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.non_sanitario.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "DATI DELLA DOCUMENTAZIONE IN ATTI" (non sanitari)\n\n';
    for (const doc of categorized.non_sanitario) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.sanitario.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "DATI DELLA DOCUMENTAZIONE SANITARIA"\n\n';
    for (const doc of categorized.sanitario) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.spese.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "SPESE MEDICHE ESIBITE"\n\n';
    for (const doc of categorized.spese) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.perizie.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "PRECEDENTI PARERI TECNICI"\n\n';
    for (const doc of categorized.perizie) {
      result += formatSingleDocOcr(doc);
    }
  }

  return result;
}

/**
 * Format per-document AI summaries for the synthesis prompt.
 * Used in map-reduce mode for large cases (>50 documents).
 * Replaces OCR text with more comprehensive coverage.
 */
export function formatDocumentSummariesForPrompt(summaries?: DocumentSummary[]): string {
  if (!summaries || summaries.length === 0) return '';

  const totalOriginalChars = summaries.reduce((sum, s) => sum + s.totalCharsOriginal, 0);

  let result = `\n## RIASSUNTI AI DEI DOCUMENTI ORIGINALI (${summaries.length} documenti, ${totalOriginalChars} caratteri originali)\n\n`;
  result += '**NOTA: I seguenti riassunti sono stati generati da AI a partire dal testo OCR completo di ciascun documento. Coprono il 100% dei documenti del caso. Usa questi riassunti come base per il report, integrandoli con gli eventi strutturati sopra.**\n\n';

  for (const summary of summaries) {
    result += `### ${summary.fileName} (${summary.documentType})\n`;
    result += `*${summary.totalCharsOriginal} caratteri OCR originali*\n\n`;
    result += `${summary.summary}\n\n`;
  }

  return result;
}

export {
  CASE_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  MAX_OCR_CHARS,
  ABSOLUTE_RULES,
  CHRONOLOGY_SOURCES_GUIDE,
};
