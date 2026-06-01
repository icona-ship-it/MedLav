/**
 * Italian-style date format validator.
 *
 * Accepts:
 *   - DD/MM/YYYY  (es. 13/12/2025)
 *   - DD.MM.YYYY  (es. 13.12.2025)
 *   - DD-MM-YYYY  (es. 13-12-2025)
 *   - YYYY-MM-DD  (ISO, es. 2025-12-13)
 *
 * Validates that day/month/year values are within plausible medico-legal
 * ranges (year 1900-2100, valid month, valid day-of-month). Used as a
 * post-validation filter for LLM-generated header data — invalid date
 * strings are stripped to null so the template renders "[da compilare]".
 */

const DD_MM_YYYY_RE = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidYMD(year: number, month: number, day: number): boolean {
  // Year 1900 is excluded on purpose: LegMed uses "1900-01-01" as a sentinel
  // for "missing date" — accepting it here would let the sentinel slip into
  // headers as a fabricated date of birth. Real periziandi can plausibly be
  // 1901+ (would be 124 years old in 2025).
  if (year < 1901 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const maxDay = month === 2 && isLeap(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= maxDay;
}

/**
 * Returns true if `s` is a parseable Italian-style or ISO date with
 * plausible component values. Returns false on null/empty/malformed.
 *
 * Note: this is a structural check — does NOT verify that the date is
 * not in the future or matches a specific clinical context. Those
 * semantic checks happen in upstream extractors.
 */
export function isValidItalianDate(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  const trimmed = s.trim();

  let day: number, month: number, year: number;

  const dmy = DD_MM_YYYY_RE.exec(trimmed);
  if (dmy) {
    day = parseInt(dmy[1], 10);
    month = parseInt(dmy[2], 10);
    year = parseInt(dmy[3], 10);
  } else {
    const iso = ISO_RE.exec(trimmed);
    if (!iso) return false;
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  }

  return isValidYMD(year, month, day);
}

/**
 * Normalize an Italian-style or ISO date string to ISO YYYY-MM-DD.
 * Returns null if the input is not a valid real calendar date — callers should
 * treat null as "reject" so a malformed/ambiguous date never reaches the DB.
 * Italian DD/MM is assumed (day first), matching the IT convention.
 */
export function normalizeItalianDateToIso(s: string | null | undefined): string | null {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();

  const dmy = DD_MM_YYYY_RE.exec(trimmed);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    if (!isValidYMD(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const iso = ISO_RE.exec(trimmed);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (!isValidYMD(year, month, day)) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}
