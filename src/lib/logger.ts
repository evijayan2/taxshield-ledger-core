/**
 * Structured Logger utility for TaxLedger.
 * Provides level-based structured logging for audit and production diagnostics.
 */

export interface LogPayload {
  message: string;
  context?: Record<string, unknown>;
  error?: Error | unknown;
}

/**
 * Formats structured log output as JSON string.
 */

function formatLog(level: string, payload: LogPayload): string {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: payload.message,
    ...(payload.context ? { context: payload.context } : {}),
    ...(payload.error instanceof Error ? { error: payload.error.message, stack: payload.error.stack } : {}),
  };
  return JSON.stringify(logEntry);
}

/**
 * Log informational messages.
 */
export function logInfo(message: string, context?: Record<string, unknown>): void {
  const formatted = formatLog('INFO', { message, context });
  process.stdout.write(`${formatted}\n`);
}

/**
 * Log warning messages.
 */
export function logWarn(message: string, context?: Record<string, unknown>): void {
  const formatted = formatLog('WARN', { message, context });
  process.stdout.write(`${formatted}\n`);
}

/**
 * Log error messages.
 */
export function logError(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
  const formatted = formatLog('ERROR', { message, error, context });
  process.stderr.write(`${formatted}\n`);
}
