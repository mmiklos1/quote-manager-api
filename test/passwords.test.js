import assert from 'node:assert/strict';
import test from 'node:test';
import { PASSWORD_HASH_PARAMETERS, hashPassword, verifyPassword } from '../src/passwords/hash.js';
import { passwordRejectionClass } from '../src/passwords/policy.js';

test('password rules require 8 characters, a number, and a non-letter non-number', () => {
  assert.equal(passwordRejectionClass('abcdef1!'), null);
  assert.equal(passwordRejectionClass('abcde1!'), 'password_too_short');
  assert.equal(passwordRejectionClass('abcdefg!'), 'password_missing_number');
  assert.equal(passwordRejectionClass('abcdefg1'), 'password_missing_special');
});

test('a space counts as a special character', () => {
  assert.equal(passwordRejectionClass('abcdef1 '), null);
});

test('argon2id parameters are recorded on the hasher', () => {
  assert.equal(PASSWORD_HASH_PARAMETERS.algorithm, 'argon2id');
  assert.equal(PASSWORD_HASH_PARAMETERS.memoryCost, 19456);
  assert.equal(PASSWORD_HASH_PARAMETERS.timeCost, 2);
  assert.equal(PASSWORD_HASH_PARAMETERS.parallelism, 1);
  assert.equal(PASSWORD_HASH_PARAMETERS.hashLength, 32);
});

test('hashPassword round-trips and does not store the plaintext', async () => {
  const hash = await hashPassword('abcdef1!');
  assert.equal(hash.includes('abcdef1!'), false);
  assert.equal(hash.startsWith('$argon2id$'), true);
  assert.equal(await verifyPassword(hash, 'abcdef1!'), true);
  assert.equal(await verifyPassword(hash, 'abcdef2!'), false);
});
