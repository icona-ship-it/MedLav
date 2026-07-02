/**
 * Core di scoring per la valutazione "golden" dei report MedLav contro i
 * benchmark reali. Funzioni PURE e testabili, condivise da:
 *  - scripts/diff-report-vs-gold.ts (singolo caso, diff dettagliato)
 *  - scripts/eval-golden-harness.ts (batch, scorecard)
 *
 * NB: nessuna dipendenza da Mistral. La GENERAZIONE del report la fa il perito
 * via app; questo modulo CONFRONTA il generato col gold.
 */

/** Normalizza il testo per il confronto (toglie frontmatter, comprime spazi). */
export function normalize(text: string): string {
  return text
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Insieme dei token (parole >= 3 char, lowercase, senza punteggiatura). */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

/** Similarità Jaccard fra due insiemi di token (0–1). */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const DOMAIN_KEYWORDS = [
  'anamnesi', 'diagnosi', 'terapia', 'prognosi', 'esito',
  'invalidita', 'inabilita', 'menomazione', 'danno biologico',
  'nesso causale', 'guarigione', 'esiti permanenti',
  'invalidita temporanea', 'totale', 'parziale', 'giorni',
  'visita', 'esame', 'referto', 'ricovero', 'intervento', 'cartella clinica',
  'quesiti', 'conclusioni', 'considerazioni',
];

export interface KeywordCoverage {
  totalKeywords: number;
  presentInGold: number;
  presentInGenerated: number;
  missingFromGenerated: string[];
}

/** Rimuove i diacritici (à→a): i benchmark scrivono "invalidità", la keyword è "invalidita". */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Conteggio parole normalizzato — stessa metrica di scoreReport (single source of truth). */
export function countWords(text: string): number {
  return normalize(text).split(/\s+/).filter((w) => w.length > 0).length;
}

export function keywordCoverage(gold: string, generated: string): KeywordCoverage {
  const goldLower = stripAccents(gold.toLowerCase());
  const genLower = stripAccents(generated.toLowerCase());
  const goldPresent = DOMAIN_KEYWORDS.filter((k) => goldLower.includes(k));
  const missing = goldPresent.filter((k) => !genLower.includes(k));
  return {
    totalKeywords: DOMAIN_KEYWORDS.length,
    presentInGold: goldPresent.length,
    presentInGenerated: DOMAIN_KEYWORDS.filter((k) => genLower.includes(k)).length,
    missingFromGenerated: missing,
  };
}

export interface LineDiff {
  missingFromGenerated: string[];
  extraInGenerated: string[];
}

export function lineDiff(gold: string, generated: string): LineDiff {
  const goldLines = new Set(gold.split('\n').map((l) => l.trim()).filter((l) => l.length > 20));
  const generatedLines = new Set(generated.split('\n').map((l) => l.trim()).filter((l) => l.length > 20));
  const missingFromGenerated: string[] = [];
  for (const line of goldLines) if (!generatedLines.has(line)) missingFromGenerated.push(line);
  const extraInGenerated: string[] = [];
  for (const line of generatedLines) if (!goldLines.has(line)) extraInGenerated.push(line);
  return { missingFromGenerated, extraInGenerated };
}

/** Estrae i titoli di sezione (heading ## o righe TUTTE MAIUSCOLE) dal testo. */
function sectionHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const md = line.match(/^#{1,3}\s+(.+)$/);
    if (md) { headings.push(md[1].replace(/\*+/g, '').trim().toLowerCase()); continue; }
    // Riga in MAIUSCOLO (titoli benchmark stile "I DATI DELLA DOCUMENTAZIONE…")
    const letters = line.replace(/[^\p{L}]/gu, '');
    if (letters.length >= 8 && letters === letters.toUpperCase() && /\s/.test(line)) {
      headings.push(line.toLowerCase());
    }
  }
  return [...new Set(headings)];
}

export interface SectionCoverage {
  goldSections: number;
  matchedInGenerated: number;
  missing: string[];
}

/** Quante sezioni del gold compaiono (come heading) nel generato. */
export function sectionCoverage(gold: string, generated: string): SectionCoverage {
  const goldHeads = sectionHeadings(gold);
  const genHeads = sectionHeadings(generated);
  const missing: string[] = [];
  let matched = 0;
  for (const h of goldHeads) {
    // Match conservativo: heading uguale, oppure il titolo gold (>= 6 char, per
    // evitare match spuri su parole corte) è contenuto in un heading generato.
    // NIENTE direzione inversa (gonfiava la copertura).
    const hit = genHeads.some((g) => g === h || (h.length >= 6 && g.includes(h)));
    if (hit) matched++; else missing.push(h);
  }
  return { goldSections: goldHeads.length, matchedInGenerated: matched, missing };
}

export type Verdict = 'match' | 'acceptable' | 'divergent';

export interface ReportScore {
  similarity: number;
  wordsGold: number;
  wordsGenerated: number;
  wordDeltaPct: number;
  keyword: KeywordCoverage;
  section: SectionCoverage;
  verdict: Verdict;
}

/** Calcola lo score completo di un report generato rispetto al gold. Puro. */
export function scoreReport(goldRaw: string, generatedRaw: string): ReportScore {
  const gold = normalize(goldRaw);
  const generated = normalize(generatedRaw);
  const similarity = jaccardSimilarity(tokenize(gold), tokenize(generated));
  const wordsGold = gold.split(/\s+/).filter((w) => w.length > 0).length;
  const wordsGenerated = generated.split(/\s+/).filter((w) => w.length > 0).length;
  const wordDeltaPct = wordsGold === 0 ? 0 : ((wordsGenerated - wordsGold) / wordsGold) * 100;
  const verdict: Verdict = similarity >= 0.7 ? 'match' : similarity >= 0.5 ? 'acceptable' : 'divergent';
  return {
    similarity,
    wordsGold,
    wordsGenerated,
    wordDeltaPct,
    keyword: keywordCoverage(gold, generated),
    section: sectionCoverage(gold, generated),
    verdict,
  };
}
