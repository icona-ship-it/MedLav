/**
 * AGGANCIO ALLA FONTE ("quote snapping") — il passo che porta la trascrizione
 * della documentazione sanitaria al 100% di fedeltà PER COSTRUZIONE.
 *
 * Il modello SCEGLIE cosa citare, ma il testo lo COPIA il codice: ogni
 * citazione «...» generata viene localizzata nell'OCR e, se la somiglianza è
 * alta, SOSTITUITA con il testo esatto del documento. Le ricomposizioni
 * sbagliate del modello (parole rimescolate sugli a-capo, refusi introdotti
 * tipo «piacca» per «placca» — entrambi osservati dal vivo) diventano copie
 * conformi invece di finire solo segnalate. Sotto soglia non si tocca nulla:
 * la citazione resta e viene flaggata dal verificatore come oggi.
 *
 * Garanzia risultante: ogni «...» nel report è IDENTICA al documento originale
 * oppure esplicitamente segnalata al perito. Puro, deterministico, idempotente.
 */

import { stripPageMarkers, stripHtmlTags } from './source-text-verifier';

/** Somiglianza minima (LCS parole) per sostituire il testo: più alta della
 * soglia di flag (0.80) — per RISCRIVERE serve più certezza che per segnalare. */
export const SNAP_THRESHOLD = 0.85;
/** Citazioni sotto questa lunghezza non si agganciano (rischio falsi match). */
const MIN_SNAP_CHARS = 15;
/** Lo span agganciato non può superare la citazione di questo fattore (in parole). */
const MAX_SPAN_FACTOR = 1.8;
/** Densità minima dello span: parole agganciate / parole totali dello span. */
const MIN_SPAN_DENSITY = 0.8;
/** Massimo run CONSECUTIVO di parole estranee dentro lo span. Collaudo live
 * CASO-2026-029 v2: due certificati quasi-gemelli consecutivi → lo span faceva
 * PONTE tra i due inglobando firma e intestazione del secondo (citazione-
 * Frankenstein non flaggata perché contigua nell'OCR). Un refuso sparso è un
 * run di 1-2 parole; un ponte firma+intestazione è un run lungo → rifiuto
 * (→ la citazione resta e la flagga il verificatore). */
const MAX_UNMATCHED_RUN = 4;
/** Pre-filtro bag-of-words: una finestra entra nel DP (costoso) solo se contiene
 * almeno questa frazione delle parole della citazione. Più lasco della soglia di
 * snap (0.85) per lasciare margine ai match fuzzy (refusi a livello carattere). */
const PREFILTER_RATIO = 0.7;
/** Tetto di finestre che passano al DP (le migliori per overlap): il costo per
 * citazione resta bounded e deterministico anche su corpus enormi/ripetitivi. */
const MAX_DP_WINDOWS = 40;

export interface SnapResult {
  outcome: 'exact' | 'snapped' | 'unmatched' | 'skipped';
  /** Testo esatto della fonte (solo per 'snapped'). */
  sourceText?: string;
  similarity?: number;
}

interface CorpusToken {
  word: string;
  start: number;
  end: number;
}

function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}"'«»\-–—/\\*_`#~<>|=+]/g, '');
}

/** Corpus pulito (marker pagina/tag HTML via) con offset validi per l'estrazione. */
export function buildSnapCorpus(fullOcrText: string): { text: string; tokens: CorpusToken[] } {
  const text = stripHtmlTags(stripPageMarkers(fullOcrText));
  const tokens: CorpusToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = normalizeWord(m[0]);
    if (word.length > 0) tokens.push({ word, start: m.index, end: m.index + m[0].length });
  }
  return { text, tokens };
}

function quoteWords(quote: string): string[] {
  return quote.split(/\s+/).map(normalizeWord).filter((w) => w.length > 0);
}

/** Edit distance limitata (early-exit oltre maxDist). */
function boundedEditDistance(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array<number>(b.length + 1);
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Parole "uguali" ai fini dell'aggancio: identiche, oppure refuso a livello di
 * carattere (il caso reale «piacca»/«placca»: LLM o OCR sbagliano UNA lettera).
 * Solo per parole lunghe — le corte (di, il, non...) devono restare esatte.
 */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 9) return boundedEditDistance(a, b, 2) <= 2;
  if (minLen >= 5) return boundedEditDistance(a, b, 1) <= 1;
  return false;
}

/** LCS con backtracking: lunghezza, indici (nel window) di primo/ultimo match
 * e massimo run di token del window NON agganciati tra due match consecutivi. */
function lcsWithBounds(a: string[], b: string[]): { length: number; bFirst: number; bLast: number; maxGap: number } {
  const n = a.length;
  const mLen = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(mLen + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= mLen; j++) {
      dp[i][j] = wordsMatch(a[i - 1], b[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack per trovare gli estremi dei match nel corpus-window e il massimo
  // buco interno (token del window saltati tra due match consecutivi).
  let i = n; let j = mLen;
  let bFirst = -1; let bLast = -1;
  let prevMatchedB = -1; let maxGap = 0;
  while (i > 0 && j > 0) {
    if (wordsMatch(a[i - 1], b[j - 1])) {
      bFirst = j - 1;
      if (bLast === -1) bLast = j - 1;
      if (prevMatchedB !== -1) {
        const gap = prevMatchedB - (j - 1) - 1;
        if (gap > maxGap) maxGap = gap;
      }
      prevMatchedB = j - 1;
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return { length: dp[n][mLen], bFirst, bLast, maxGap };
}

/**
 * Aggancia UNA citazione al corpus: 'exact' se già identica, 'snapped' col
 * testo esatto della fonte se somiglianza ≥ soglia, altrimenti 'unmatched'.
 */
export function snapQuoteToSource(
  quote: string,
  corpus: { text: string; tokens: CorpusToken[] },
): SnapResult {
  const trimmed = quote.trim();
  if (trimmed.length < MIN_SNAP_CHARS) return { outcome: 'skipped' };
  if (corpus.text.includes(trimmed)) return { outcome: 'exact' };

  const qWords = quoteWords(trimmed);
  if (qWords.length < 3) return { outcome: 'skipped' };
  const corpusWords = corpus.tokens.map((t) => t.word);

  const windowSize = Math.min(qWords.length * 3, corpusWords.length);
  if (windowSize === 0) return { outcome: 'unmatched' };
  const step = Math.max(1, Math.floor(qWords.length / 2));

  const quoteWordSet = new Set(qWords);
  const minPrefilterHits = qWords.length * PREFILTER_RATIO;

  // Passo 1 — pre-filtro O(corpus): overlap bag-of-words per finestra. Il DP
  // O(quote×window) gira SOLO sulle migliori MAX_DP_WINDOWS candidate: costo
  // per citazione bounded e deterministico anche su corpus enormi/ripetitivi.
  const candidates: Array<{ start: number; hits: number }> = [];
  for (let start = 0; start <= corpusWords.length - windowSize; start += step) {
    let hits = 0;
    for (let k = start; k < start + windowSize; k++) {
      if (quoteWordSet.has(corpusWords[k])) hits++;
    }
    if (hits >= minPrefilterHits) candidates.push({ start, hits });
  }
  if (candidates.length === 0 && corpusWords.length < windowSize) {
    candidates.push({ start: 0, hits: 0 }); // corpus più corto della window: DP diretto
  }
  candidates.sort((a, b) => b.hits - a.hits || a.start - b.start);

  // Passo 2 — DP con backtracking sulle sole candidate migliori. La densità
  // (parole agganciate / parole dello span) entra nella SELEZIONE: a parità di
  // somiglianza vince lo span compatto, e uno span-ponte pieno di materiale
  // estraneo non può vincere su un match pulito.
  let best: { ratio: number; density: number; maxGap: number; first: number; last: number } | null = null;
  for (const { start } of candidates.slice(0, MAX_DP_WINDOWS)) {
    const windowWords = corpusWords.slice(start, start + windowSize);
    const { length, bFirst, bLast, maxGap } = lcsWithBounds(qWords, windowWords);
    const ratio = length / qWords.length;
    const density = bFirst >= 0 ? length / (bLast - bFirst + 1) : 0;
    if (bFirst >= 0 && (!best || ratio > best.ratio || (ratio === best.ratio && density > best.density))) {
      best = { ratio, density, maxGap, first: start + bFirst, last: start + bLast };
    }
    if (best && best.ratio === 1 && best.density >= MIN_SPAN_DENSITY) break;
  }

  if (!best || best.ratio < SNAP_THRESHOLD) {
    return { outcome: 'unmatched', similarity: best?.ratio };
  }
  const spanTokens = best.last - best.first + 1;
  if (spanTokens > qWords.length * MAX_SPAN_FACTOR) {
    return { outcome: 'unmatched', similarity: best.ratio };
  }
  if (best.density < MIN_SPAN_DENSITY || best.maxGap > MAX_UNMATCHED_RUN) {
    return { outcome: 'unmatched', similarity: best.ratio };
  }
  // GUARDIA NUMERI/DATE: mai riscrivere una citazione se un suo token con cifre
  // (date, dosaggi, percentuali, n. nosologici) non è presente ESATTO nello span
  // scelto — il rischio di "correggere" silenziosamente una data verso un
  // passaggio simile ma diverso è inaccettabile in un atto medico-legale.
  // In quel caso la citazione resta intatta e la flagga il verificatore.
  const spanWordSet = new Set(corpusWords.slice(best.first, best.last + 1));
  for (const w of qWords) {
    if (/\d/.test(w) && !spanWordSet.has(w)) {
      return { outcome: 'unmatched', similarity: best.ratio };
    }
  }
  const sourceText = corpus.text
    .slice(corpus.tokens[best.first].start, corpus.tokens[best.last].end)
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    // I `#` a inizio riga sono markdown dell'OCR, non testo del documento — e un
    // "## " re-introdotto DOPO la demozione degli heading (che gira a monte dello
    // snapping) riaprirebbe il varco GDPR del parser sezioni sul link pubblico.
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
  if (sourceText.includes('«') || sourceText.includes('»')) {
    return { outcome: 'unmatched', similarity: best.ratio };
  }
  return { outcome: 'snapped', sourceText, similarity: best.ratio };
}

export interface SnapDocResult {
  markdown: string;
  total: number;
  exactCount: number;
  snappedCount: number;
  unmatchedCount: number;
}

// Stessa cattura del verificatore (generated-quote-verifier).
const GUILLEMET_QUOTE = /«([^«»]{1,2000})»/g;
// Le ellissi DENTRO una citazione segnano omissioni volute (direttiva):
// ogni frammento si aggancia separatamente e l'insieme si ricompone.
const ELLIPSIS_SPLIT = /\s*(?:\.\.\.|…)\s*/;

/**
 * Aggancia tutte le «...» di una sezione al corpus OCR. Sostituisce SOLO le
 * citazioni interamente risolte (ogni frammento exact o snapped); le altre
 * restano intatte per il verificatore/pannello. Idempotente.
 */
export function snapDocSanitariaQuotes(
  markdown: string,
  fullOcrText: string,
): SnapDocResult {
  const corpus = buildSnapCorpus(fullOcrText);
  let total = 0;
  let exactCount = 0;
  let snappedCount = 0;
  let unmatchedCount = 0;

  const out = markdown.replace(GUILLEMET_QUOTE, (match: string, inner: string) => {
    const trimmed = inner.trim();
    if (trimmed.length < MIN_SNAP_CHARS) return match;
    total++;

    const fragments = trimmed.split(ELLIPSIS_SPLIT).filter((f) => f.trim().length > 0);
    const resolved: string[] = [];
    let anySnapped = false;
    for (const fragment of fragments) {
      const res = snapQuoteToSource(fragment, corpus);
      if (res.outcome === 'exact' || res.outcome === 'skipped') {
        resolved.push(fragment);
      } else if (res.outcome === 'snapped' && res.sourceText) {
        resolved.push(res.sourceText);
        anySnapped = true;
      } else {
        unmatchedCount++;
        return match; // frammento irrisolto → citazione intatta, la flagga il verificatore
      }
    }
    if (!anySnapped) {
      exactCount++;
      return match;
    }
    snappedCount++;
    return `«${resolved.join(' … ')}»`;
  });

  return { markdown: out, total, exactCount, snappedCount, unmatchedCount };
}
