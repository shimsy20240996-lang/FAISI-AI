/**
 * Application Constants
 * Core configuration, phase metadata, and default starter threads for FAISI AI.
 */

export const APP_CONFIG = {
  NAME: 'FAISI AI',
  VERSION: '0.3.0',
  CURRENT_PHASE: 'Phase 3 — Streaming + Conversation Engine',
  STATUS: 'Live SSE Streaming',
  MODEL: 'gemini-3.6-flash',
  ENVIRONMENT: import.meta.env.MODE || 'development',
};

export const API_CONFIG = {
  BASE_URL: '/api',
  TIMEOUT: 60000,
};

/**
 * Initial starter conversations for demonstration in Phase 3
 */
export const INITIAL_CONVERSATIONS = [
  {
    id: 'conv-1',
    title: 'New Exploration',
    group: 'Today',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
