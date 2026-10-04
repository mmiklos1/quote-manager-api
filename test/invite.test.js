import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_NAME, inviteBody, inviteFromAddress } from '../src/invite/template.js';

test('invite body is the spec sentence', () => {
  assert.equal(APP_NAME, 'Quote Manager');
  assert.equal(
    inviteBody({ companyName: 'Acme', link: 'https://example.test/open' }),
    'Your company Acme has provisioned you an account on Quote Manager. Please click this link to open the app and sign in. https://example.test/open.',
  );
});

test('invite sender keeps the caller domain and tld', () => {
  assert.equal(
    inviteFromAddress({ domainName: 'example', tld: 'test' }),
    'provisioning@example.test',
  );
});

test('invite sender throws when the domain is unset', () => {
  assert.throws(() => inviteFromAddress({ domainName: '', tld: 'test' }), /domainName is unset/);
  assert.throws(() => inviteFromAddress({ domainName: 'example', tld: '' }), /tld is unset/);
});
