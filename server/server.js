import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { ENV, validateEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import { documentRoutes } from './routes/documentRoutes.js';
import { ragRoutes } from './routes/ragRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import metricsRoutes from './routes/metricsRoutes.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getCspDirectives } from './middleware/csp.js';
import { isAppShuttingDown, setupProcessSignalHandlers } from './utils/shutdown.js';
import { logger } from './utils/logger.js';
import { httpMetricsMiddleware } from './utils/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

validateEnv();

// Initialize MongoDB connection
connectDatabase();

const app = express();

// Trust reverse proxy for client IP and secure cookies
if (ENV.TRUST_PROXY !== false) {
  app.set('trust proxy', ENV.TRUST_PROXY);
}

// Security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: getCspDirectives(),
    },
    crossOriginEmbedderPolicy: false,
  })
);

// Serve static frontend assets if dist exists (Option A: Same-Origin Deployment)
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// CORS configuration restricted to configured client origin with credentials enabled (scoped to /api routes)
const corsOptionsDelegate = (req, callback) => {
  const origin = req.headers.origin;
  if (!origin) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-client-id', 'x-request-id', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id'],
    });
  }

  const cleanOrigin = origin.replace(/\/+$/, '').toLowerCase();
  const cleanClientUrl = (ENV.CLIENT_URL || '').replace(/\/+$/, '').toLowerCase();
  const renderUrl = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '').toLowerCase();
  const host = req.headers.host;
  const sameOriginHttp = host ? `http://${host}`.toLowerCase() : null;
  const sameOriginHttps = host ? `https://${host}`.toLowerCase() : null;

  const isAllowed =
    cleanOrigin === cleanClientUrl ||
    (renderUrl && cleanOrigin === renderUrl) ||
    (sameOriginHttp && cleanOrigin === sameOriginHttp) ||
    (sameOriginHttps && cleanOrigin === sameOriginHttps) ||
    (ENV.NODE_ENV !== 'production' && (cleanOrigin.startsWith('http://localhost:') || cleanOrigin.startsWith('http://127.0.0.1:')));

  if (isAllowed) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-client-id', 'x-request-id', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id'],
    });
  }

  return callback(new Error(`CORS blocked for unauthorized origin: ${origin}`));
};
app.use('/api', cors(corsOptionsDelegate));

// Request Correlation & Async Context Foundation
app.use(requestIdMiddleware);

// HTTP Metrics Instrumentation & Request Logger
app.use(httpMetricsMiddleware);
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    logger.info('http.request.completed', {
      method: req.method,
      route: req.route?.path || req.path || req.originalUrl || '',
      status: res.statusCode,
      statusClass,
      durationMs,
    });
  });
  next();
});

// HTTP-only Cookie Parser
app.use(cookieParser());

// JSON body parser with safe payload limit
app.use(express.json({ limit: '1mb' }));

// Safe Health & Liveness Check Endpoint (never exposes secrets, keys, or paths)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: '0.8.1',
    environment: ENV.NODE_ENV,
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Safe Readiness Probe Endpoint (returns 200 when ready to accept traffic, 503 if DB disconnected or shutting down)
app.get('/api/ready', (req, res) => {
  if (isAppShuttingDown()) {
    return res.status(503).json({
      status: 'shutting_down',
      ready: false,
      message: 'Server is undergoing graceful shutdown.',
      timestamp: new Date().toISOString(),
    });
  }

  const dbConnected = isDatabaseConnected();
  if (!dbConnected) {
    return res.status(503).json({
      status: 'not_ready',
      ready: false,
      database: 'disconnected',
      message: 'Database connection is unavailable.',
      timestamp: new Date().toISOString(),
    });
  }

  res.status(200).json({
    status: 'ok',
    ready: true,
    version: '0.8.1',
    environment: ENV.NODE_ENV,
    database: 'connected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/metrics', metricsRoutes);

// Catch-all handler: API routes return JSON 404; non-API GET routes fall back to SPA index.html
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/api') {
    return res.status(404).json({
      success: false,
      error: {
        message: `Resource not found: ${req.method} ${req.originalUrl}`,
        code: 'NOT_FOUND',
      },
    });
  }

  // Missing static asset requests return clean 404 instead of SPA HTML/JSON
  if (req.path.startsWith('/assets/')) {
    return res.status(404).type('text/plain').send('Asset not found');
  }

  const indexPath = path.join(distPath, 'index.html');
  if (req.method === 'GET' && existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res.status(404).json({
    success: false,
    error: {
      message: `Resource not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    },
  });
});

// Global Error Handler
app.use(errorHandler);

const server = app.listen(ENV.PORT, '0.0.0.0', () => {
  logger.info('server.started', {
    port: ENV.PORT,
    model: ENV.GEMINI_MODEL,
    clientUrl: ENV.CLIENT_URL,
    environment: ENV.NODE_ENV,
  });
  if (ENV.NODE_ENV !== 'test') {
    console.log(`🚀 [SABU AI Server] Running on http://0.0.0.0:${ENV.PORT}`);
    console.log(`   Model: ${ENV.GEMINI_MODEL}`);
    console.log(`   Client URL: ${ENV.CLIENT_URL}`);
  }
});

// Register graceful shutdown and process-level signal/exception handlers
setupProcessSignalHandlers({ server, disconnectDatabase });

export default app;
