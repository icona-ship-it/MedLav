/**
 * Structured logger with configurable levels.
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

function getCurrentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (env in LEVEL_PRIORITY) return env as LogLevel;
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getCurrentLevel()];
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  return `[${tag}] ${message}`;
}

export const logger = {
  debug(tag: string, message: string): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', tag, message));
    }
  },

  info(tag: string, message: string): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', tag, message));
    }
  },

  warn(tag: string, message: string): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', tag, message));
    }
  },

  error(tag: string, message: string): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', tag, message));
    }
  },
};
