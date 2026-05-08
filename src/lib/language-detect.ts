/**
 * Lightweight language detection for OCR text in medical-legal documents.
 *
 * Wave C.4 (post-Schönweger): a simple keyword-frequency heuristic that's
 * good enough to flag German/English documents in an Italian-default app.
 * Not meant to compete with cld3/franc — just enough to add a translation
 * note to the LLM prompt and a UI flag.
 *
 * Returns 'mixed' when no language clearly dominates (>=60% of hits).
 */

export type DetectedLanguage = 'it' | 'de' | 'en' | 'mixed' | 'unknown';

// Common high-frequency words. Chosen for low overlap across languages.
// Italian medical/admin: artiocoli + verbi tipici di cartelle cliniche.
const ITALIAN_KEYWORDS = [
  'il', 'lo', 'la', 'gli', 'le', 'un', 'una', 'del', 'della', 'dello',
  'che', 'con', 'per', 'nel', 'nella', 'dal', 'sono', 'è', 'da', 'in',
  'paziente', 'visita', 'esame', 'diagnosi', 'terapia', 'ricovero',
  'cartella', 'medico', 'ospedale', 'clinica', 'referto', 'anamnesi',
  'dimissione', 'sintomi', 'prognosi', 'controllo', 'risultato',
];

// German medical: Patient/Befund/Diagnose/Therapie + grammar markers.
const GERMAN_KEYWORDS = [
  'der', 'die', 'das', 'und', 'mit', 'bei', 'für', 'auf', 'als', 'ist',
  'ein', 'eine', 'einen', 'sind', 'wurde', 'wird', 'sich', 'nicht',
  'patient', 'patientin', 'befund', 'diagnose', 'therapie', 'aufnahme',
  'entlassung', 'behandlung', 'untersuchung', 'station', 'krankenhaus',
  'klinik', 'arzt', 'ärztin', 'beschwerden', 'anamnese',
];

// English medical: less common in this app but worth detecting.
const ENGLISH_KEYWORDS = [
  'the', 'and', 'with', 'patient', 'diagnosis', 'treatment', 'hospital',
  'clinic', 'doctor', 'examination', 'admission', 'discharge', 'history',
  'symptoms', 'follow', 'report', 'normal', 'abnormal',
];

interface DetectionResult {
  language: DetectedLanguage;
  /** Per-language keyword hit count, for debugging/UI display. */
  hits: { it: number; de: number; en: number };
}

/**
 * Count keyword hits using word-boundary regex (so 'der' in 'oder' doesn't match).
 */
function countHits(text: string, keywords: string[]): number {
  let count = 0;
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    // \b is ASCII-only — for German umlauts we still get adequate accuracy
    // because the keyword list itself uses ASCII forms where possible.
    const re = new RegExp(`\\b${kw}\\b`, 'g');
    const matches = lower.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect the dominant language of an OCR-extracted text snippet.
 *
 * @param text - the OCR text. The first 4000 chars are sufficient for detection.
 * @returns the detected language plus the hit counts.
 */
export function detectLanguage(text: string): DetectionResult {
  if (!text || text.trim().length < 50) {
    return { language: 'unknown', hits: { it: 0, de: 0, en: 0 } };
  }

  // Sample the first 4000 chars — enough for stable detection without
  // scanning huge cartelle cliniche.
  const sample = text.slice(0, 4000);

  const hits = {
    it: countHits(sample, ITALIAN_KEYWORDS),
    de: countHits(sample, GERMAN_KEYWORDS),
    en: countHits(sample, ENGLISH_KEYWORDS),
  };

  const total = hits.it + hits.de + hits.en;
  if (total < 5) {
    return { language: 'unknown', hits };
  }

  const top = Math.max(hits.it, hits.de, hits.en);
  const dominantRatio = top / total;

  // Need a clear majority (60%) to call a single language.
  if (dominantRatio < 0.6) {
    return { language: 'mixed', hits };
  }

  if (top === hits.it) return { language: 'it', hits };
  if (top === hits.de) return { language: 'de', hits };
  return { language: 'en', hits };
}

/**
 * Human-readable label for the detected language, in Italian (for UI).
 */
export function languageLabel(lang: DetectedLanguage): string {
  switch (lang) {
    case 'it':
      return 'italiano';
    case 'de':
      return 'tedesco';
    case 'en':
      return 'inglese';
    case 'mixed':
      return 'misto';
    case 'unknown':
      return 'non determinabile';
  }
}
