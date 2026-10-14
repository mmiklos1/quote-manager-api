import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCompanyName,
  parseCountry,
  parseEmail,
  parseSeatLimit,
} from '../scripts/insert-local-company.js';

test('company answers accept a name, a default seat, and a country code', () => {
  assert.equal(parseCompanyName('  Acme Media  '), 'Acme Media');
  assert.equal(parseCompanyName('   '), null);
  assert.equal(parseSeatLimit(''), 1);
  assert.equal(parseSeatLimit('30'), 30);
  assert.equal(parseSeatLimit('0'), null);
  assert.equal(parseSeatLimit('1.5'), null);
  assert.equal(parseCountry(''), 'US');
  assert.equal(parseCountry('gb'), 'GB');
  assert.equal(parseCountry('ZZ'), null);
  assert.equal(parseEmail(' User@Example.com '), 'user@example.com');
  assert.equal(parseEmail('   '), null);
});
