/**
 * Anonymous Client Identifier Utility
 * Generates and caches a persistent anonymous browser identifier in localStorage.
 * Used for anonymous conversation isolation across sessions in Phase 4 (prior to Phase 5 Authentication).
 * NOTE: This is an anonymous isolation key, NOT security/authentication.
 */

const CLIENT_ID_KEY = 'nova_client_id';

export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `nova-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch (e) {
    console.warn('Could not access localStorage for clientId, using fallback session ID', e);
    return `session-${Date.now()}`;
  }
}

export default getClientId;
