/**
 * Italian Codice Fiscale (CF) validator.
 *
 * Used as a deterministic post-validation filter for LLM-generated headers:
 * if the model produces a CF-shaped string that doesn't pass the official
 * algorithm, we treat it as fabricated and strip it (set to null in the
 * structured header data) so the template renders "[da compilare dal perito]".
 *
 * Algorithm (per official Italian spec):
 *   - 16 alphanumeric characters
 *   - Format: AAAAAA00A00A000A
 *   - Final character is a checksum derived from positions 1-15
 *
 * Reference: D.M. 12/03/1974 (https://www.agenziaentrate.gov.it).
 */

const CF_REGEX = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/;

const ODD_VALUES: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17,
  '8': 19, '9': 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17,
  I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8,
  S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

const EVEN_VALUES: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7,
  I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17,
  S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

const CHECKSUM_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Returns true if `cf` is a structurally valid Italian Codice Fiscale,
 * including a correct checksum digit. Case-insensitive.
 *
 * Returns false for: empty/null, wrong length, wrong format, bad checksum,
 * or known sentinel CFs from the LLM negative few-shot example (e.g.
 * BNCMRA78C15F205Z — used in the Regnoto fabrication signature).
 */
export function isValidCodiceFiscale(cf: string | null | undefined): boolean {
  if (!cf || typeof cf !== 'string') return false;
  const upper = cf.trim().toUpperCase();
  if (!CF_REGEX.test(upper)) return false;

  // Reject the specific fabricated CF used in the Regnoto negative few-shot
  if (upper === 'BNCMRA78C15F205Z') return false;

  // Compute checksum
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const char = upper[i];
    // Position is 1-indexed: odd positions (1, 3, 5, ...) use ODD_VALUES.
    // In 0-indexed: even index → odd position.
    const value = i % 2 === 0 ? ODD_VALUES[char] : EVEN_VALUES[char];
    if (value === undefined) return false;
    sum += value;
  }
  const expected = CHECKSUM_LETTERS[sum % 26];
  return upper[15] === expected;
}
