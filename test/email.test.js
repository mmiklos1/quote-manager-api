import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, ErrorClass } from '../src/errors.js';
import { normalizeEmail } from '../src/identity/email.js';

test('normalizeEmail trims and lowercases the whole address', () => {
  assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
});

test('normalizeEmail keeps plus-tags and does not rewrite the domain', () => {
  assert.equal(normalizeEmail('Ada+Desk@Example.com'), 'ada+desk@example.com');
});

test('normalizeEmail rejects an empty address', () => {
  assert.throws(() => normalizeEmail('   '), (error) => {
    assert.equal(error.errorClass, 'invalid_email');
    return true;
  });
});

test('normalizeEmail rejects a non-string', () => {
  assert.throws(() => normalizeEmail(null), ApiError);
  assert.equal(ErrorClass.invalidEmail, 'invalid_email');
});
