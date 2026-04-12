/**
 * Post-generation report quality validator.
 * Checks the LLM-generated synthesis for structural issues BEFORE saving.
 * Non-blocking: logs warnings but never prevents saving.
 */

export interface ReportIssue {
  type:
    | 'missing_section'
    | 'sentinel_date_leak'
    | 'low_event_coverage'
    | 'empty_report'
    | 'too_short'
    | 'phantom_date'
    | 'numerical_mismatch'
    | 'invalid_event_ref'
    | 'duplicate_content'
    | 'unverified_citation'
    | 'truncated_response';
  severity: 'error' | 'warning';
  message: string;
}

export interface ReportValidation {
  valid: boolean; // true if no errors (warnings are ok)
  issues: ReportIssue[];
  eventCoverage: number; // % of events referenced with [Ev.N]
}

/** Optional context for enhanced validation checks (backward-compatible). */
export interface ReportValidationContext {
  events: Array<{ orderNumber: number; eventDate: string }>;
  calculations?: Array<{ label: string; value: string; days: number | null }>;
  /** OCR text for citation verification (Phase 5 safeguard). */
  ocrText?: Array<{ documentId: string; pages: Array<{ ocrText: string }> }>;
}

const REQUIRED_SECTIONS = [
  {
    name: 'Documentazione sanitaria',
    pattern: /dati\s+della\s+documentazione\s+sanitaria|documentazione\s+sanitaria|documentazione\s+medica/i,
  },
  {
    name: 'Epicrisi/Conclusioni',
    pattern: /epicrisi|conclusioni|sintesi\s+conclusiva/i,
  },
];

const SENTINEL_PATTERNS = [
  /\b01[./]01[./]1900\b/,
  /\b1900-01-01\b/,
  /Data non documentata/,
];

const MIN_WORD_COUNT = 500;

/** Regex matching DD/MM/YYYY or DD.MM.YYYY dates in report text. */
const DATE_PATTERN = /\b(\d{2})[./](\d{2})[./](\d{4})\b/g;

/**
 * Validate a generated report for quality issues.
 * Returns validation result with issues categorized by severity.
 */
export function validateReport(
  synthesis: string,
  eventCount: number,
  context?: ReportValidationContext,
): ReportValidation {
  const issues: ReportIssue[] = [];

  // 1. Empty report
  if (synthesis.trim().length === 0) {
    issues.push({
      type: 'empty_report',
      severity: 'error',
      message: 'Report is empty',
    });
    return { valid: false, issues, eventCoverage: 0 };
  }

  // 2. Too short
  const wordCount = synthesis.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount < MIN_WORD_COUNT) {
    issues.push({
      type: 'too_short',
      severity: 'error',
      message: `Report has ${wordCount} words (minimum: ${MIN_WORD_COUNT})`,
    });
  }

  // 3. Missing required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!section.pattern.test(synthesis)) {
      issues.push({
        type: 'missing_section',
        severity: 'error',
        message: `Missing section: ${section.name}`,
      });
    }
  }

  // 4. Sentinel date leak
  for (const pattern of SENTINEL_PATTERNS) {
    if (pattern.test(synthesis)) {
      issues.push({
        type: 'sentinel_date_leak',
        severity: 'warning',
        message: `Sentinel date found in report: ${pattern.source}`,
      });
    }
  }

  // 5. Event coverage: check that a meaningful % of event dates appear in the report text.
  // Reports cite by date (not [Ev.N]), so we check date string presence as a proxy.
  let eventCoverage = 100;
  if (context?.events && context.events.length > 0) {
    const eventsWithDate = context.events.filter((e) => e.eventDate && e.eventDate !== '1900-01-01');
    if (eventsWithDate.length > 0) {
      const synthesisLower = synthesis.toLowerCase();
      const coveredCount = eventsWithDate.filter((e) => {
        // Check if the event date appears in DD/MM/YYYY or DD.MM.YYYY or YYYY-MM-DD format
        const d = e.eventDate;
        const parts = d.split('-');
        if (parts.length !== 3) return true; // skip malformed dates
        const ddmmyyyy = `${parts[2]}/${parts[1]}/${parts[0]}`;
        const ddmmyyyyDot = `${parts[2]}.${parts[1]}.${parts[0]}`;
        return synthesisLower.includes(d) || synthesisLower.includes(ddmmyyyy) || synthesisLower.includes(ddmmyyyyDot);
      }).length;
      eventCoverage = Math.round((coveredCount / eventsWithDate.length) * 100);
      if (eventCoverage < 30) {
        issues.push({
          type: 'low_event_coverage',
          severity: 'warning',
          message: `Solo il ${eventCoverage}% degli eventi clinici è citato nel report (${coveredCount}/${eventsWithDate.length}). Possibile perdita di dati.`,
        });
      }
    }
  }

  // 6-9. Context-dependent checks (backward-compatible: only run when context provided)
  if (context) {
    issues.push(...checkPhantomDates(synthesis, context));
    issues.push(...checkNumericalMismatch(synthesis, context));
    issues.push(...checkUnverifiedCitations(synthesis, context));
  }
  issues.push(...checkDuplicateContent(synthesis));

  const hasErrors = issues.some((i) => i.severity === 'error');
  return { valid: !hasErrors, issues, eventCoverage };
}

// ── Existing helpers ──

// ── New check: Phantom Dates ──

/**
 * Parse DD/MM/YYYY dates from report and verify they exist in event dates.
 * Sentinel dates (1900) are excluded — they have their own check.
 */
function checkPhantomDates(
  synthesis: string,
  context: ReportValidationContext,
): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const eventDateSet = new Set<string>();

  for (const ev of context.events) {
    // Normalize event dates to DD/MM/YYYY for comparison
    const normalized = normalizeToSlashDate(ev.eventDate);
    if (normalized) eventDateSet.add(normalized);
  }

  // No events → can't validate dates
  if (eventDateSet.size === 0) return [];

  const seenPhantoms = new Set<string>();
  let match: RegExpExecArray | null;
  const dateRegex = new RegExp(DATE_PATTERN.source, 'g');

  while ((match = dateRegex.exec(synthesis)) !== null) {
    const rawDateStr = match[0]; // DD/MM/YYYY or DD.MM.YYYY
    const year = match[3];

    // Skip sentinel dates (handled by sentinel check)
    if (year === '1900') continue;

    // Normalize to canonical DD/MM/YYYY for comparison
    const dateStr = normalizeToSlashDate(rawDateStr) ?? rawDateStr;

    // Skip if already reported
    if (seenPhantoms.has(dateStr)) continue;

    if (!eventDateSet.has(dateStr)) {
      seenPhantoms.add(dateStr);
      issues.push({
        type: 'phantom_date',
        severity: 'warning',
        message: `Date ${rawDateStr} in report not found in any event`,
      });
    }
  }

  return issues;
}

/** Convert YYYY-MM-DD, DD/MM/YYYY, or DD.MM.YYYY to a canonical DD/MM/YYYY for set comparison. */
function normalizeToSlashDate(dateStr: string): string | null {
  // DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = dateStr.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (dmyMatch) return `${dmyMatch[1]}/${dmyMatch[2]}/${dmyMatch[3]}`;

  // ISO format YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  return null;
}

// ── New check: Numerical Mismatch ──

/** Patterns for extracting ITT/ITP/days values from report text. */
const NUMERICAL_PATTERNS = [
  { label: /ITT[:\s]+(\d+)\s*giorn/i, key: 'ITT' },
  { label: /invalidità\s+temporanea\s+totale[:\s]+(\d+)\s*giorn/i, key: 'ITT' },
  { label: /ITP[:\s]+(\d+)\s*giorn/i, key: 'ITP' },
  { label: /invalidità\s+temporanea\s+parziale[:\s]+(\d+)\s*giorn/i, key: 'ITP' },
  { label: /giorni\s+(?:di\s+)?ricovero[:\s]+(\d+)/i, key: 'Giorni ricovero' },
  { label: /ricovero[:\s]+(\d+)\s*giorn/i, key: 'Giorni ricovero' },
];

/**
 * Check that ITT/ITP/days values mentioned in the report match calculated values.
 * Only flags when there's a clear discrepancy (tolerance: ±2 days).
 */
function checkNumericalMismatch(
  synthesis: string,
  context: ReportValidationContext,
): ReportIssue[] {
  if (!context.calculations || context.calculations.length === 0) return [];

  const issues: ReportIssue[] = [];
  const calcMap = new Map<string, number>();

  for (const calc of context.calculations) {
    if (calc.days !== null) {
      // Normalize label for matching
      const normalizedLabel = normalizeCalcLabel(calc.label);
      if (normalizedLabel) {
        calcMap.set(normalizedLabel, calc.days);
      }
    }
  }

  if (calcMap.size === 0) return [];

  for (const np of NUMERICAL_PATTERNS) {
    const match = np.label.exec(synthesis);
    if (!match) continue;

    const reportValue = parseInt(match[1], 10);
    const calcValue = calcMap.get(np.key);
    if (calcValue === undefined) continue;

    // Tolerance: ±2 days
    if (Math.abs(reportValue - calcValue) > 2) {
      issues.push({
        type: 'numerical_mismatch',
        severity: 'warning',
        message: `${np.key} in report: ${reportValue} days, calculated: ${calcValue} days`,
      });
    }
  }

  return issues;
}

/** Normalize calculation labels to match keys. */
function normalizeCalcLabel(label: string): string | null {
  const lower = label.toLowerCase();
  if (lower.includes('invalidità temporanea totale') || lower === 'itt') return 'ITT';
  if (lower.includes('invalidità temporanea parziale') || lower === 'itp') return 'ITP';
  if (lower.includes('ricovero')) return 'Giorni ricovero';
  return null;
}

// ── New check: Invalid Event References ──

// ── New check: Duplicate Content ──

const MIN_BLOCK_WORDS = 50;
const DUPLICATE_ERROR_THRESHOLD = 3; // 3+ repeats → error

// ── New check: Unverified Citations (OCR cross-reference) ──

/** Regex matching quoted text "..." in report (at least 8 words). */
const QUOTED_TEXT_PATTERN = /"([^"]{30,})"/g;

/**
 * Check that quoted text ("...") in the report can be found in the OCR text.
 * Uses fuzzy match on first 8 words of each citation.
 * Only runs when OCR text is provided — severity is 'warning' because OCR can have typos.
 */
function checkUnverifiedCitations(
  synthesis: string,
  context: ReportValidationContext,
): ReportIssue[] {
  if (!context.ocrText || context.ocrText.length === 0) return [];

  // Concatenate all OCR text for searching
  const allOcrText = context.ocrText
    .flatMap((doc) => doc.pages.map((p) => p.ocrText))
    .join('\n')
    .toLowerCase();

  if (allOcrText.length === 0) return [];

  const issues: ReportIssue[] = [];
  let unverifiedCount = 0;
  const maxReported = 3; // Limit noise

  let match: RegExpExecArray | null;
  const quoteRegex = new RegExp(QUOTED_TEXT_PATTERN.source, 'g');

  while ((match = quoteRegex.exec(synthesis)) !== null) {
    const quotedText = match[1];
    // Extract first 8 words for fuzzy matching
    const words = quotedText.split(/\s+/).slice(0, 8);
    if (words.length < 4) continue; // Skip very short quotes

    const searchPhrase = words.join(' ').toLowerCase();

    // Check if the first 8 words appear in OCR text
    if (!allOcrText.includes(searchPhrase)) {
      unverifiedCount++;
      if (unverifiedCount <= maxReported) {
        const preview = quotedText.slice(0, 60);
        issues.push({
          type: 'unverified_citation',
          severity: 'warning',
          message: `Quoted text not found in OCR: "${preview}..."`,
        });
      }
    }
  }

  if (unverifiedCount > maxReported) {
    issues.push({
      type: 'unverified_citation',
      severity: 'warning',
      message: `${unverifiedCount - maxReported} additional unverified citations not shown`,
    });
  }

  return issues;
}

/**
 * Detect blocks of >50 words that appear multiple times in the report.
 * Uses sliding window of 50-word blocks and checks for exact duplicates.
 */
function checkDuplicateContent(synthesis: string): ReportIssue[] {
  const words = synthesis.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < MIN_BLOCK_WORDS * 2) return [];

  const blockCounts = new Map<string, number>();

  // Slide a 50-word window across the text
  for (let i = 0; i <= words.length - MIN_BLOCK_WORDS; i += 10) {
    const block = words.slice(i, i + MIN_BLOCK_WORDS).join(' ').toLowerCase();
    blockCounts.set(block, (blockCounts.get(block) ?? 0) + 1);
  }

  const issues: ReportIssue[] = [];
  let duplicateFound = false;

  for (const [block, count] of blockCounts) {
    if (count >= 2 && !duplicateFound) {
      const preview = block.slice(0, 80);
      const severity = count >= DUPLICATE_ERROR_THRESHOLD ? 'error' : 'warning';
      issues.push({
        type: 'duplicate_content',
        severity,
        message: `Duplicate block (${count}x, ${MIN_BLOCK_WORDS}+ words): "${preview}..."`,
      });
      duplicateFound = true; // Report only the first duplicate to avoid noise
      break;
    }
  }

  return issues;
}
