/**
 * Generate a unique case code in format CASO-YYYY-NNN
 * where NNN is a sequential number padded to 3 digits.
 */
export function generateCaseCode(existingCount: number): string {
  const year = new Date().getFullYear();
  const number = (existingCount + 1).toString().padStart(3, '0');
  return `CASO-${year}-${number}`;
}
