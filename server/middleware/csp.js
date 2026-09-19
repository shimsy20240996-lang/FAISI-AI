import { ENV } from '../config/env.js';

/**
 * Generates Content-Security-Policy directives for Helmet.
 * Deny-by-default, strictly allowing only what FAISI AI actually requires.
 *
 * @param {object} [customEnv=ENV] - Environment configuration override for testing
 * @returns {object} Helmet CSP directives object
 */
export function getCspDirectives(customEnv = ENV) {
  const isProduction = (customEnv.NODE_ENV || process.env.NODE_ENV) === 'production';
  const clientUrl = customEnv.CLIENT_URL || process.env.CLIENT_URL;

  // Narrow connect-src origins: 'self' + configured client origin (if distinct)
  const connectSrc = ["'self'"];
  if (clientUrl && clientUrl !== 'http://localhost:5000' && !connectSrc.includes(clientUrl)) {
    connectSrc.push(clientUrl);
  }

  // In non-production/development only, allow local Vite HMR dev sockets
  if (!isProduction) {
    connectSrc.push('ws://localhost:*', 'ws://127.0.0.1:*', 'http://localhost:*');
  }

  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    mediaSrc: ["'self'", 'blob:'],
    connectSrc,
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
  };
}
