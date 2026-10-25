import { Writable } from 'node:stream';
import pino from 'pino';

const REDACT_KEY = /password|passwd|hash|token|secret|authorization|cookie|link|credential/i;
const MAX_DEPTH = 8;

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Logger = {
  fatal(record: unknown): void;
  error(record: unknown): void;
  warn(record: unknown): void;
  info(record: unknown): void;
  debug(record: unknown): void;
  trace(record: unknown): void;
  level: LogLevel;
};

export function normalizeLogLevel(level: unknown): LogLevel {
  const value = typeof level === 'string' ? level.trim().toLowerCase() : '';
  if ((LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  return 'warn';
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const redacted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = REDACT_KEY.test(key) ? '[redacted]' : redact(item, depth + 1);
    }
    return redacted;
  }
  return value;
}

function writerStream(write: (line: string) => void) {
  return new Writable({
    write(chunk, _encoding, callback) {
      write(chunk.toString());
      callback();
    },
  });
}

/**
 * Pino JSON logger. Level defaults to warn. Secret-like keys are replaced
 * before the line is written.
 */
export function createLogger(
  write?: (line: string) => void,
  { level = 'warn' }: { level?: string } = {},
): Logger {
  const resolvedLevel = normalizeLogLevel(level);
  const options = {
    level: resolvedLevel,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  };
  const destination = typeof write === 'function' ? writerStream(write) : undefined;
  const logger = destination ? pino(options, destination) : pino(options);

  function emit(method: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace', record: unknown) {
    const payload = record && typeof record === 'object'
      ? redact(record)
      : { message: String(record ?? '') };
    logger[method](payload as object);
  }

  return {
    fatal(record) {
      emit('fatal', record);
    },
    error(record) {
      emit('error', record);
    },
    warn(record) {
      emit('warn', record);
    },
    info(record) {
      emit('info', record);
    },
    debug(record) {
      emit('debug', record);
    },
    trace(record) {
      emit('trace', record);
    },
    level: resolvedLevel,
  };
}
