/**
 * Deterministic table detection and annotation.
 * Pre-processes OCR text to wrap tabular data with [TABLE_START]/[TABLE_END] markers
 * so the LLM extraction prompt can handle them with specific instructions.
 *
 * No LLM calls — pure heuristics.
 */

const TABLE_START = '[TABLE_START]';
const TABLE_END = '[TABLE_END]';

// Minimum consecutive lines to consider a block as tabular
const MIN_TABLE_LINES = 3;
const MIN_REPEATED_STRUCTURE_LINES = 4;

export interface TableAnnotationResult {
  annotatedText: string;
  tableCount: number;
}

/**
 * Annotate tabular blocks in text with [TABLE_START]/[TABLE_END] markers.
 * Detects markdown tables, aligned numeric tables, and repeated-structure blocks.
 */
export function annotateTablesInText(text: string): TableAnnotationResult {
  // Skip if already annotated or text is too short
  if (text.includes(TABLE_START) || text.length < 30) {
    return { annotatedText: text, tableCount: 0 };
  }

  const blocks = splitIntoBlocks(text);
  let tableCount = 0;
  const annotatedBlocks: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);

    if (lines.length >= MIN_TABLE_LINES && isTableBlock(lines)) {
      annotatedBlocks.push(`${TABLE_START}\n${block}\n${TABLE_END}`);
      tableCount++;
    } else {
      annotatedBlocks.push(block);
    }
  }

  return {
    annotatedText: annotatedBlocks.join('\n\n'),
    tableCount,
  };
}

/**
 * Split text into blocks separated by double newlines.
 * Preserves page markers as separate blocks.
 */
function splitIntoBlocks(text: string): string[] {
  return text.split(/\n{2,}/).filter((b) => b.trim().length > 0);
}

/**
 * Check if a block of lines is a table using 3 heuristics.
 */
function isTableBlock(lines: string[]): boolean {
  return (
    isMarkdownTable(lines) ||
    isAlignedNumericTable(lines) ||
    isRepeatedStructureBlock(lines)
  );
}

/**
 * Heuristic 1: Markdown table — lines with 2+ pipe characters or separator rows |---|.
 */
function isMarkdownTable(lines: string[]): boolean {
  const pipeLines = lines.filter((l) => {
    const pipeCount = (l.match(/\|/g) ?? []).length;
    return pipeCount >= 2;
  });

  // At least MIN_TABLE_LINES lines with pipes, or presence of separator row
  if (pipeLines.length >= MIN_TABLE_LINES) return true;

  const hasSeparator = lines.some((l) => /\|[\s-]*-{2,}[\s-]*\|/.test(l));
  return hasSeparator && pipeLines.length >= 2;
}

/**
 * Heuristic 2: Aligned numeric table — lines with pattern: name + spaces/tabs + number + optional unit.
 * Common in lab results: "Emoglobina    13.5 g/dL"
 */
function isAlignedNumericTable(lines: string[]): boolean {
  // Pattern: word(s) followed by whitespace gap then a number (with optional decimal and unit)
  const numericLinePattern = /^[A-Za-zÀ-ÿ\s./()-]+\s{2,}\d+[.,]?\d*\s*[A-Za-zÀ-ÿ/%°*]*$/;

  let matchCount = 0;
  for (const line of lines) {
    if (numericLinePattern.test(line.trim())) {
      matchCount++;
    }
  }

  return matchCount >= MIN_TABLE_LINES;
}

/**
 * Heuristic 3: Repeated structure — 4+ lines with same token pattern.
 * Detects tabular data without clear delimiters.
 * Token pattern = sequence of types: 'W' (word), 'N' (number), 'P' (punctuation/symbol).
 */
function isRepeatedStructureBlock(lines: string[]): boolean {
  if (lines.length < MIN_REPEATED_STRUCTURE_LINES) return false;

  const patterns = lines.map(getTokenPattern);
  const patternCounts = new Map<string, number>();

  for (const p of patterns) {
    patternCounts.set(p, (patternCounts.get(p) ?? 0) + 1);
  }

  // Check if any single pattern appears in >= MIN_REPEATED_STRUCTURE_LINES lines
  for (const count of patternCounts.values()) {
    if (count >= MIN_REPEATED_STRUCTURE_LINES) return true;
  }

  return false;
}

/**
 * Get a simplified token pattern for a line.
 * "Emoglobina 13.5 g/dL" → "W N W"
 */
function getTokenPattern(line: string): string {
  const tokens = line.trim().split(/\s+/);
  return tokens
    .map((t) => {
      if (/^\d+[.,]?\d*$/.test(t)) return 'N';
      if (/^[A-Za-zÀ-ÿ]/.test(t)) return 'W';
      return 'P';
    })
    .join(' ');
}
