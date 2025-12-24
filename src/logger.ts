/**
 * Simple Logger Utility
 *
 * Provides structured logging with configurable log levels.
 * Set log level via NODE_DOCTOR_LOG_LEVEL environment variable.
 *
 * Levels: debug < info < warn < error
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Get the current log level from environment or default to 'info'
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.NODE_DOCTOR_LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return 'info';
}

let currentLevel: LogLevel = getLogLevelFromEnv();

/**
 * Set the current log level programmatically
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Check if a given level should be logged based on current level
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Format a log message with timestamp and level prefix
 */
function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  const prefix = level.toUpperCase().padEnd(5);
  return `[${timestamp}] [${prefix}] ${message}`;
}

/**
 * Core log function
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (!shouldLog(level)) {
    return;
  }

  const formattedMessage = formatMessage(level, message);

  switch (level) {
    case 'debug':
      console.log(formattedMessage, ...args);
      break;
    case 'info':
      console.log(formattedMessage, ...args);
      break;
    case 'warn':
      console.warn(formattedMessage, ...args);
      break;
    case 'error':
      console.error(formattedMessage, ...args);
      break;
  }
}

/**
 * Logger object with methods for each log level
 */
export const logger = {
  debug: (message: string, ...args: unknown[]): void => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]): void => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]): void => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]): void => log('error', message, ...args),

  /**
   * Check if debug logging is enabled (useful for expensive debug operations)
   */
  isDebugEnabled: (): boolean => shouldLog('debug'),
};

export default logger;

