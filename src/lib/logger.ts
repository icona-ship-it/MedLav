/**
 * Structured logger with configurable levels.
 * - Production (NODE_ENV === 'production'): JSON output for log aggregation
 * - Development: human-readable format
 * Reads LOG_LEVEL from env (debug | info | warn | error). Defaults to 'info'.
 * GDPR: Never log patient names, diagnoses, or clinical data — only IDs/codes.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  level: LogLevel;
  tag: string;
  message: string;
  timestamp: string;
  requestId?: string;
  [key: string]: unknown;
}

interface Logger {
  debug(tag: string, message: string, metadata?: Record<string, unknown>): void;
  info(tag: string, message: string, metadata?: Record<string, unknown>): void;
  warn(tag: string, message: string, metadata?: Record<string, unknown>): void;
  error(tag: string, message: string, metadata?: Record<string, unknown>): void;
  withRequestId(id: string): Logger;
}

function getCurrentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (env in LEVEL_PRIORITY) return env as LogLevel;
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getCurrentLevel()];
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// ── GDPR Art. 9 log sanitization ─────────────────────────────────────

const SANITIZE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Italian fiscal code (Codice Fiscale): RSSMRA85M01H501Z
  { regex: /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi, replacement: '[CF_REDACTED]' },
  // Email addresses
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
  // Italian phone numbers (+39, 0x, 3x)
  { regex: /(?:\+39\s?)?(?:0\d{1,4}[\s.-]?\d{4,8}|3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/g, replacement: '[PHONE_REDACTED]' },
];

/**
 * Sanitize a log message by redacting PII patterns (CF, email, phone).
 * Exported for reuse in Sentry beforeSend hooks.
 */
export function sanitizeLogMessage(message: string): string {
  let result = message;
  for (const { regex, replacement } of SANITIZE_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

function formatDevMessage(tag: string, message: string, metadata?: Record<string, unknown>): string {
  const base = `[${tag}] ${message}`;
  if (metadata && Object.keys(metadata).length > 0) {
    return `${base} ${JSON.stringify(metadata)}`;
  }
  return base;
}

function formatJsonEntry(
  level: LogLevel,
  tag: string,
  message: string,
  requestId?: string,
  metadata?: Record<string, unknown>,
): string {
  const entry: LogEntry = {
    level,
    tag,
    message,
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
    ...(metadata ?? {}),
  };
  return JSON.stringify(entry);
}

const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

function createLogger(requestId?: string): Logger {
  function log(
    level: LogLevel,
    tag: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (!shouldLog(level)) return;

    const sanitized = sanitizeLogMessage(message);
    const method = CONSOLE_METHOD[level];
    if (isProduction()) {
      console[method](formatJsonEntry(level, tag, sanitized, requestId, metadata));
    } else {
      console[method](formatDevMessage(tag, sanitized, metadata));
    }
  }

  return {
    debug(tag: string, message: string, metadata?: Record<string, unknown>): void {
      log('debug', tag, message, metadata);
    },
    info(tag: string, message: string, metadata?: Record<string, unknown>): void {
      log('info', tag, message, metadata);
    },
    warn(tag: string, message: string, metadata?: Record<string, unknown>): void {
      log('warn', tag, message, metadata);
    },
    error(tag: string, message: string, metadata?: Record<string, unknown>): void {
      log('error', tag, message, metadata);
    },
    withRequestId(id: string): Logger {
      return createLogger(id);
    },
  };
}

export const logger: Logger = createLogger();

export type { Logger, LogLevel, LogEntry };
