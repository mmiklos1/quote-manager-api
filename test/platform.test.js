import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalytics } from '../src/features/analytics/analytics.service.js';
import { assertPort, readConfig } from '../src/config.js';
import { ApiError } from '../src/utilities/errors.js';
import { createLogger } from '../src/utilities/logging/logger.js';

test('rejection shape is code rejected plus a class', () => {
  const error = new ApiError('bad_password');
  assert.deepEqual(error.shape, { error: { code: 'rejected', class: 'bad_password' } });
  assert.equal(error.errorClass, 'bad_password');
});

test('PORT is required and 8080 is not assumed', () => {
  assert.throws(() => assertPort(readConfig({})), /PORT is unset/);
  assert.equal(assertPort({ port: '3000' }), 3000);
});

test('LOG_LEVEL defaults to warn and keeps a named level', () => {
  assert.equal(readConfig({}).logLevel, 'warn');
  assert.equal(readConfig({ LOG_LEVEL: 'DEBUG' }).logLevel, 'debug');
  assert.equal(readConfig({ LOG_LEVEL: 'verbose' }).logLevel, 'warn');
});

test('the default log level drops info and debug', () => {
  const lines = [];
  const logger = createLogger((line) => lines.push(line));
  logger.debug({ message: 'hidden-debug' });
  logger.info({ message: 'hidden-info' });
  logger.warn({ message: 'shown' });
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.level, 'warn');
  assert.equal(record.message, 'shown');
});

test('logger redacts passwords, hashes, tokens, and links', () => {
  const lines = [];
  const logger = createLogger((line) => lines.push(line), { level: 'info' });
  logger.info({
    message: 'api_listening',
    port: 9,
    password: 'secret',
    passwordHash: 'hash',
    resetLink: 'https://reset.example/token',
    userId: 'user-1',
  });
  const record = JSON.parse(lines[0]);
  assert.equal(record.level, 'info');
  assert.equal(record.message, 'api_listening');
  assert.equal(record.port, 9);
  assert.equal(record.userId, 'user-1');
  assert.equal(record.password, '[redacted]');
  assert.equal(record.passwordHash, '[redacted]');
  assert.equal(record.resetLink, '[redacted]');
});

test('analytics keeps the four events and drops a password property', () => {
  const lines = [];
  const analytics = createAnalytics(createLogger((line) => lines.push(line), { level: 'info' }));
  analytics.loginFailed({
    method: 'password',
    userId: 'user-1',
    errorClass: 'bad_password',
    password: 'secret',
  });
  const record = JSON.parse(lines[0]);
  assert.equal(record.event, 'login_failed');
  assert.equal(record.kind, 'analytics');
  assert.equal(record.userId, 'user-1');
  assert.equal(record.password, undefined);
});

test('analytics refuses a provider this product does not have', () => {
  const lines = [];
  const analytics = createAnalytics(createLogger((line) => lines.push(line)));
  assert.throws(() => analytics.loginFailed({ method: 'apple', errorClass: 'bad_password' }));
  assert.equal(lines.length, 0);
});
