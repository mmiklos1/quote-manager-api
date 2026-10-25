import 'dotenv/config';
import { createApp } from './app.js';
import { assertPort, readConfig } from './config.js';
import { createPrismaClient } from './utilities/db/client.js';
import { createLogger } from './utilities/logging/logger.js';

const config = readConfig();
const port = assertPort(config);
const logger = createLogger(undefined, { level: config.logLevel });
const database = config.databaseUrl ? createPrismaClient(config.databaseUrl) : null;
const app = createApp({ prisma: database?.prisma, config, logger });

const server = app.listen(port);

server.on('listening', () => {
  logger.info({ message: 'api_listening', port });
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error({ message: 'port_in_use', port });
  } else {
    logger.error({ message: 'listen_failed', err: error.message });
  }
  process.exitCode = 1;
});
