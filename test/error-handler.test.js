import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, ErrorClass } from '../src/utilities/errors.js';
import { createErrorHandler } from '../src/utilities/http/error-handler.js';
import { createLogger } from '../src/utilities/logging/logger.js';

function runHandler(error, { level = 'debug' } = {}) {
  const lines = [];
  const logger = createLogger((line) => lines.push(line), { level });
  const analytics = {
    loginFailed(props) {
      analytics.calls.push(props);
    },
    calls: [],
  };
  const handler = createErrorHandler({ analytics, logger });
  let status;
  let body;
  const res = {
    headersSent: false,
    setHeader() {},
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  handler(error, { method: 'POST', originalUrl: '/api/v1/login' }, res, () => {
    throw new Error('next should not run');
  });
  return {
    status,
    body,
    records: lines.map((line) => JSON.parse(line)),
    analyticsCalls: analytics.calls,
  };
}

test('unexpected failures log name, message, stack, and path', () => {
  const result = runHandler(new Error('JWT_SIGNING_KEY must be set and at least 32 characters. It is not committed.'));
  assert.equal(result.status, 500);
  assert.equal(result.body.error.class, 'internal');
  const record = result.records.find((row) => row.message === 'request_failed');
  assert.equal(record.level, 'error');
  assert.equal(record.method, 'POST');
  assert.equal(record.path, '/api/v1/login');
  assert.equal(record.errName, 'Error');
  assert.match(record.errMessage, /JWT_SIGNING_KEY/);
  assert.match(record.errStack, /Error: JWT_SIGNING_KEY/);
});

test('api rejections log the class and emit analytics metadata', () => {
  const error = new ApiError(ErrorClass.invalidCredentials, 'Invalid email or password', {
    method: 'password',
    errorClass: ErrorClass.badPassword,
  });
  const result = runHandler(error);
  assert.equal(result.status, 401);
  const record = result.records.find((row) => row.message === 'request_rejected');
  assert.equal(record.errorClass, 'invalid_credentials');
  assert.equal(record.status, 401);
  assert.deepEqual(result.analyticsCalls, [{
    method: 'password',
    errorClass: 'bad_password',
  }]);
});
