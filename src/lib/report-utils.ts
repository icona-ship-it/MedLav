/**
 * Report utility functions shared across report components.
 */

/**
 * Detect if a report synthesis appears truncated (missing conclusion).
 */
export function isTruncated(synthesis: string): boolean {
  const trimmed = synthesis.trim();
  if (trimmed.length === 0) return false;

  // Check if report has a conclusions section
  const hasConclusioni = /conclusioni|considerazioni\s+finali|in\s+definitiva/i.test(trimmed);
  if (hasConclusioni) return false;

  // Get last meaningful line (skip empty lines)
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  const lastLine = lines[lines.length - 1].trim();

  // Headings, list items, and lines ending with punctuation are valid endings
  if (/^#{1,6}\s/.test(lastLine)) return false;
  const lastChar = lastLine[lastLine.length - 1];
  return !['.', ')', '"', '\u00BB', '*', '-', ':', ';', '|', '%', '!'].includes(lastChar);
}
