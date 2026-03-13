/**
 * Post-generation report quality validator.
 * Checks the LLM-generated synthesis for structural issues BEFORE saving.
 * Non-blocking: logs warnings but never prevents saving.
 */

export interface ReportIssue {
  type: 'missing_section' | 'sentinel_date_leak' | 'low_event_coverage' | 'empty_report' | 'too_short';
  severity: 'error' | 'warning';
  message: string;
}

export interface ReportValidation {
  valid: boolean; // true if no errors (warnings are ok)
  issues: ReportIssue[];
  eventCoverage: number; // % of events referenced with [Ev.N]
}

const REQUIRED_SECTIONS = [
  { name: 'Cronologia medico-legale', pattern: /cronologia\s+medico/i },
  {
    name: 'Riassunto/Inquadramento',
    pattern: /riassunto\s+(del\s+)?caso|inquadramento/i,
  },
  {
    name: 'Elementi di rilievo/Considerazioni',
    pattern: /elementi\s+di\s+rilievo|considerazioni\s+medico|aspetti\s+(critici|rilevanti)|osservazioni\s+medico|profili\s+di\s+responsabilit|valutazione\s+di\s+merito/i,
  },
];

const SENTINEL_PATTERNS = [
  /\b01\/01\/1900\b/,
  /\b1900-01-01\b/,
  /Data non documentata/,
];

const MIN_WORD_COUNT = 200;

/**
 * Validate a generated report for quality issues.
 * Returns validation result with issues categorized by severity.
 */
export function validateReport(synthesis: string, eventCount: number): ReportValidation {
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

  // 5. Event coverage
  const eventCoverage = computeEventCoverage(synthesis, eventCount);
  if (eventCount > 0 && eventCoverage < 50) {
    issues.push({
      type: 'low_event_coverage',
      severity: 'warning',
      message: `Only ${Math.round(eventCoverage)}% of events referenced (${countReferencedEvents(synthesis)}/${eventCount})`,
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  return { valid: !hasErrors, issues, eventCoverage };
}

function countReferencedEvents(synthesis: string): number {
  const matches = synthesis.match(/\[Ev\.(\d+)\]/g);
  if (!matches) return 0;
  const uniqueNums = new Set(matches.map((m) => m.match(/\d+/)?.[0]));
  return uniqueNums.size;
}

function computeEventCoverage(synthesis: string, eventCount: number): number {
  if (eventCount === 0) return 100;
  const referenced = countReferencedEvents(synthesis);
  return (referenced / eventCount) * 100;
}
