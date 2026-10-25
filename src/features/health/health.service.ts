const SERVICE_VERSION = 'v0.0.1';
const startedAt = Date.now();

export function getHealthStatus() {
  return 'ok';
}

export function getHeartbeatMetadata({ databaseReady = false } = {}) {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  return {
    status: 'ok',
    version: SERVICE_VERSION,
    uptimeSeconds,
    health: {
      service: 'ok',
      database: databaseReady ? 'ok' : 'unavailable',
    },
  };
}
