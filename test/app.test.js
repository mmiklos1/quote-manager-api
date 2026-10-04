import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';

async function request(path) {
  const app = createApp();
  const server = createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST' });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
}

test('named auth routes are not mounted', async () => {
  for (const path of ['/api/v1/login', '/api/v1/authenticate']) {
    const response = await request(path);
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: { code: 'rejected', class: 'not_found' } });
  }
});
