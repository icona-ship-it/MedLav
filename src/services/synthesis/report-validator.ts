/**
 * Post-generation report quality validator.
 * Checks the LLM-generated synthesis for structural issues BEFORE saving.
 *
 * Issues carry a severity: 'warning' (logged, report still saved) or 'error'
 * (blocking — the caller must refuse to save and retry/escalate). The set of
 * error types that actually block saving is centralized in BLOCKING_ERROR_TYPES
 * / getBlockingIssues() so the sectional and monolithic pipelines agree.
 */

export interface ReportIssue {
  type:
    | 'missing_section'
    | 'sentinel_date_leak'
    | 'sentinel_name_leak'
    | 'low_event_coverage'
    | 'empty_report'
    | 'too_short'
    | 'phantom_date'
    | 'numerical_mismatch'
    | 'invalid_event_ref'
    | 'duplicate_content'
    | 'unverified_citation'
    | 'truncated_response'
    | 'broken_ocr_marker'
    | 'template_artifact'
    | 'header_mismatch'
    | 'header_fabrication_signature';
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
  /** Role-mandatory section titles for the resolved report plan (A3). When
   * provided, the validator checks each title is present as a "## heading" with
   * non-empty content and flags a blocking `missing_section` error otherwise.
   * Titles come from the resolved section plan (section-catalog.ts), so the
   * check is role/module-aware without the validator knowing the role itself. */
  requiredSectionTitles?: string[];
  /** Perizia metadata for header coherence checks (Wave 2.2). When provided,
   * the validator compares fields like tribunale / RG / giudice against the
   * intestazione section text and flags mismatches as errors. */
  periziaMetadata?: {
    tribunale?: string | null;
    sezione?: string | null;
    numeroRG?: string | null;
    giudice?: string | null;
    ricorrente?: string | null;
    resistente?: string | null;
  };
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

/**
 * Names and facilities that appear ONLY in the few-shot examples inside the LLM prompts
 * (peritale-formulations.ts, extraction-prompts.ts, synthesis-prompts.ts). Their presence
 * in a generated report is a strong indicator that the model copied verbatim from the
 * example instead of using the real case data.
 *
 * Each entry uses word boundaries + specific titled/compound forms to minimise false
 * positives on common Italian surnames ("Rossi" alone would flag real patients).
 */
const SENTINEL_NAME_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bDott\.?\s+Bianchi\b/i, label: 'Dott. Bianchi' },
  { pattern: /\bDr\.?\s+Bianchi\b/i, label: 'Dr. Bianchi' },
  { pattern: /\bDott\.?\s+Verdi\b/i, label: 'Dott. Verdi' },
  { pattern: /\bDott\.?\s+Neri\b/i, label: 'Dott. Neri' },
  { pattern: /\bOspedale\s+San\s+Marco\b/i, label: 'Ospedale San Marco' },
  { pattern: /\bP\.?O\.?\s+San\s+Giovanni\b/i, label: 'P.O. San Giovanni' },
  { pattern: /\bLaboratorio\s+Analisi\b/i, label: 'Laboratorio Analisi' },
  // Token distintivi dell'esempio narrativo Antoniazzi in il_fatto_e_storia_clinica
  // (section-catalog.ts): se compaiono nel report, l'LLM ha copiato l'esempio.
  { pattern: /\bScuola\s+Cangrande\b/i, label: 'Scuola Cangrande (esempio Antoniazzi)' },
  { pattern: /\bCorso\s+[Pp]orta\s+[Nn]uova\b/i, label: 'Corso Porta Nuova (esempio Antoniazzi)' },
  { pattern: /\bmotociclo\s+delle\s+[Pp]oste\b/i, label: 'motociclo delle Poste (esempio Antoniazzi)' },
];

// Truncation-detection floor only. Real LLM truncation (finishReason='length')
// is caught upstream in section-generator.ts:269. This validator floor catches
// only catastrophic short outputs (model crash, network error mid-stream).
// 500 words is enough to detect that without rejecting legitimate concise
// stragiudiziale reports — actual length is shaped by per-section token
// budgets (section-catalog.ts) and prompt directives (synthesis-prompts.ts).
const MIN_WORD_COUNT = 500;

/**
 * Soglia BLOCCANTE: sotto questa il report è quasi certamente una generazione
 * fallita (crash/rete). Tra ABSOLUTE_MIN e MIN_WORD_COUNT è solo un warning —
 * un report volutamente ridotto col selettore "Sezioni del report" è legittimo
 * e non deve essere bloccato (col conseguente retry Inngest a vuoto).
 */
const ABSOLUTE_MIN_WORD_COUNT = 150;

/** A3: expected minimum % of dated clinical events cited in the report. Below
 * this we warn; below COVERAGE_HARD_BLOCK_PERCENT (with enough events) we block. */
const MIN_EVENT_COVERAGE_PERCENT = 30;
/** Coverage below this % is treated as a gross failure (report blocked), since
 * even a date-format proxy artifact cannot plausibly push a sound report this low. */
const COVERAGE_HARD_BLOCK_PERCENT = 10;
/** Minimum dated events required before the hard block trusts the coverage signal. */
const COVERAGE_MIN_EVENTS_FOR_BLOCK = 5;

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

  // 2. Too short. Blocca SOLO se grossolanamente vuoto (generazione fallita).
  // Tra ABSOLUTE_MIN e MIN_WORD_COUNT è un warning: un report volutamente ridotto
  // (selettore "Sezioni del report") è legittimo, non un errore.
  const wordCount = synthesis.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount < ABSOLUTE_MIN_WORD_COUNT) {
    issues.push({
      type: 'too_short',
      severity: 'error',
      message: `Report has ${wordCount} words (minimo assoluto: ${ABSOLUTE_MIN_WORD_COUNT})`,
    });
  } else if (wordCount < MIN_WORD_COUNT) {
    issues.push({
      type: 'too_short',
      severity: 'warning',
      message: `Report has ${wordCount} words (sotto la soglia consigliata: ${MIN_WORD_COUNT})`,
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

  // 4. Sentinel date leak — P0-VAL-002: promoted from warning to error.
  // A report containing "01/01/1900" or "Data non documentata" cannot be deposited and must
  // block saving so the pipeline retries (or escalates to manual review).
  for (const pattern of SENTINEL_PATTERNS) {
    if (pattern.test(synthesis)) {
      issues.push({
        type: 'sentinel_date_leak',
        severity: 'error',
        message: `Sentinel date found in report: ${pattern.source}`,
      });
    }
  }

  // 4a-bis. Broken OCR / serialization markers — Wave A.1 (post-Schönweger).
  // The Mistral OCR 3 table coercion bug surfaced "[object Object]" tokens in
  // event titles; if any leaked through into synthesis prose, the report is
  // unsignable. Equally, a literal "null" word in a sentence is a strong sign
  // the model dumped a serialized object as text.
  const BROKEN_MARKERS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\[object Object\]/i, label: '[object Object]' },
    { pattern: /\bundefined\b/i, label: 'undefined (token testuale)' },
    { pattern: /:\s*null\s*[,\}]/, label: 'null serializzato (es. ": null,")' },
  ];
  for (const { pattern, label } of BROKEN_MARKERS) {
    if (pattern.test(synthesis)) {
      issues.push({
        type: 'broken_ocr_marker',
        severity: 'error',
        message: `Marker di errore nel report: ${label}. Il report non può essere salvato — l'output è corrotto.`,
      });
    }
  }

  // 4a-ter. Template/internal artifacts (QA 2026-06-11) — warnings: visibili
  // al perito e nello HRS ma non bloccano il salvataggio (il rischio falsi
  // positivi non è zero: un documento-fonte verbatim può contenere testo simile).
  const TEMPLATE_ARTIFACTS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\[Facoltativo:/i, label: 'testo-template "[Facoltativo:" non rielaborato' },
    { pattern: /\(ev\.\s*#?\d+\)/, label: 'riferimento interno "(ev. #N)" nel testo' },
    { pattern: /```/, label: 'code fence markdown (```) nel report' },
    { pattern: /\[TABLE_HTML_START\]/, label: 'marker tabella HTML non espanso' },
  ];
  for (const { pattern, label } of TEMPLATE_ARTIFACTS) {
    if (pattern.test(synthesis)) {
      issues.push({
        type: 'template_artifact',
        severity: 'warning',
        message: `Artefatto tecnico nel report: ${label} — da ripulire prima del deposito.`,
      });
    }
  }

  // 4b. Sentinel name leak — P1-EXT-009 / P1-SYN-004 / H-02.
  // Warn if the report mentions names/facilities that appear ONLY in the few-shot prompt
  // examples (peritale-formulations.ts, extraction-prompts.ts, synthesis-prompts.ts).
  // Kept as warning (not error) to avoid false positives on real cases that legitimately
  // contain common names — the perito sees the flag and verifies.
  for (const { pattern, label } of SENTINEL_NAME_PATTERNS) {
    if (pattern.test(synthesis)) {
      issues.push({
        type: 'sentinel_name_leak',
        severity: 'warning',
        message: `Possibile nome/struttura copiata dagli esempi del prompt: ${label}`,
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
      const coveredCount = eventsWithDate.filter((e) => eventDateAppearsInReport(e.eventDate, synthesisLower)).length;
      eventCoverage = Math.round((coveredCount / eventsWithDate.length) * 100);
      if (eventCoverage < MIN_EVENT_COVERAGE_PERCENT) {
        // A3: coverage is a PROXY. eventDateAppearsInReport() matches numeric
        // forms (DD.MM.YYYY, DD/MM/YYYY, ISO) AND extended Italian prose
        // ("15 marzo 2024", "15 marzo") so narrative stragiudiziale reports
        // aren't undercounted. Still imperfect, and the block fires at assembly
        // with a deterministic seed (a retry reproduces the same report), so a
        // false positive permanently fails a good case. Therefore we HARD-BLOCK
        // only on gross failure (near-zero coverage with enough dated events to
        // trust the signal); the 10-30% band stays a warning.
        const grossFailure =
          eventCoverage < COVERAGE_HARD_BLOCK_PERCENT &&
          eventsWithDate.length >= COVERAGE_MIN_EVENTS_FOR_BLOCK;
        issues.push({
          type: 'low_event_coverage',
          severity: grossFailure ? 'error' : 'warning',
          message: grossFailure
            ? `Solo il ${eventCoverage}% degli eventi clinici è citato nel report (${coveredCount}/${eventsWithDate.length}). Perdita massiva di dati — report bloccato.`
            : `Solo il ${eventCoverage}% degli eventi clinici è citato nel report (${coveredCount}/${eventsWithDate.length}, atteso ≥${MIN_EVENT_COVERAGE_PERCENT}%). Possibile perdita di dati — verificare.`,
        });
      }
    }
  }

  // 6-9. Context-dependent checks (backward-compatible: only run when context provided)
  if (context) {
    issues.push(...checkRequiredSections(synthesis, context));
    issues.push(...checkPhantomDates(synthesis, context));
    issues.push(...checkNumericalMismatch(synthesis, context));
    issues.push(...checkUnverifiedCitations(synthesis, context));
    issues.push(...checkHeaderCoherence(synthesis, context));
  }
  issues.push(...checkHeaderFabricationSignature(synthesis));
  issues.push(...checkDuplicateContent(synthesis));

  const hasErrors = issues.some((i) => i.severity === 'error');
  return { valid: !hasErrors, issues, eventCoverage };
}

// ── Existing helpers ──

// ── A3: Role-mandatory section presence ──

/**
 * For each role-mandatory section title, verify the report contains a matching
 * section heading with non-empty content. A missing heading OR a truly-empty
 * section body is flagged as a blocking `missing_section` error (A3). Only runs
 * when `context.requiredSectionTitles` is provided (resolved section plan).
 *
 * Section headings are emitted by the assembler as exactly `## <title>` (two
 * hashes). Section CONTENT may legitimately contain its own headings — the
 * rendered intestazione starts with `# <title>` and `### Dati …` sub-headings.
 * So the "next section" boundary must be the next 2-hash `## ` heading ONLY;
 * matching any `#{1,3}` here wrongly treated a content sub-heading as the next
 * section and reported a fully-populated section as empty (would block EVERY
 * report). We block only on a genuinely empty body (0 words) — a terse-but-real
 * section must not deterministically fail the case.
 */
function checkRequiredSections(
  synthesis: string,
  context: ReportValidationContext,
): ReportIssue[] {
  const titles = context.requiredSectionTitles;
  if (!titles || titles.length === 0) return [];

  const issues: ReportIssue[] = [];
  const seen = new Set<string>();

  for (const title of titles) {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0 || seen.has(normalizedTitle.toLowerCase())) continue;
    seen.add(normalizedTitle.toLowerCase());

    // Match the section heading on its own line, case-insensitive. Use [ \t]*
    // (not \s*) so the match stops at the heading's newline.
    // CRITICAL FIX: l'intestazione e' resa con heading ALIASED per ruolo/modulo
    // ("## PARERE PRO VERITATE", "## VALUTAZIONE MEDICO-LEGALE STRAGIUDIZIALE", ...),
    // NON "## Intestazione". Cercare il title letterale produceva un falso
    // missing_section che bloccava PER SEMPRE ogni report Parere. Per il titolo
    // "Intestazione" usiamo il regex di aliasing gia' noto al validator.
    const isIntestazione = /^intestazione$/i.test(normalizedTitle);
    const headingRe = isIntestazione
      ? new RegExp(INTESTAZIONE_HEADING_RE.source, 'i')
      : new RegExp(`(?:^|\\n)#{1,3}[ \\t]*${escapeRegex(normalizedTitle)}[ \\t]*(?:\\n|$)`, 'i');
    const match = headingRe.exec(synthesis);
    if (!match) {
      issues.push({
        type: 'missing_section',
        severity: 'error',
        message: `Sezione obbligatoria mancante: "${normalizedTitle}". Il report non può essere salvato senza questa sezione.`,
      });
      continue;
    }

    // Body = text from end of this heading to the NEXT 2-hash section heading
    // (`\n## `). Content-internal `#`/`###` headings are NOT boundaries.
    const contentStart = match.index + match[0].length;
    const rest = synthesis.slice(contentStart);
    const nextHeading = rest.search(/\n##[ \t]/);
    const body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
    const bodyWords = body.split(/\s+/).filter((w) => w.length > 0).length;
    if (bodyWords === 0) {
      issues.push({
        type: 'missing_section',
        severity: 'error',
        message: `Sezione obbligatoria vuota: "${normalizedTitle}". Generazione incompleta — report bloccato.`,
      });
    }
  }

  return issues;
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

/** Italian month names, indexed 1-12, for matching extended prose dates. */
const ITALIAN_MONTHS = [
  '', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * True if an ISO event date (YYYY-MM-DD) is cited anywhere in the (lowercased)
 * report, in any common Italian form: numeric (15.03.2024 / 15/03/2024 / ISO)
 * OR extended prose ("15 marzo 2024", "15 marzo"). The prose forms matter for
 * narrative reports (stragiudiziale) that rarely write numeric dates — without
 * them the coverage proxy under-counts and can falsely block a sound report.
 */
export function eventDateAppearsInReport(isoDate: string, synthesisLower: string): boolean {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return true; // malformed → don't penalise
  const [yyyy, mm, dd] = parts;
  const day = parseInt(dd, 10);
  const monthIdx = parseInt(mm, 10);

  if (synthesisLower.includes(isoDate)) return true;
  if (synthesisLower.includes(`${dd}/${mm}/${yyyy}`)) return true;
  if (synthesisLower.includes(`${dd}.${mm}.${yyyy}`)) return true;
  if (synthesisLower.includes(`${dd}-${mm}-${yyyy}`)) return true;
  // Non-zero-padded numeric forms, e.g. "12/3/2024" or "5.3.2024".
  if (synthesisLower.includes(`${day}/${monthIdx}/${yyyy}`)) return true;
  if (synthesisLower.includes(`${day}.${monthIdx}.${yyyy}`)) return true;
  if (synthesisLower.includes(`${day}-${monthIdx}-${yyyy}`)) return true;

  // Extended prose: "15 marzo 2024" or non-zero-padded "5 marzo 2024", and the
  // year-less "15 marzo" form. Require the day number to avoid matching a bare
  // month name shared by many events.
  const monthName = ITALIAN_MONTHS[monthIdx];
  if (monthName) {
    if (synthesisLower.includes(`${day} ${monthName} ${yyyy}`)) return true;
    if (synthesisLower.includes(`${day} ${monthName}`)) return true;
    // Date ranges, e.g. a ricovero "dal 12 al 20 marzo 2024": the start day and
    // the month bridged ONLY by a range connective (al / - / – / e il) + the end
    // day, so an unrelated "12 esami a marzo" does not falsely match.
    const rangeRe = new RegExp(`\\b${day}\\b\\s*(?:al|-|–|/|e il)\\s*\\d{1,2}\\s+${monthName}\\b`);
    if (rangeRe.test(synthesisLower)) return true;
  }
  return false;
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
  let totalQuoted = 0;
  const maxReported = 3; // Limit noise

  let match: RegExpExecArray | null;
  const quoteRegex = new RegExp(QUOTED_TEXT_PATTERN.source, 'g');

  while ((match = quoteRegex.exec(synthesis)) !== null) {
    const quotedText = match[1];
    // Extract first 8 words for fuzzy matching
    const words = quotedText.split(/\s+/).slice(0, 8);
    if (words.length < 4) continue; // Skip very short quotes
    totalQuoted++;

    const searchPhrase = words.join(' ').toLowerCase();

    // Check if the first 8 words appear in OCR text
    if (!allOcrText.includes(searchPhrase)) {
      unverifiedCount++;
      if (unverifiedCount <= maxReported) {
        const preview = quotedText.slice(0, 60);
        issues.push({
          type: 'unverified_citation',
          severity: 'warning', // tentative; promoted to error below if ratio is high
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

  // Le citazioni non verificate sono SEMPRE warning visibili, MAI bloccanti
  // (decisione perito 2026-06-02: "avviso visibile, fiducia di default, controllo
  // a richiesta"). La modalità VERBATIM produce molte virgolettate: il fuzzy-match
  // OCR ha falsi negativi noti (legature, accenti, a-capo di colonna) e bloccare
  // fermerebbe casi legittimi. Sopra il 50% si rinforza solo il messaggio.
  if (totalQuoted >= 4 && unverifiedCount / totalQuoted > 0.5) {
    issues.push({
      type: 'unverified_citation',
      severity: 'warning',
      message: `Oltre il 50% delle citazioni virgolettate (${unverifiedCount}/${totalQuoted}) non è stato ritrovato nel testo OCR: verificare manualmente che le citazioni riproducano fedelmente i documenti originali.`,
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

// ── Wave 2.2: Header coherence ────────────────────────────────────────
//
// Compares fields in the rendered intestazione against the perizia metadata
// the perito filled in. Mismatches (e.g. metadata says "Tribunale Brescia"
// but the rendered intestazione says "Tribunale Milano") are flagged as
// errors so the report is blocked from being saved with wrong header data.
//
// Soft-match (case-insensitive substring): tolerates trailing punctuation
// and minor whitespace differences without false-positiving on typo-level
// variants.

const INTESTAZIONE_HEADING_RE = /(?:^|\n)#{1,3}\s*(?:VALUTAZIONE\s+MEDICO-LEGALE\s+STRAGIUDIZIALE|PARERE\s+(?:PRO\s+VERITATE|A\s+SCOPO\s+RISERVA)|Intestazione)\b/i;

/** Extract the intestazione section text — from its heading to the next ## heading. */
function extractIntestazioneSection(synthesis: string): string | null {
  const match = INTESTAZIONE_HEADING_RE.exec(synthesis);
  if (!match) return null;
  const start = match.index;
  // Find next "## " heading after the intestazione's start
  const nextHeading = synthesis.slice(start + match[0].length).search(/\n#{1,3}\s+\S/);
  const end = nextHeading === -1 ? synthesis.length : start + match[0].length + nextHeading;
  return synthesis.slice(start, end);
}

/** Soft equality: case-insensitive substring containment with whitespace normalization. */
function softContains(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]/g, '').trim();
  return norm(haystack).includes(norm(needle));
}

function checkHeaderCoherence(
  synthesis: string,
  context: ReportValidationContext,
): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const meta = context.periziaMetadata;
  if (!meta) return issues;

  const headerText = extractIntestazioneSection(synthesis);
  if (!headerText) return issues; // No intestazione section to validate

  const fieldsToCheck: Array<{ key: keyof typeof meta; label: string }> = [
    { key: 'tribunale', label: 'Tribunale' },
    { key: 'numeroRG', label: 'Numero R.G.' },
    { key: 'giudice', label: 'Giudice' },
    { key: 'ricorrente', label: 'Ricorrente' },
    { key: 'resistente', label: 'Resistente' },
  ];

  for (const { key, label } of fieldsToCheck) {
    const expected = meta[key];
    if (!expected || expected.trim().length === 0) continue;
    if (!softContains(headerText, expected)) {
      issues.push({
        type: 'header_mismatch',
        severity: 'error',
        message: `Intestazione non coerente con i metadati perizia: ${label} atteso "${expected}" ma non trovato nell'intestazione generata.`,
      });
    }
  }

  return issues;
}

// ── Wave 2.2: Anti-fabrication signature ─────────────────────────────
//
// Detects the specific fabrication signature from the Regnoto incident.
// We blocked-list multiple distinct invented strings (full name + CF + address
// + fake hospital + fake INAIL certs) and flag if 2+ appear together — a
// single match would false-positive on real cases (e.g. a real "Mario Bianchi"
// patient), but the joint presence is overwhelming evidence of regression
// to the negative few-shot example. Severity: error.

const FABRICATION_SIGNATURE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bMario\s+Bianchi\b/i, label: 'Mario Bianchi' },
  { pattern: /\bDott\.?\s+Marco\s+Rossi\b/i, label: 'Dott. Marco Rossi' },
  { pattern: /\bBNCMRA78C15F205Z\b/i, label: 'CF fittizio BNCMRA78C15F205Z' },
  { pattern: /\bVia\s+Roma\s+10[,\s]*20121\s+Milano\b/i, label: 'indirizzo fittizio Via Roma 10 Milano' },
  // Two separate patterns instead of "/.../is" (dotall) for ES2017 compatibility.
  // We rely on the joint-match logic at >=2 to catch the combination.
  { pattern: /\bOspedale\s+Niguarda\b/i, label: 'Niguarda (struttura fittizia)' },
  { pattern: /\b5\s+maggio\s+2023\b/i, label: '5 maggio 2023 (data fittizia)' },
  { pattern: /\b333\s*1234567\b/, label: 'telefono fittizio 333 1234567' },
];

function checkHeaderFabricationSignature(synthesis: string): ReportIssue[] {
  const matched = FABRICATION_SIGNATURE_PATTERNS
    .filter(({ pattern }) => pattern.test(synthesis))
    .map(({ label }) => label);

  if (matched.length >= 2) {
    return [{
      type: 'header_fabrication_signature',
      severity: 'error',
      message: `Rilevata signature di fabbricazione (Regnoto regression): ${matched.join(', ')}. Il modello sta riproducendo i dati del negative-few-shot anziché estrarre quelli reali. Report bloccato.`,
    }];
  }

  return [];
}

// ── A3: Centralized blocking-issue policy ────────────────────────────
//
// Single source of truth for which error-severity issues must PREVENT a report
// from being saved (caller throws → Inngest retries / regenerate fails loudly).
// Both the sectional pipeline (generate-report.ts) and the monolithic path
// (synthesis-service.ts) consume getBlockingIssues() so they agree.
//
// Excluded from blocking on purpose (error severity but caller-soft):
//  - duplicate_content / unverified_citation: dynamic heuristics with known
//    false positives (OCR ligatures, boilerplate prose). Surfaced via HRS, not
//    a hard block, to avoid retry loops on legitimate reports.

const BLOCKING_ERROR_TYPES: ReadonlySet<ReportIssue['type']> = new Set([
  'empty_report',
  'too_short',
  'missing_section',
  'broken_ocr_marker',
  'sentinel_date_leak',
  'low_event_coverage',
  'truncated_response',
  'header_mismatch',
  'header_fabrication_signature',
]);

/**
 * Filter a validation's issues down to the error-severity ones that must block
 * saving. Returns [] when the report is safe to save (warnings only).
 */
export function getBlockingIssues(validation: ReportValidation): ReportIssue[] {
  return validation.issues.filter(
    (i) => i.severity === 'error' && BLOCKING_ERROR_TYPES.has(i.type),
  );
}

/**
 * GDPR Art.9: riassunto one-line degli issue per i LOG — solo tipo + conteggio,
 * MAI il `message`. I messaggi degli issue possono citare testo clinico del report
 * (es. `unverified_citation`/`duplicate_content` includono un'anteprima della
 * citazione/blocco, quindi nomi/diagnosi) e sanitizeLogMessage redige solo
 * CF/email/telefono. I messaggi completi restano per il perito in UI/DB.
 */
export function formatIssuesForLog(issues: ReportIssue[]): string {
  if (issues.length === 0) return 'none';
  const counts = new Map<string, number>();
  for (const issue of issues) {
    counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, n]) => `${type}×${n}`)
    .join(', ');
}

// ── Sprint 2.4-A2: manual unlock (ignoreValidation) ──────────────────
//
// A validator false positive + deterministic generation can permanently kill a
// case (every retry reproduces the same blocked report). The manual unlock lets
// the perito regenerate ignoring QUALITY findings — but GDPR/fabrication leaks
// must NEVER be overridable: a report that copies few-shot names or reproduces
// the Regnoto fabrication signature cannot be saved under any circumstance.

/**
 * Explicit whitelist of issue types that remain blocking even when the perito
 * requests `ignoreValidation` (privacy/fabrication leaks, not quality).
 */
export const NON_OVERRIDABLE_ERROR_TYPES: ReadonlySet<ReportIssue['type']> = new Set([
  'sentinel_name_leak',
  'header_fabrication_signature',
]);

/**
 * Split the blocking issues of a validation into:
 *  - `overridable`: quality findings the perito may consciously ignore
 *    (the save then records validationOverridden + audit log);
 *  - `nonOverridable`: GDPR/fabrication leaks that block the save ALWAYS.
 */
export function partitionBlockingIssues(validation: ReportValidation): {
  overridable: ReportIssue[];
  nonOverridable: ReportIssue[];
} {
  const blocking = getBlockingIssues(validation);
  return {
    overridable: blocking.filter((i) => !NON_OVERRIDABLE_ERROR_TYPES.has(i.type)),
    nonOverridable: blocking.filter((i) => NON_OVERRIDABLE_ERROR_TYPES.has(i.type)),
  };
}
