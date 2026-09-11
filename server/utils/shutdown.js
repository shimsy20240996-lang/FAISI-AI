import { ENV } from '../config/env.js';
import { logger } from './logger.js';

let isShuttingDown = false;
let activeShutdownPromise = null;

/**
 * Returns true if the application has initiated graceful shutdown.
 * Used by readiness probes (/api/ready) to return 503 during draining.
 * @returns {boolean}
 */
export function isAppShuttingDown() {
  return isShuttingDown;
}

/**
 * Resets shutdown state (strictly for testing).
 */
export function resetShutdownStateForTesting() {
  isShuttingDown = false;
  activeShutdownPromise = null;
}

/**
 * Creates an idempotent graceful shutdown execution handler.
 * @param {object} options
 * @param {import('http').Server} [options.server] - Node.js HTTP server instance
 * @param {Function} [options.disconnectDatabase] - Database disconnect function
 * @param {number} [options.timeoutMs] - Maximum grace period before forced connection termination
 * @param {boolean} [options.exitProcess=true] - Whether to call process.exit at the end
 * @returns {(signal: string, exitCode?: number) => Promise<void>}
 */
export function createGracefulShutdownHandler({
  server,
  disconnectDatabase,
  timeoutMs = ENV.SHUTDOWN_TIMEOUT_MS || 15000,
  exitProcess = true,
} = {}) {
  return async function handleShutdown(signal = 'SIGTERM', exitCode = 0) {
    if (activeShutdownPromise) {
      return activeShutdownPromise;
    }

    isShuttingDown = true;

    activeShutdownPromise = (async () => {
      logger.info('server.shutdown.started', { signal, timeoutMs });
      if (ENV.NODE_ENV !== 'test') {
        console.log(`\n🛑 [Shutdown] Received ${signal}. Initiating graceful shutdown (timeout: ${timeoutMs}ms)...`);
      }

      let forceCloseTimer = null;

      // Timeout watchdog: If connections do not drain within grace period, force close
      const timeoutPromise = new Promise((resolve) => {
        forceCloseTimer = setTimeout(() => {
          logger.warn('server.shutdown.timeout', { timeoutMs });
          if (ENV.NODE_ENV !== 'test') {
            console.warn('⚠️  [Shutdown] Grace period expired. Forcibly closing active connections.');
          }
          if (server && typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
          }
          resolve();
        }, timeoutMs);
        if (typeof forceCloseTimer.unref === 'function') {
          forceCloseTimer.unref();
        }
      });

      // 1. Close HTTP Server (stop accepting new requests)
      const serverClosePromise = new Promise((resolve) => {
        if (!server || !server.listening) {
          return resolve();
        }
        server.close((err) => {
          if (err) {
            logger.warn('server.shutdown.server_close_notice', { error: err });
            if (ENV.NODE_ENV !== 'test') {
              console.warn('⚠️  [Shutdown] HTTP server close notice:', err.message);
            }
          }
          resolve();
        });
      });

      // Wait for server to close or timeout
      await Promise.race([serverClosePromise, timeoutPromise]);

      if (forceCloseTimer) {
        clearTimeout(forceCloseTimer);
      }

      // 2. Disconnect Database cleanly
      if (typeof disconnectDatabase === 'function') {
        try {
          await disconnectDatabase();
        } catch (dbErr) {
          logger.error('server.shutdown.database_error', { error: dbErr });
          if (ENV.NODE_ENV !== 'test') {
            console.error('🔴 [Shutdown] Error disconnecting database:', dbErr.message);
          }
        }
      }

      logger.info('server.shutdown.completed', { signal, exitCode });
      if (ENV.NODE_ENV !== 'test') {
        console.log('✅ [Shutdown] Resources cleaned up. Server stopped safely.');
      }

      if (exitProcess && process.env.NODE_ENV !== 'test') {
        process.exit(exitCode);
      }
    })();

    return activeShutdownPromise;
  };
}

/**
 * Registers standard process-level signal listeners and exception safety nets.
 * @param {object} options
 * @param {import('http').Server} options.server
 * @param {Function} options.disconnectDatabase
 */
export function setupProcessSignalHandlers({ server, disconnectDatabase }) {
  const shutdown = createGracefulShutdownHandler({
    server,
    disconnectDatabase,
    timeoutMs: ENV.SHUTDOWN_TIMEOUT_MS,
    exitProcess: true,
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM', 0);
  });

  process.on('SIGINT', () => {
    shutdown('SIGINT', 0);
  });

  process.on('uncaughtException', (error) => {
    logger.error('process.uncaught_exception', { error });
    if (ENV.NODE_ENV !== 'test') {
      console.error('🔴 [FATAL: Uncaught Exception]:', error?.message || error);
    }
    shutdown('uncaughtException', 1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.warn('process.unhandled_rejection', { error: reason instanceof Error ? reason : new Error(String(reason)) });
    if (ENV.NODE_ENV !== 'test') {
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error('⚠️  [Unhandled Rejection]:', message);
    }
  });
}

