/**
 * Anonymization service for medico-legal reports.
 * Detects and replaces PII (names, codice fiscale, dates, addresses, phones, emails).
 * GDPR Art. 9 compliant — regex-based, no LLM needed.
 */

import type { PeriziaMetadata } from '@/types';

// --- Types ---

export type PiiCategory =
  | 'nome'
  | 'codice_fiscale'
  | 'data'
  | 'indirizzo'
  | 'telefono'
  | 'email'
  | 'struttura'
  | 'riferimento_giudiziario';

export interface PiiMatch {
  original: string;
  replacement: string;
  category: PiiCategory;
  index: number;
  length: number;
}

export interface AnonymizationResult {
  anonymizedText: string;
  replacementCount: number;
  replacements: Array<{ original: string; replacement: string; type: string }>;
}

export interface DetectionResult {
  matches: PiiMatch[];
  categories: Record<PiiCategory, number>;
}

export interface AnonymizeOptions {
  text: string;
  periziaMetadata?: PeriziaMetadata;
  enabledCategories?: Set<PiiCategory>;
}

// --- Regex Patterns ---

/**
 * Italian Codice Fiscale.
 * Format: 6 letters + 2 digits + 1 letter + 2 digits + 1 letter + 3 digits + 1 letter
 */
const CF_REGEX = /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi;

/**
 * Italian phone numbers: +39, 0XX, 3XX patterns.
 */
const PHONE_REGEX = /(?:\+39\s?)?(?:0\d{1,4}[\s.-]?\d{4,8}|3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/g;

/**
 * Email addresses.
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Professional titles followed by a capitalized name (Dott./Prof./Sig. etc.)
 * Matches: "Dott. Mario Rossi", "Prof.ssa Anna Bianchi", "Sig.ra Giovanni Verdi"
 */
const TITLE_NAME_REGEX = /(?:Dott\.?(?:ssa|\.ssa)?|Dr\.?(?:ssa|\.ssa)?|Prof\.?(?:ssa|\.ssa)?|Sig\.?(?:ra|\.ra)?|Avv\.?|Ing\.?)\s+[A-Z][a-z\u00E0\u00E8\u00E9\u00EC\u00F2\u00F9]+(?:\s+[A-Z][a-z\u00E0\u00E8\u00E9\u00EC\u00F2\u00F9]+){0,2}/g;

/**
 * Italian dates in numeric format: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
 */
const DATE_NUMERIC_REGEX = /\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}\b/g;

/**
 * ISO dates: yyyy-mm-dd (le date cliniche escono spesso in ISO; DATE_NUMERIC_REGEX
 * cattura solo dd/mm/yyyy e le lasciava trapelare nell'export "anonimizzato").
 */
const DATE_ISO_REGEX = /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g;

/**
 * Italian dates with month name: "1 gennaio 2024", "15 marzo 2023"
 */
const ITALIAN_MONTHS = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
const DATE_TEXT_REGEX = new RegExp(
  `\\b(?:0?[1-9]|[12]\\d|3[01])\\s+(?:${ITALIAN_MONTHS})\\s+(?:19|20)\\d{2}\\b`,
  'gi',
);

/**
 * Italian addresses: Via/Piazza/Corso/Viale/Largo + name + optional number.
 * Il tipo di via \u00E8 case-insensitive (nei referti "via" \u00E8 spesso minuscolo) e sono
 * ammessi i connettori minuscoli tra il tipo e il nome ("via degli Esempi 12",
 * "corso della Libert\u00E0"): fix audit 2026-08-11 (E-1, l'indirizzo del periziando
 * trapelava perch\u00E9 "via" minuscolo + "degli" non erano coperti).
 */
// `\b` iniziale (2\u00B0 giro avversariale 2026-08-11): senza, il tipo-via minuscolo
// combaciava come SOTTOSTRINGA dentro parole cliniche (soc-CORSO, per-CORSO,
// de-CORSO). Con `\b` quelle parole restano intatte (nessun confine prima di
// "corso"), quindi il tipo-via resta case-insensitive \u2014 cos\u00EC l'indirizzo del
// periziando scritto in minuscolo ("corso Italia 5") viene comunque redatto
// (leak Art.9 riaperto dalla versione solo-maiuscolo). La disambiguazione con
// "in corso di valutazione" la fa il nome MAIUSCOLO richiesto subito dopo: una
// via reale \u00E8 capitalizzata, "corso di valutazione" (minuscolo) non matcha.
const ADDRESS_REGEX = /\b(?:[Vv]ia|[Vv]iale|V\.le|[Pp]iazz(?:a|ale|etta)|P\.?zza|[Cc]orso|C\.so|[Ll]argo|[Vv]icolo|[Vv]ico|[Bb]orgo|[Ss]alita|[Tt]raversa|[Ss]trada|[Ll]ocalit\u00E0|[Ff]razione(?!\s+di\s+[Ee]iezione)|[Ll]ungotevere|[Ll]ungomare)\s+(?:(?:degli|della|dello|dei|delle|del|dell'|di|da|lo|la|le|l')\s+)*[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FC'\u2019]+(?:\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FC'\u2019]+)*(?:\s*[,]?\s*(?:n\.?\s*)?\d{1,5}(?:\s*[/][A-Za-z])?)?(?:\s*,?\s*\d{5}\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FC'\u2019-]+(?:\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FC'\u2019-]+)?)?/g;

/** Indirizzi in MAIUSCOLO (anagrafiche di intestazione): richiede il numero
 * civico per NON scambiare termini clinici tutti-maiuscoli (es. "VIA AEREA")
 * per un indirizzo. Copre "VIA ROMA 12", "CORSO ITALIA 5" (3\u00B0 giro avversariale). */
const ADDRESS_CAPS_REGEX = /\b(?:VIA|VIALE|V\.LE|PIAZZ(?:A|ALE|ETTA)|P\.?ZZA|CORSO|C\.SO|LARGO|VICOLO|VICO|BORGO|SALITA|TRAVERSA|STRADA|LOCALIT\u00C0|FRAZIONE(?!\s+DI\s+EIEZIONE)|LUNGOTEVERE|LUNGOMARE)\s+(?:(?:DEGLI|DELLA|DELLO|DEI|DELLE|DEL|DI|DA|LO|LA|LE)\s+)*[A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC'\u2019]+(?:\s+[A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC'\u2019]+)*\s*,?\s*(?:N\.?\s*)?\d{1,5}(?:\s*[/][A-Za-z])?(?:\s*,?\s*\d{5}\s+[A-Z\u00C0-\u00DC][A-Z\u00C0-\u00DC'\u2019-]+)?/g;

/**
 * Names preceded by context words (without professional titles).
 * Matches: "sig. Mario Rossi", "paziente Maria Bianchi", "figlio di Giuseppe Verdi"
 */
const CONTEXT_NAME_REGEX = /(?<![A-Za-z\u00C0-\u00FC])(?:(?:sig\.?\s|signor[ae]?\s|paziente\s|periziando\s|perizianda\s|attore\s|attrice\s|ricorrente\s|convenuto\s|assistit[oa]\s|infortunat[oa]\s|parte\s|figlio di\s|figlia di\s|nat[oa]\s))([A-Z][a-z\u00E0-\u00FA]{1,}\s+[A-Z][a-z\u00E0-\u00FA]{1,}(?:\s+[A-Z][a-z\u00E0-\u00FA]{1,})?)/g;

/**
 * Token di nome proprio: Capitalizzato ("Testina") o TUTTO MAIUSCOLO ("DEMPROVA",
 * formato tipico delle anagrafiche nei documenti clinici, che i pattern
 * Titlecase non coprivano — fix nomi solo-OCR 2026-07-20).
 */
const NAME_TOKEN = String.raw`(?:[A-ZÀ-Ü][a-zà-ü'’-]+|[A-ZÀ-Ü][A-ZÀ-Ü'’-]+)`;

/**
 * Intestazioni anagrafiche CON due punti seguite da un nome di 2-3 token,
 * anche in maiuscolo ("Paziente: DEMPROVA Testina"). Il colon è OBBLIGATORIO:
 * senza, frasi cliniche come "paziente VIGILE COLLABORANTE" verrebbero redatte.
 */
const HEADER_NAME_CAPS_REGEX = new RegExp(
  String.raw`(?:[Pp]aziente|[Aa]ssistit[oa]|[Pp]eriziand[oa]|[Nn]ominativo|[Cc]ognome(?:\s+e\s+[Nn]ome)?|[Ii]ntestatario)\s*:\s*(${NAME_TOKEN}(?:\s+${NAME_TOKEN}){1,2})`,
  'g',
);

/**
 * Nome PRIMA di "nato/a il|a" ("DEMPROVA Testina Nato/a il 15/05/1985"):
 * l'anagrafica in testa a referti e intestazioni. Richiede 2-3 token.
 */
const NAME_BEFORE_NATO_REGEX = new RegExp(
  String.raw`(${NAME_TOKEN}(?:\s+${NAME_TOKEN}){1,2})\s*,?\s+[Nn]at[oa](?:\/[oa])?\s+(?:il|a)\b`,
  'g',
);

/**
 * Hospital and healthcare facility names.
 * Matches: "Ospedale San Raffaele", "ASST Spedali Civili", "Policlinico Gemelli"
 */
// Studio/Centro/Poliambulatorio/Laboratorio/Presidio/Fondazione aggiunti il
// 2026-09-04 (la trascrizione integrale dell'OCR porta nel corpo i nomi delle
// strutture minori, prima invisibili). Solo con iniziale MAIUSCOLA seguita da
// nome proprio: "centro del ginocchio" / "lo studio della lastra" non toccati;
// "Studio RM/TC/RX ..." (sigla d'esame) è contenuto clinico, non una struttura.
// Il match copre SOLO il nome della struttura (parole Capitalizzate, con i
// connettori di/del/della/San/S./e) e si ferma alla prima parola minuscola:
// prima «\s+[A-Z][^.,;:\n]{2,40}» mangiava fino a 40 caratteri di testo clinico
// («Ospedale Civile di Cittàdemo per frattura del femore sini…» → [STRUTTURA_1]re)
// (audit 2026-09-10, invariante I5).
const ORG_WORD = String.raw`[A-ZÀ-Ü][\p{L}'’-]*`;
const HOSPITAL_REGEX = new RegExp(
  String.raw`(?:Ospedale|ASST|ASL|ATS|AOU|IRCCS|Policlinico|Clinica|Istituto|Casa di Cura|Presidio Ospedaliero|Fondazione|Studio(?![ \t]+(?:RM|RMN|RX|TC|TAC|PET|MOC|ECO|ECG|EEG|EMG|EGDS|TSA|US)\b)|Centro|Poliambulatorio|Laboratorio)[ \t]+${ORG_WORD}(?:[ \t]+(?:di|del|della|dei|degli|delle|e|San|Santa|Sant'|S\.)[ \t]+${ORG_WORD}|[ \t]+${ORG_WORD})*`,
  'gu',
);

/**
 * Court references (RG numbers).
 * Matches: "R.G. n. 12345/2024", "RG 12345/24"
 */
const RG_NUMBER_REGEX = /R\.?G\.?\s*n?\.?\s*\d{1,6}\/\d{2,4}/g;

/**
 * Patronymic patterns: "figlio di [Name]", "figlia di [Name]", "nato da [Name]".
 */
const PATRONYMIC_REGEX = /(?:figlio|figlia|nat[oa])\s+(?:di|da)\s+([A-Z][a-z\u00E0-\u00FA]+(?:\s+[A-Z][a-z\u00E0-\u00FA]+)?)/g;

// --- Consistent Replacement Tracker ---

/**
 * Maintains a consistent mapping so the same original text always maps
 * to the same placeholder (e.g., "Mario Rossi" -> "[PERSONA_1]" everywhere).
 */
class ReplacementTracker {
  private counters: Record<PiiCategory, number> = {
    nome: 0,
    codice_fiscale: 0,
    data: 0,
    indirizzo: 0,
    telefono: 0,
    email: 0,
    struttura: 0,
    riferimento_giudiziario: 0,
  };

  private mapping = new Map<string, string>();

  private readonly labels: Record<PiiCategory, string> = {
    nome: 'PERSONA',
    codice_fiscale: 'CF',
    data: 'DATA',
    indirizzo: 'INDIRIZZO',
    telefono: 'TELEFONO',
    email: 'EMAIL',
    struttura: 'STRUTTURA',
    riferimento_giudiziario: 'RIF_GIUD',
  };

  getOrCreate(original: string, category: PiiCategory): string {
    const key = original.toLowerCase();
    const existing = this.mapping.get(key);
    if (existing) return existing;

    this.counters[category] += 1;
    const label = this.labels[category];
    const placeholder = `[${label}_${this.counters[category]}]`;
    this.mapping.set(key, placeholder);
    return placeholder;
  }

  getMapping(): Map<string, string> {
    return new Map(this.mapping);
  }

  /** Placeholder fisso per un valore noto dai metadati (es. «[PAZIENTE]»), così ogni
   * altra rilevazione dello stesso nome (titolo, contesto, propagazione) usa lo
   * stesso segnaposto e non un [PERSONA_n] parallelo (I5). */
  preset(original: string, placeholder: string): void {
    this.mapping.set(original.toLowerCase(), placeholder);
  }
}

// --- Detection (no replacement) ---

/**
 * Detect all PII in text without replacing.
 * Used by the anonymization tool UI to show a preview.
 */
export function detectPii(params: {
  text: string;
  periziaMetadata?: PeriziaMetadata;
}): DetectionResult {
  const { text, periziaMetadata } = params;
  const tracker = new ReplacementTracker();
  const matches: PiiMatch[] = [];

  // 1. Names from perizia metadata
  if (periziaMetadata) {
    const nameEntries = buildNameReplacements(periziaMetadata);
    for (const { name, replacement: preset } of nameEntries) {
      if (name && name.length > 2) {
        // Placeholder coerente: chiunque rilevi lo stesso nome (titolo, contesto,
        // propagazione) riceve il segnaposto dei metadati, non un [PERSONA_n] (I5).
        for (const v of nameOrderVariants(name)) tracker.preset(v, preset);
        // Nome completo in QUALUNQUE forma (anche minuscolo e a ordine invertito) e
        // tollerante alle varianti OCR di apostrofo (’) e trattino (D'Esempi / D’ESEMPI,
        // Demprova-Esempi / DEMPROVA ESEMPI): due token adiacenti del periziando non
        // sono mai testo clinico (I5).
        const nameRegex = new RegExp(nameOrderVariants(name).map(namePatternSource).join('|'), 'giu');
        let match: RegExpExecArray | null;
        while ((match = nameRegex.exec(text)) !== null) {
          const replacement = tracker.getOrCreate(match[0], 'nome');
          matches.push({
            original: match[0],
            replacement,
            category: 'nome',
            index: match.index,
            length: match[0].length,
          });
        }
      }
    }

    // 1b. Token-expansion (GDPR best-effort): redige le occorrenze ISOLATE di
    // cognome/nome dei nomi METADATA noti (es. "Successivamente Rossi" dopo che
    // "Mario Rossi" e' gia' noto). Solo token len>=4 con word-boundary per ridurre
    // l'over-redazione di parole comuni; i nomi metadata sono autoritativi.
    for (const { name, replacement } of nameEntries) {
      for (const token of nameTokens(name).filter((t) => t.length >= 4)) {
        // Case-SENSITIVE: redige il token solo nelle forme da nome proprio
        // (Capitalizzato o MAIUSCOLO), MAI la parola minuscola — molti cognomi
        // italiani sono anche parole comuni/cliniche (Costa=costola, Verde, Bianchi):
        // redigere "costa" minuscolo corromperebbe il referto.
        // Confini di parola Unicode: il `\b` di JS è ASCII-only e dopo «ò»/«è»
        // (Nicolò, Demprovè) non vedeva un confine → token accentato mai redatto (I5).
        const cap = token.charAt(0).toUpperCase() + token.slice(1);
        const forms = cap === token.toUpperCase() ? [cap] : [cap, token.toUpperCase()];
        const tokenRegex = new RegExp(`(?<![\\p{L}])(?:${forms.map(tokenPatternSource).join('|')})(?![\\p{L}])`, 'gu');
        let tokenMatch: RegExpExecArray | null;
        while ((tokenMatch = tokenRegex.exec(text)) !== null) {
          matches.push({
            original: tokenMatch[0],
            replacement,
            category: 'nome',
            index: tokenMatch.index,
            length: tokenMatch[0].length,
          });
        }
      }
    }
  }

  // 1c. Data di nascita dei metadati in OGNI forma (15/05/85, 15.5.85, 15 mag 1985,
  // 15 mag. 85, 15-5-85): i regex generici coprono solo gli anni a 4 cifre (I5).
  if (periziaMetadata?.patientDateOfBirth) {
    const dobRegex = dateOfBirthVariantsRegex(periziaMetadata.patientDateOfBirth);
    if (dobRegex) collectRegexMatches(text, dobRegex, 'data', tracker, matches);
  }
  // 1d. Indirizzo dei metadati (via, CAP, comune) anche quando i regex generici
  // lasciano CAP e comune in chiaro accanto alla via redatta (I5).
  if (periziaMetadata?.patientAddress) {
    for (const re of addressVariantsRegexes(periziaMetadata.patientAddress)) {
      collectRegexMatches(text, re, 'indirizzo', tracker, matches);
    }
  }

  // 1e. Codice fiscale dei metadati anche se l'OCR lo spezza con spazi
  // («DMPTSN 85E55 H501X»): il regex generico vuole i 16 caratteri contigui (I5).
  if (periziaMetadata?.patientFiscalCode) {
    const cf = periziaMetadata.patientFiscalCode.replace(/\s+/g, '').toUpperCase();
    if (cf.length === 16) {
      const spaced = new RegExp(`(?<![A-Z0-9])${cf.split('').map(escapeRegex).join('\\s?')}(?![A-Z0-9])`, 'gi');
      collectRegexMatches(text, spaced, 'codice_fiscale', tracker, matches);
    }
  }

  // 2. Title + Name patterns
  collectRegexMatches(text, TITLE_NAME_REGEX, 'nome', tracker, matches);

  // 3. Context-based name patterns (sig., paziente, etc.)
  collectRegexCaptureGroupMatches(text, CONTEXT_NAME_REGEX, 'nome', tracker, matches);

  // 4. Patronymic patterns (figlio di, nato da, etc.)
  collectRegexCaptureGroupMatches(text, PATRONYMIC_REGEX, 'nome', tracker, matches);

  // 4b. Intestazioni anagrafiche (anche MAIUSCOLO) + nome prima di "nato/a il"
  // — i nomi presenti SOLO nell'OCR arrivano nel report attraverso le citazioni
  // verbatim con questi formati (fix beta 2026-07-20).
  collectRegexCaptureGroupMatches(text, HEADER_NAME_CAPS_REGEX, 'nome', tracker, matches);
  collectRegexCaptureGroupMatches(text, NAME_BEFORE_NATO_REGEX, 'nome', tracker, matches);

  // 4c. PROPAGAZIONE: ogni nome multi-parola rilevato viene redatto in TUTTE le
  // sue occorrenze (anche senza parola-trigger vicina — es. «risultando invece
  // NOME Cognome» citato dall'AI dal solo OCR) e, per i nomi di 2 token,
  // nell'ordine invertito. MAI su token singoli: troppi cognomi italiani sono
  // parole comuni o cliniche.
  propagateDetectedNameMatches(text, tracker, matches);

  // 5. Codice Fiscale
  collectRegexMatches(text, CF_REGEX, 'codice_fiscale', tracker, matches);

  // 6. Dates (numeric)
  collectRegexMatches(text, DATE_NUMERIC_REGEX, 'data', tracker, matches);

  // 6b. Dates (ISO yyyy-mm-dd) — le date cliniche escono spesso in ISO
  collectRegexMatches(text, DATE_ISO_REGEX, 'data', tracker, matches);

  // 7. Dates (text with month name)
  collectRegexMatches(text, DATE_TEXT_REGEX, 'data', tracker, matches);

  // 8. Addresses
  collectRegexMatches(text, ADDRESS_REGEX, 'indirizzo', tracker, matches);
  collectRegexMatches(text, ADDRESS_CAPS_REGEX, 'indirizzo', tracker, matches);

  // 9. Hospital / facility names
  collectRegexMatches(text, HOSPITAL_REGEX, 'struttura', tracker, matches);

  // 10. Court references (RG numbers)
  collectRegexMatches(text, RG_NUMBER_REGEX, 'riferimento_giudiziario', tracker, matches);

  // 11. Phone numbers
  collectRegexMatches(text, PHONE_REGEX, 'telefono', tracker, matches);

  // 12. Email
  collectRegexMatches(text, EMAIL_REGEX, 'email', tracker, matches);

  // Protezione immagini: i regex numerici (telefono/CF/date) matchano run di cifre
  // dentro i base64 delle immagini diagnostiche embedded → le corromperebbero.
  // Scarta ogni match che cade in una regione immagine (data-URI base64 o ocr-image:).
  const imageRanges = imageProtectedRanges(text);
  const visibleMatches = imageRanges.length > 0
    ? matches.filter((m) => !rangeOverlaps(m.index, m.index + m.length, imageRanges))
    : matches;

  // Deduplicate overlapping matches (keep the first/longest)
  const deduped = deduplicateMatches(visibleMatches);

  // Build category counts
  const categories = countByCategory(deduped);

  return { matches: deduped, categories };
}

// --- Anonymization with categories ---

/**
 * Anonymize text with consistent placeholders.
 * Same PII value always gets the same placeholder across the text.
 * Optionally filter by enabled categories.
 */
export function anonymizeTextAdvanced(params: AnonymizeOptions): {
  anonymizedText: string;
  replacementCount: number;
  replacements: PiiMatch[];
  mapping: Map<string, string>;
} {
  const { text, periziaMetadata, enabledCategories } = params;
  const allCategories: Set<PiiCategory> = enabledCategories ?? new Set([
    'nome', 'codice_fiscale', 'data', 'indirizzo', 'telefono', 'email',
    'struttura', 'riferimento_giudiziario',
  ]);

  const detection = detectPii({ text, periziaMetadata });

  // Filter by enabled categories
  const activeMatches = detection.matches.filter((m) => allCategories.has(m.category));

  // Sort by index descending so we can replace from end to start without shifting indices
  const sorted = [...activeMatches].sort((a, b) => b.index - a.index);

  let result = text;
  for (const match of sorted) {
    result = result.slice(0, match.index) + match.replacement + result.slice(match.index + match.length);
  }

  // Build the mapping
  const mapping = new Map<string, string>();
  for (const match of activeMatches) {
    mapping.set(match.original.toLowerCase(), match.replacement);
  }

  return {
    anonymizedText: result,
    replacementCount: activeMatches.length,
    replacements: activeMatches,
    mapping,
  };
}

// --- Legacy API (backward compatible) ---

/**
 * Anonymize text by replacing PII with placeholders.
 * Optionally uses perizia metadata to replace specific names.
 * @deprecated Use anonymizeTextAdvanced for new code.
 */
export function anonymizeText(params: {
  text: string;
  periziaMetadata?: PeriziaMetadata;
}): AnonymizationResult {
  const { anonymizedText, replacementCount, replacements } = anonymizeTextAdvanced({
    text: params.text,
    periziaMetadata: params.periziaMetadata,
  });

  return {
    anonymizedText,
    replacementCount,
    replacements: replacements.map((r) => ({
      original: r.original,
      replacement: r.replacement,
      type: r.category,
    })),
  };
}

// --- Internal Helpers ---

/**
 * Collect regex matches and add to the matches array with consistent replacements.
 */
function collectRegexMatches(
  text: string,
  regex: RegExp,
  category: PiiCategory,
  tracker: ReplacementTracker,
  matches: PiiMatch[],
): void {
  // Reset regex lastIndex for global patterns
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const replacement = tracker.getOrCreate(match[0], category);
    matches.push({
      original: match[0],
      replacement,
      category,
      index: match.index,
      length: match[0].length,
    });
  }
}

/**
 * Collect matches from a regex with a capture group (group 1).
 * Only the captured portion is treated as PII, not the full match.
 */
function collectRegexCaptureGroupMatches(
  text: string,
  regex: RegExp,
  category: PiiCategory,
  tracker: ReplacementTracker,
  matches: PiiMatch[],
): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const captured = match[1];
    if (!captured || captured.length < 3) continue;
    const captureStart = match[0].indexOf(captured);
    const index = match.index + captureStart;
    const replacement = tracker.getOrCreate(captured, category);
    matches.push({
      original: captured,
      replacement,
      category,
      index,
      length: captured.length,
    });
  }
}

/**
 * Redige TUTTE le occorrenze dei nomi multi-parola già rilevati (e la forma a
 * ordine invertito per i nomi di 2 token), con placeholder coerente via tracker.
 * Opera su uno snapshot dei match correnti: non si auto-alimenta.
 */
function propagateDetectedNameMatches(
  text: string,
  tracker: ReplacementTracker,
  matches: PiiMatch[],
): void {
  const detectedNames = matches
    .filter((m) => m.category === 'nome')
    .map((m) => m.original.trim())
    .filter((name) => name.split(/\s+/).length >= 2);

  const seen = new Set<string>();
  for (const name of detectedNames) {
    const tokens = name.split(/\s+/);
    const variants = [tokens.join(' ')];
    if (tokens.length === 2) {
      variants.push(`${tokens[1]} ${tokens[0]}`);
    }
    for (const variant of variants) {
      const key = variant.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const pattern = new RegExp(
        `\\b${variant.split(/\s+/).map(escapeRegex).join('\\s+')}\\b`,
        'gi',
      );
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const replacement = tracker.getOrCreate(match[0], 'nome');
        matches.push({
          original: match[0],
          replacement,
          category: 'nome',
          index: match.index,
          length: match[0].length,
        });
      }
    }
  }
}

/**
 * Remove overlapping matches, keeping the one that appears first.
 * When two matches overlap, the earlier (or longer) one wins.
 */
function deduplicateMatches(matches: PiiMatch[]): PiiMatch[] {
  if (matches.length === 0) return [];

  // Sort by index ascending, then by length descending (prefer longer matches)
  const sorted = [...matches].sort((a, b) =>
    a.index !== b.index ? a.index - b.index : b.length - a.length
  );

  const result: PiiMatch[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];
    // No overlap: current starts after previous ends
    if (curr.index >= prev.index + prev.length) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * Count matches by category.
 */
function countByCategory(matches: PiiMatch[]): Record<PiiCategory, number> {
  const counts: Record<PiiCategory, number> = {
    nome: 0,
    codice_fiscale: 0,
    data: 0,
    indirizzo: 0,
    telefono: 0,
    email: 0,
    struttura: 0,
    riferimento_giudiziario: 0,
  };
  for (const m of matches) {
    counts[m.category] += 1;
  }
  return counts;
}

/**
 * Build name -> replacement mappings from perizia metadata.
 */
function buildNameReplacements(metadata: PeriziaMetadata): Array<{ name: string; replacement: string }> {
  const entries: Array<{ name: string; replacement: string }> = [];

  // patientFullName entra nel prompt di sintesi (etichettato AUTORITATIVO) → puo'
  // comparire nel report in forma narrativa: va redatto.
  if (metadata.patientFullName) {
    entries.push({ name: metadata.patientFullName, replacement: '[PAZIENTE]' });
  }
  if (metadata.parteRicorrente) {
    entries.push({ name: metadata.parteRicorrente, replacement: 'PARTE RICORRENTE' });
  }
  if (metadata.parteResistente) {
    entries.push({ name: metadata.parteResistente, replacement: 'PARTE RESISTENTE' });
  }
  if (metadata.ctuName) {
    entries.push({ name: metadata.ctuName, replacement: '[PERITO]' });
  }
  if (metadata.collaboratoreName) {
    entries.push({ name: metadata.collaboratoreName, replacement: '[COLLABORATORE]' });
  }

  // GDPR (review rc-mvp 2026-07-03): i campi giudiziali sono stati rimossi dal
  // TIPO PeriziaMetadata, ma i JSONB dei casi legacy (CTU/CTP pre-pivot) li
  // contengono ancora a runtime e i loro report citano quei nomi. L'export
  // anonimizzato deve continuare a redigerli — si leggono dal record raw.
  const legacyMeta = metadata as Record<string, unknown>;
  const legacyNameFields: Array<[string, string]> = [
    ['judgeName', '[GIUDICE]'],
    ['ctpRicorrente', '[CTP RICORRENTE]'],
    ['ctpResistente', '[CTP RESISTENTE]'],
    ['coCtuName', '[CO-PERITO]'],
  ];
  for (const [field, replacement] of legacyNameFields) {
    const value = legacyMeta[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      entries.push({ name: value, replacement });
    }
  }

  // Sort by name length descending to replace longer names first
  return entries.sort((a, b) => b.name.length - a.name.length);
}

/**
 * Escape special regex characters in a string.
 */
/** Token del nome: spazi E trattini separano («Demprova-Esempi» → Demprova, Esempi). */
function nameTokens(name: string): string[] {
  return name.split(/[\s-]+/).filter(Boolean);
}

/** Ordine dato e, per i nomi di 2 token, ordine invertito. */
function nameOrderVariants(name: string): string[] {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const out = [tokens.join(' ')];
  if (tokens.length === 2) out.push(`${tokens[1]} ${tokens[0]}`);
  return out;
}

/** Pattern tollerante di un token: apostrofo ASCII/tipografico, trattino ↔ spazio/omesso. */
function tokenPatternSource(token: string): string {
  return escapeRegex(token)
    .replace(/['’]/g, "['’]")
    .replace(/\\-/g, '(?:\\s*-\\s*|\\s+)?');
}

/** Pattern di un nome completo: token separati da spazi, ciascuno tollerante. */
function namePatternSource(name: string): string {
  return `(?<![\\p{L}])${name.split(/\s+/).map(tokenPatternSource).join('\\s+')}(?![\\p{L}])`;
}

const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Regex con tutte le forme della data di nascita ISO dei metadati, o null se malformata. */
function dateOfBirthVariantsRegex(iso: string): RegExp | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  const d = String(Number(dd));
  const mo = String(Number(mm));
  const yy = yyyy!.slice(2);
  const month = MONTHS_IT[Number(mm) - 1] ?? '';
  const sep = '[./-]';
  const num = `(?:0?${d})${sep}(?:0?${mo})${sep}(?:${yyyy}|${yy})`;
  const iso2 = `${yyyy}-${mm}-${dd}`;
  const text = month ? `(?:0?${d})\\s+(?:${month}|${month.slice(0, 3)}\\.?)\\s+(?:${yyyy}|${yy})` : '';
  const alt = [num, iso2, text].filter(Boolean).map((a) => `(?<![\\d])${a}(?![\\d])`).join('|');
  return new RegExp(alt, 'giu');
}

/** Regex dell'indirizzo dei metadati (intero, con spazi/virgole tolleranti) e del solo CAP+comune. */
function addressVariantsRegexes(address: string): RegExp[] {
  const out: RegExp[] = [];
  const tokens = address.split(/[\s,]+/).filter(Boolean);
  if (tokens.length >= 2) {
    out.push(new RegExp(`(?<![\\p{L}\\d])${tokens.map(escapeRegex).join('[\\s,]+')}(?![\\p{L}\\d])`, 'giu'));
  }
  const capCity = /\b(\d{5})\s+([^\d,]+?)\s*$/.exec(address.trim());
  if (capCity) {
    out.push(new RegExp(`(?<![\\d])${escapeRegex(capCity[1]!)}\\s+${escapeRegex(capCity[2]!.trim())}(?![\\p{L}])`, 'giu'));
  }
  return out;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regioni di testo che NON vanno toccate dai regex PII numerici: le immagini
 * diagnostiche embedded (data-URI base64) e i marker ocr-image. I run di cifre
 * del base64 venivano altrimenti matchati da PHONE_REGEX → immagine corrotta
 * nell'export "anonimizzato".
 */
function imageProtectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+|ocr-image:[^\s)]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/** True se [start,end) si sovrappone a una qualunque delle regioni protette. */
function rangeOverlaps(start: number, end: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([s, e]) => start < e && end > s);
}
