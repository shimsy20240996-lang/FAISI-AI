import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * AsyncLocalStorage instance for request-scoped correlation context.
 * Automatically scopes contextual metadata across asynchronous execution trees
 * without polluting global state or requiring explicit parameter threading.
 */
export const requestContextStore = new AsyncLocalStorage();

/**
 * Runs a function within an isolated asynchronous request context.
 * @param {object} context - Scoped request metadata
 * @param {string} context.requestId - Validated or generated UUID correlation ID
 * @param {string} context.method - HTTP method
 * @param {string} context.route - Request path or route pattern
 * @param {number} [context.startTime] - Timestamp when request was received
 * @param {Function} callback - Next middleware or async execution function
 * @returns {*}
 */
export function runWithRequestContext(context, callback) {
  return requestContextStore.run(context, callback);
}

/**
 * Retrieves the current request context safely.
 * Returns null if invoked outside an active HTTP request lifecycle.
 * @returns {object|null}
 */
export function getRequestContext() {
  return requestContextStore.getStore() || null;
}

/**
 * Retrieves the current request correlation ID safely.
 * Returns null if invoked outside an active HTTP request lifecycle.
 * @returns {string|null}
 */
export function getRequestId() {
  const context = getRequestContext();
  return context?.requestId || null;
}
