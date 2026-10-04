import 'dotenv/config';
import { createApp } from './app.js';
import { assertPort, readConfig } from './config.js';
import { createPrismaClient } from './db/client.js';
import { createLogger } from './logging/logger.js';

const config = readConfig();
const port = assertPort(config);
const logger = createLogger();
const database = config.databaseUrl ? createPrismaClient(config.databaseUrl) : null;
const app = createApp({ prisma: database?.prisma, config, logger });

app.listen(port, () => {
  logger.info({ message: 'api_listening', port });
});
