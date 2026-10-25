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

app.listen(port, () => {
  logger.info({ message: 'api_listening', port });
});
