import dns from 'node:dns';
import mongoose from 'mongoose';
import { ENV } from './env.js';
import { logger } from '../utils/logger.js';
import { recordDatabaseConnected, recordDatabaseError } from '../utils/metrics.js';

// Configure reliable DNS servers for Node.js c-ares resolver to ensure MongoDB Atlas
// SRV record resolution (_mongodb._tcp) succeeds on Windows and environments where local DNS returns ECONNREFUSED.
try {
  const customDns = process.env.DNS_SERVERS
    ? process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean)
    : ['8.8.8.8', '8.8.4.4'];
  if (customDns.length > 0) {
    dns.setServers(customDns);
  }
} catch (dnsErr) {
  logger.warn('database.dns_set_servers_warning', { error: dnsErr?.message || dnsErr });
}

let isConnecting = false;

/**
 * Connects to MongoDB with Mongoose and sets up lifecycle event listeners.
 * Does not crash the process on connection error, allowing health endpoints to report degraded state.
 */
export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    recordDatabaseConnected(true);
    return mongoose.connection;
  }

  if (isConnecting) {
    return;
  }

  isConnecting = true;

  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      recordDatabaseConnected(true);
      logger.info('database.connected', { database: ENV.MONGODB_DB_NAME });
      if (ENV.NODE_ENV !== 'test') {
        console.log(`🍃 [MongoDB Connected] Database: ${ENV.MONGODB_DB_NAME}`);
      }
    });

    mongoose.connection.on('disconnected', () => {
      recordDatabaseConnected(false);
      logger.warn('database.disconnected', { database: ENV.MONGODB_DB_NAME });
      if (ENV.NODE_ENV !== 'test') {
        console.warn('⚠️  [MongoDB Disconnected] Connection lost.');
      }
    });

    mongoose.connection.on('error', (err) => {
      recordDatabaseConnected(false);
      recordDatabaseError('connect');
      logger.error('database.error', { error: err, database: ENV.MONGODB_DB_NAME });
      if (ENV.NODE_ENV !== 'test') {
        console.error('🔴 [MongoDB Connection Error]:', err.message);
      }
    });

    await mongoose.connect(ENV.MONGODB_URI, {
      dbName: ENV.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 5000,
    });

    isConnecting = false;
    recordDatabaseConnected(true);
    return mongoose.connection;
  } catch (error) {
    isConnecting = false;
    recordDatabaseConnected(false);
    recordDatabaseError('connect');
    logger.error('database.initial_connection_failed', { error, database: ENV.MONGODB_DB_NAME });
    if (ENV.NODE_ENV !== 'test') {
      console.error('🔴 [MongoDB Initial Connection Failed]:', error.message);
      console.warn(
        '   The server will continue running. Operations requiring MongoDB will fail until the database is available.'
      );
    }
  }
}

/**
 * Checks if the MongoDB connection is currently established and ready.
 * @returns {boolean}
 */
export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Gracefully disconnects from MongoDB.
 */
export async function disconnectDatabase() {
  isConnecting = false;
  recordDatabaseConnected(false);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    recordDatabaseConnected(false);
    logger.info('database.disconnected_gracefully', { database: ENV.MONGODB_DB_NAME });
    if (ENV.NODE_ENV !== 'test') {
      console.log('🍃 [MongoDB Disconnected] Connection closed gracefully.');
    }
  }
}


