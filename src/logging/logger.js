const REDACT_KEY = /password|passwd|hash|token|secret|authorization|cookie|link|credential/i;
const MAX_DEPTH = 8;

export function redact(value, depth = 0) {
  if (depth > MAX_DEPTH) {
    return '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const redacted = {};
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = REDACT_KEY.test(key) ? '[redacted]' : redact(item, depth + 1);
    }
    return redacted;
  }
  return value;
}

export function createLogger(write = (line) => {
  process.stdout.write(`${line}\n`);
}) {
  function emit(level, record) {
    const safe = redact(record);
    write(JSON.stringify({ time: new Date().toISOString(), level, ...safe }));
  }

  return {
    info(record) {
      emit('info', record);
    },
    warn(record) {
      emit('warn', record);
    },
    error(record) {
      emit('error', record);
    },
  };
}
