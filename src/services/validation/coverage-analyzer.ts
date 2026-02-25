/**
 * Deterministic coverage analysis of extracted events against OCR text.
 * Identifies uncovered text blocks that might contain missed clinical events.
 *
 * Pure function — no LLM calls, no side effects.
 */

import type { ExtractedEvent } from '../extraction/extraction-schemas';

export interface UncoveredBlock {
  start: number;
  end: number;
  text: string;
  hasMedicalTerms: boolean;
  matchedTerms: string[];
}

export interface CoverageResult {
  coveragePercent: number;
  totalTextLength: number;
  coveredLength: number;
  uncoveredBlocks: UncoveredBlock[];
  uncoveredWithMedicalTerms: number;
  warnings: string[];
}

// Minimum uncovered block size to report (chars)
const MIN_UNCOVERED_BLOCK_SIZE = 200;

// Curated list of Italian medical terms that indicate potentially missed clinical events
const MEDICAL_TERMS: string[] = [
  'diagnosi', 'terapia', 'intervento', 'ricovero', 'dimissione',
  'operatorio', 'chirurgico', 'anestesia', 'farmaco', 'dosaggio',
  'esame', 'referto', 'ecografia', 'radiografia', 'risonanza',
  'biopsia', 'istologico', 'emocromo', 'glicemia', 'creatinina',
  'emoglobina', 'leucociti', 'piastrine', 'pressione', 'frequenza',
  'temperatura', 'saturazione', 'complicanza', 'emorragia', 'infezione',
  'frattura', 'protesi', 'sutura', 'drenaggio', 'catetere',
  'antibiotico', 'analgesico', 'profilassi', 'follow-up', 'controllo',
  'visita', 'consulenza', 'prognosi', 'decorso', 'parametri',
];

/**
 * Analyze how much of the OCR text is covered by extracted events' sourceText.
 */
export function analyzeCoverage(
  events: ExtractedEvent[],
  fullText: string,
): CoverageResult {
  const cleanText = stripPageMarkers(fullText);
  const normalizedClean = cleanText.toLowerCase();
  const totalLength = cleanText.length;

  if (totalLength === 0) {
    return {
      coveragePercent: 100,
      totalTextLength: 0,
      coveredLength: 0,
      uncoveredBlocks: [],
      uncoveredWithMedicalTerms: 0,
      warnings: [],
    };
  }

  // Find covered ranges from sourceText matches
  const coveredRanges = findCoveredRanges(events, cleanText, normalizedClean);
  const mergedRanges = mergeRanges(coveredRanges);
  const coveredLength = mergedRanges.reduce((sum, r) => sum + (r.end - r.start), 0);

  // Find uncovered blocks
  const uncoveredBlocks = findUncoveredBlocks(
    mergedRanges,
    cleanText,
    totalLength,
  );

  const uncoveredWithMedicalTerms = uncoveredBlocks.filter((b) => b.hasMedicalTerms).length;
  const coveragePercent = Math.round((coveredLength / totalLength) * 100);

  // Generate warnings
  const warnings: string[] = [];

  if (coveragePercent < 50) {
    warnings.push(
      `Copertura bassa (${coveragePercent}%): possibili eventi mancanti nel testo non coperto`,
    );
  }

  if (uncoveredWithMedicalTerms > 0) {
    warnings.push(
      `${uncoveredWithMedicalTerms} blocchi non coperti contengono terminologia medica`,
    );
  }

  return {
    coveragePercent,
    totalTextLength: totalLength,
    coveredLength,
    uncoveredBlocks,
    uncoveredWithMedicalTerms,
    warnings,
  };
}

/**
 * Find text positions covered by events' sourceText.
 */
function findCoveredRanges(
  events: ExtractedEvent[],
  cleanText: string,
  normalizedClean: string,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  for (const event of events) {
    const sourceText = event.sourceText ?? '';
    if (sourceText.length === 0) continue;

    // Try exact match first
    const cleanSource = stripPageMarkers(sourceText);
    let idx = cleanText.indexOf(cleanSource);
    if (idx !== -1) {
      ranges.push({ start: idx, end: idx + cleanSource.length });
      continue;
    }

    // Try normalized match
    const normalizedSource = cleanSource.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedForSearch = normalizedClean.replace(/\s+/g, ' ');

    idx = normalizedForSearch.indexOf(normalizedSource);
    if (idx !== -1) {
      // Approximate position in original text (good enough for coverage)
      ranges.push({ start: idx, end: idx + normalizedSource.length });
    }
  }

  return ranges;
}

/**
 * Merge overlapping ranges into non-overlapping sorted ranges.
 */
function mergeRanges(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    if (current.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, current.end) };
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Find uncovered blocks between merged ranges that are > MIN_UNCOVERED_BLOCK_SIZE.
 */
function findUncoveredBlocks(
  mergedRanges: Array<{ start: number; end: number }>,
  cleanText: string,
  totalLength: number,
): UncoveredBlock[] {
  const gaps: Array<{ start: number; end: number }> = [];

  if (mergedRanges.length === 0) {
    gaps.push({ start: 0, end: totalLength });
  } else {
    // Gap before first covered range
    if (mergedRanges[0].start > 0) {
      gaps.push({ start: 0, end: mergedRanges[0].start });
    }
    // Gaps between ranges
    for (let i = 1; i < mergedRanges.length; i++) {
      gaps.push({ start: mergedRanges[i - 1].end, end: mergedRanges[i].start });
    }
    // Gap after last range
    if (mergedRanges[mergedRanges.length - 1].end < totalLength) {
      gaps.push({ start: mergedRanges[mergedRanges.length - 1].end, end: totalLength });
    }
  }

  return gaps
    .filter((g) => g.end - g.start >= MIN_UNCOVERED_BLOCK_SIZE)
    .map((g) => {
      const text = cleanText.slice(g.start, g.end).trim();
      const { hasMedicalTerms, matchedTerms } = checkMedicalTerms(text);
      return {
        start: g.start,
        end: g.end,
        text: text.length > 500 ? `${text.slice(0, 500)}...` : text,
        hasMedicalTerms,
        matchedTerms,
      };
    });
}

/**
 * Check if text contains medical terminology from curated list.
 */
function checkMedicalTerms(text: string): { hasMedicalTerms: boolean; matchedTerms: string[] } {
  const lowerText = text.toLowerCase();
  const matchedTerms = MEDICAL_TERMS.filter((term) => lowerText.includes(term));
  return {
    hasMedicalTerms: matchedTerms.length > 0,
    matchedTerms,
  };
}

/**
 * Strip [PAGE_START:N], [PAGE_END:N], [TABLE_START], [TABLE_END] markers.
 */
function stripPageMarkers(text: string): string {
  return text
    .replace(/\[PAGE_(?:START|END):\d+\]/g, '')
    .replace(/\[TABLE_(?:START|END)\]/g, '');
}
