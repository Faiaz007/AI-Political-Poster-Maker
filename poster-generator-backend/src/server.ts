import type { Server } from 'node:http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './utils/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info('API listening', { port: env.PORT, env: env.NODE_ENV, pid: process.pid });
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Shutdown requested', { signal });

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async () => {
      try {
        await disconnectDatabase();
      } catch (error) {
        logger.error('Error while closing database connection', { message: (error as Error).message });
      }
      clearTimeout(forceExit);
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state. Log it loudly
  // so it is visible, but keep serving — the alternative is a crash loop.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception, exiting', { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

main().catch((error: Error) => {
  logger.error('Failed to start server', { message: error.message, stack: error.stack });
  process.exit(1);
});
