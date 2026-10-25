import { getHealthStatus, getHeartbeatMetadata } from './health.service.js';

export function createHealthController({ databaseReady = false } = {}) {
  return {
    health(_req, res) {
      res.status(200).type('text/plain').send(getHealthStatus());
    },
    heartbeat(_req, res) {
      res.status(200).json(getHeartbeatMetadata({ databaseReady }));
    },
  };
}
