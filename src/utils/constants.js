/**
 * Application Constants
 * Core configuration, phase metadata, and default starter threads for SABU AI.
 */

export const APP_CONFIG = {
  NAME: 'SABU AI',
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
    title: 'Quantum Computing Principles',
    group: 'Today',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-2',
    title: 'Python Data Structures Roadmap',
    group: 'Yesterday',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-3',
    title: 'Sustainable Tech Startup Ideas',
    group: 'Previous 7 Days',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
