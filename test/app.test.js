import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/utilities/logging/logger.js';

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

test('app middleware logs every incoming request before routes run', async () => {
  const lines = [];
  const logger = createLogger((line) => lines.push(line), { level: 'debug' });
  const app = createApp({ logger });
  const server = createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/missing?token=secret`, {
      method: 'POST',
    });
    assert.equal(response.status, 404);
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.level, 'debug');
    assert.equal(record.message, 'request');
    assert.equal(record.method, 'POST');
    assert.equal(record.path, '/api/v1/missing');
    assert.equal(typeof record.ip, 'string');
    assert.notEqual(record.ip, '');
    assert.equal(lines.join('\n').includes('secret'), false);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('health returns ok and heartbeat includes version metadata', async () => {
  const app = createApp();
  const server = createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  try {
    for (const prefix of ['', '/api/v1']) {
      const health = await fetch(`http://127.0.0.1:${address.port}${prefix}/health`);
      assert.equal(health.status, 200);
      assert.equal(await health.text(), 'ok');

      const heartbeat = await fetch(`http://127.0.0.1:${address.port}${prefix}/heartbeat`);
      assert.equal(heartbeat.status, 200);
      const body = await heartbeat.json();
      assert.equal(body.status, 'ok');
      assert.equal(body.version, 'v0.0.1');
      assert.equal(typeof body.uptimeSeconds, 'number');
      assert.equal(body.health.service, 'ok');
      assert.equal(body.health.database, 'unavailable');
    }
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

test('login and authenticate stay unmounted until a database is configured', async () => {
  for (const path of ['/api/v1/login', '/api/v1/authenticate']) {
    const response = await request(path);
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: { code: 'rejected', class: 'not_found' } });
  }
});
