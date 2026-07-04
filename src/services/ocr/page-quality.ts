/**
 * Qualità OCR per pagina — gate deterministico contro il testo illeggibile.
 *
 * PERCHÉ (ricerca 2026-07-04): il rumore OCR degrada a cascata estrazione e
 * sintesi, e la post-correzione via LLM ALLUCINA (caso Bigon: OCR illeggibile
 * "interpretato" con clinica inventata). Nessuna regola di prompt basta da
 * sola: serve un gate PRIMA dell'estrazione. Con Mistral OCR 4
 * (confidence_scores_granularity) abbiamo la confidenza per parola/pagina;
 * qui la combiniamo con euristiche deterministiche (stile Gopher) e marchiamo
 * le parole inaffidabili con [ILLEGGIBILE] invece di lasciarle interpretare.
 *
 * Scala: 0-100 (coerente con pages.ocr_confidence esistente).
 */

/** Parole sotto questa confidenza (0-1) vengono sostituite con [ILLEGGIBILE]. */
export const WORD_ILLEGIBLE_CONFIDENCE_THRESHOLD = 0.45;

/** Pagine sotto questa qualità (0-100) sono considerate inaffidabili per l'estrazione. */
export const PAGE_LOW_QUALITY_THRESHOLD = 60;

const ILLEGIBLE_MARKER = '[ILLEGGIBILE]';

/** Shape del word score di Mistral OCR (confidence_scores_granularity: 'word'). */
export interface OcrWordScore {
  text: string;
  confidence: number; // 0-1
  startIndex: number; // indice nel markdown della pagina
}

export interface RedactionResult {
  text: string;
  replacedCount: number;
}

/** Finestra di tolleranza per startIndex non allineato (normalizzazioni markdown). */
const INDEX_SEARCH_WINDOW = 8;

function isRedactableToken(text: string): boolean {
  if (text.length === 0 || text.length > 80) return false;
  // Deve contenere almeno una lettera o cifra: la sola punteggiatura non si redige.
  return /[\p{L}\p{N}]/u.test(text);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** true se [start, end) non taglia una parola: i caratteri adiacenti non sono lettere/cifre. */
function hasCleanWordBoundaries(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  return (before === '' || !WORD_CHAR.test(before)) && (after === '' || !WORD_CHAR.test(after));
}

/**
 * Prima occorrenza di `word` con confini di parola puliti entro ± finestra da
 * approxIndex. -1 se non esiste — un match a metà parola ('la' dentro
 * 'clavicola') NON è un match (review 2026-07-04: corrompeva l'evidenza).
 */
function findWordOccurrenceNear(text: string, word: string, approxIndex: number): number {
  const from = Math.max(0, approxIndex - INDEX_SEARCH_WINDOW);
  let idx = text.indexOf(word, from);
  while (idx !== -1 && idx <= approxIndex + INDEX_SEARCH_WINDOW) {
    if (hasCleanWordBoundaries(text, idx, idx + word.length)) return idx;
    idx = text.indexOf(word, idx + 1);
  }
  return -1;
}

/**
 * Sostituisce con [ILLEGGIBILE] le parole sotto soglia di confidenza.
 * Conservativo: se la parola non si trova COME PAROLA INTERA dove il modello
 * dice (± finestra, confini di parola verificati), NON tocca il testo — mai
 * corrompere l'evidenza. Run adiacenti di marker vengono collassati in uno.
 */
export function redactLowConfidenceWords(
  markdown: string,
  wordScores: OcrWordScore[],
  threshold: number = WORD_ILLEGIBLE_CONFIDENCE_THRESHOLD,
): RedactionResult {
  const candidates = wordScores
    .filter((w) => w.confidence < threshold && isRedactableToken(w.text))
    // Dal fondo verso l'inizio: gli indici precedenti restano validi.
    .sort((a, b) => b.startIndex - a.startIndex);

  let text = markdown;
  let replacedCount = 0;

  for (const word of candidates) {
    let at = -1;
    if (
      text.startsWith(word.text, word.startIndex)
      && hasCleanWordBoundaries(text, word.startIndex, word.startIndex + word.text.length)
    ) {
      at = word.startIndex;
    } else {
      at = findWordOccurrenceNear(text, word.text, word.startIndex);
    }
    if (at === -1) continue; // introvabile come parola intera: non toccare l'evidenza
    text = text.slice(0, at) + ILLEGIBLE_MARKER + text.slice(at + word.text.length);
    replacedCount += 1;
  }

  if (replacedCount > 1) {
    text = text.replace(/\[ILLEGGIBILE\](?:[ \t]+\[ILLEGGIBILE\])+/g, ILLEGIBLE_MARKER);
  }

  return { text, replacedCount };
}

const ITALIAN_VOWELS = /[aeiouàèéìíîòóùúAEIOUÀÈÉÌÍÎÒÓÙÚ]/;
// Caratteri "normali" in un referto: lettere, cifre, spazi, punteggiatura clinica comune.
const ALLOWED_CHAR = /[\p{L}\p{N}\s.,;:()'"«»%/\-–—·°+=*|<>[\]_?!’]/u;

function stripEdgePunctuation(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * Penalità di garble 0-40, deterministica (stile regole Gopher):
 * - parole alfabetiche senza vocali (l'italiano le ha sempre) → garble OCR
 * - rapporto simboli anomali sul totale dei caratteri
 * - parole miste lettere/simboli oltre soglia
 * Numeri, date e dosaggi (token con cifre) non vengono penalizzati.
 */
export function computeGarblePenalty(text: string): number {
  if (text.length === 0) return 0;

  const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
  let alphaWordCount = 0;
  let noVowelCount = 0;
  let mixedCount = 0;

  for (const raw of rawWords) {
    const word = stripEdgePunctuation(raw);
    if (word.length === 0) continue;
    if (/\p{N}/u.test(word)) continue; // date/dosaggi/valori: mai penalizzati
    const letters = (word.match(/\p{L}/gu) ?? []).length;
    if (letters === 0) continue;
    alphaWordCount += 1;
    if (letters / word.length < 0.7) mixedCount += 1;
    // No-vocali solo su parole senza maiuscole interne: unità e sigle cliniche
    // (mmHg, dL, NYHA) hanno pattern camel/upper, il garble OCR è lowercase.
    const hasInnerUppercase = /[A-ZÀÈÉÌÍÎÒÓÙÚ]/.test(word.slice(1));
    if (word.length >= 4 && !hasInnerUppercase && !ITALIAN_VOWELS.test(word)) noVowelCount += 1;
  }

  const nonSpaceChars = text.replace(/\s+/g, '');
  let symbolCount = 0;
  for (const ch of nonSpaceChars) {
    if (!ALLOWED_CHAR.test(ch)) symbolCount += 1;
  }
  const symbolRatio = nonSpaceChars.length > 0 ? symbolCount / nonSpaceChars.length : 0;
  const noVowelRatio = alphaWordCount > 0 ? noVowelCount / alphaWordCount : 0;
  const mixedRatio = alphaWordCount > 0 ? mixedCount / alphaWordCount : 0;

  const penalty = noVowelRatio * 50 + symbolRatio * 80 + mixedRatio * 30;
  return Math.min(40, Math.round(penalty));
}

/**
 * Stima euristica 0-100 (evoluzione della vecchia estimateConfidence di
 * ocr-service: stessa scala e stessi cardini, più la penalità di garble).
 */
export function estimateHeuristicConfidence(text: string): number {
  if (!text || text.length < 10) return 0;

  const illegibleCount = (text.match(/\[ILLEGGIBILE\]/gi) ?? []).length;
  const totalWords = text.split(/\s+/).length;
  if (totalWords === 0) return 0;

  const illegiblePenalty = Math.min(illegibleCount * 5, 40);
  const garblePenalty = computeGarblePenalty(text);
  const lengthBonus = Math.min(totalWords / 10, 10);

  const score = Math.round(90 - illegiblePenalty - garblePenalty + lengthBonus);
  return Math.max(Math.min(score, 100), 10);
}

/**
 * Qualità finale della pagina: combinazione CONSERVATIVA (min) tra la
 * confidenza del modello OCR (0-1, se disponibile) e l'euristica sul testo.
 * Il min evita sia l'overconfidence del modello su scansioni garbate, sia
 * l'euristica cieca su testo plausibile ma mal letto.
 */
export function computePageQualityScore(
  text: string,
  apiAverageConfidence?: number | null,
): number {
  const heuristic = estimateHeuristicConfidence(text);
  if (heuristic === 0) return 0;
  if (apiAverageConfidence === undefined || apiAverageConfidence === null) return heuristic;
  const apiScore = Math.round(Math.max(0, Math.min(1, apiAverageConfidence)) * 100);
  return Math.min(apiScore, heuristic);
}
