import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const VALID_ENVIRONMENTS = ['development', 'test', 'production'];
export const VALID_LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

const INSECURE_AUTH_SECRET_PLACEHOLDERS = [
  'replace_with_a_long_random_secret',
  'your_auth_secret_here',
  'nova_ai_super_secret_jwt_auth_key_2026_dev_min32chars',
  '12345678901234567890123456789012',
];

const INSECURE_API_KEY_PLACEHOLDERS = [
  'your_gemini_api_key_here',
  'xxx',
  'test',
  'your_api_key',
];

const defaultLogLevel = (process.env.NODE_ENV === 'test')
  ? 'WARN'
  : (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG');

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: (process.env.LOG_LEVEL || defaultLogLevel).toUpperCase(),
  CLIENT_URL: process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
  AI_STREAM_TIMEOUT_MS: parseInt(process.env.AI_STREAM_TIMEOUT_MS || '60000', 10),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/nova_ai',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'nova_ai',
  AUTH_SECRET: process.env.AUTH_SECRET || '',
  AUTH_EXPIRES_IN: process.env.AUTH_EXPIRES_IN || '7d',
  COOKIE_NAME: 'nova_auth_token',
  TRUST_PROXY: process.env.TRUST_PROXY === 'false' ? false : (process.env.TRUST_PROXY === 'true' ? true : parseInt(process.env.TRUST_PROXY || '1', 10)),
  SHUTDOWN_TIMEOUT_MS: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '15000', 10),

  // Phase 6 Document Processing & Safety Config
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
  MAX_USER_STORAGE_MB: parseInt(process.env.MAX_USER_STORAGE_MB || '100', 10),
  MAX_DOCUMENTS_PER_USER: parseInt(process.env.MAX_DOCUMENTS_PER_USER || '50', 10),
  MAX_EXTRACTED_TEXT_CHARS: parseInt(process.env.MAX_EXTRACTED_TEXT_CHARS || '100000', 10),
  MAX_ANALYSIS_CONTEXT_CHARS: parseInt(process.env.MAX_ANALYSIS_CONTEXT_CHARS || '50000', 10),
  MAX_INSTRUCTION_CHARS: parseInt(process.env.MAX_INSTRUCTION_CHARS || '1000', 10),
  MAX_CSV_ROWS: parseInt(process.env.MAX_CSV_ROWS || '10000', 10),
  MAX_CSV_COLUMNS: parseInt(process.env.MAX_CSV_COLUMNS || '100', 10),
  MAX_CSV_FIELD_LENGTH: parseInt(process.env.MAX_CSV_FIELD_LENGTH || '1000', 10),
  MAX_CSV_TOTAL_CELLS: parseInt(process.env.MAX_CSV_TOTAL_CELLS || '50000', 10),
  DOCUMENT_EXTRACTION_TIMEOUT_MS: parseInt(process.env.DOCUMENT_EXTRACTION_TIMEOUT_MS || '30000', 10),
  DOCUMENT_ANALYSIS_TIMEOUT_MS: parseInt(process.env.DOCUMENT_ANALYSIS_TIMEOUT_MS || '30000', 10),
  MAX_CONCURRENT_DOCUMENT_PROCESSING: parseInt(process.env.MAX_CONCURRENT_DOCUMENT_PROCESSING || '2', 10),
  STORAGE_DIR: process.env.STORAGE_DIR || 'storage/documents',

  // Phase 7 RAG & Knowledge Base Config
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'gemini-embedding-2',
  EMBEDDING_DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
  EMBEDDING_BATCH_SIZE: parseInt(process.env.EMBEDDING_BATCH_SIZE || '20', 10),
  VECTOR_STORE_TYPE: process.env.VECTOR_STORE_TYPE || 'mongodb_atlas',
  ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD: process.env.ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD === 'true',
  RAG_TOP_K: parseInt(process.env.RAG_TOP_K || '5', 10),
  RAG_NUM_CANDIDATES: parseInt(process.env.RAG_NUM_CANDIDATES || '50', 10),
  RAG_SIMILARITY_THRESHOLD: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.65'),
  MAX_CHUNKS_PER_DOCUMENT: parseInt(process.env.MAX_CHUNKS_PER_DOCUMENT || '250', 10),
  MAX_TOTAL_CHUNKS_PER_USER: parseInt(process.env.MAX_TOTAL_CHUNKS_PER_USER || '2500', 10),
  MAX_CONCURRENT_INDEXING_JOBS: parseInt(process.env.MAX_CONCURRENT_INDEXING_JOBS || '1', 10),
  MAX_RAG_CONTEXT_CHARS: parseInt(process.env.MAX_RAG_CONTEXT_CHARS || '12000', 10),
  MAX_RAG_QUERY_CHARS: parseInt(process.env.MAX_RAG_QUERY_CHARS || '500', 10),
  EMBEDDING_TIMEOUT_MS: parseInt(process.env.EMBEDDING_TIMEOUT_MS || '15000', 10),

  // Phase 8 Multimodal & Voice Config
  MULTIMODAL_ENABLED: process.env.MULTIMODAL_ENABLED !== 'false',
  MAX_IMAGE_SIZE_MB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '5', 10),
  MAX_IMAGES_PER_MESSAGE: parseInt(process.env.MAX_IMAGES_PER_MESSAGE || '3', 10),
  MAX_IMAGE_DIMENSION: parseInt(process.env.MAX_IMAGE_DIMENSION || '4096', 10),
  VOICE_INPUT_ENABLED: process.env.VOICE_INPUT_ENABLED !== 'false',
  MAX_AUDIO_SIZE_MB: parseInt(process.env.MAX_AUDIO_SIZE_MB || '10', 10),
  MAX_AUDIO_DURATION_SECONDS: parseInt(process.env.MAX_AUDIO_DURATION_SECONDS || '60', 10),
  TRANSCRIPTION_MODEL: process.env.TRANSCRIPTION_MODEL || 'gemini-3.5-transcribe',
  TTS_ENABLED: process.env.TTS_ENABLED !== 'false',
  TTS_MODEL: process.env.TTS_MODEL || 'gemini-3.1-flash-tts-preview',
  TTS_DEFAULT_VOICE: process.env.TTS_DEFAULT_VOICE || 'Aoede',
  MAX_TTS_CHARS: parseInt(process.env.MAX_TTS_CHARS || '2000', 10),
  TTS_CACHE_MAX_MB: parseInt(process.env.TTS_CACHE_MAX_MB || '50', 10),
  TTS_CACHE_TTL_SECONDS: parseInt(process.env.TTS_CACHE_TTL_SECONDS || '1800', 10),
  LIVE_VOICE_ENABLED: process.env.LIVE_VOICE_ENABLED === 'true',
  LIVE_VOICE_MODEL: process.env.LIVE_VOICE_MODEL || 'gemini-3.1-flash-live-preview',
  MAX_LIVE_SESSIONS_PER_USER: parseInt(process.env.MAX_LIVE_SESSIONS_PER_USER || '1', 10),
  MEDIA_STORAGE_DIR: process.env.MEDIA_STORAGE_DIR || 'storage/media',

  // Phase 9.3 Upload & RAM Concurrency Config
  MAX_CONCURRENT_UPLOADS: parseInt(process.env.MAX_CONCURRENT_UPLOADS || '10', 10),
  MAX_CONCURRENT_UPLOADS_PER_USER: parseInt(process.env.MAX_CONCURRENT_UPLOADS_PER_USER || '2', 10),
};

/**
 * Validates the runtime environment and configuration settings.
 * Fails fast with descriptive error messages in production on insecure or missing settings.
 * @param {object} [customEnv=ENV] - Environment configuration to validate
 */
export function validateEnv(customEnv = ENV) {
  const env = customEnv || ENV;
  const isProduction = env.NODE_ENV === 'production';

  // 1. Validate NODE_ENV
  if (!VALID_ENVIRONMENTS.includes(env.NODE_ENV)) {
    throw new Error(
      `CRITICAL CONFIG ERROR: Invalid NODE_ENV "${env.NODE_ENV}". Must be one of: ${VALID_ENVIRONMENTS.join(', ')}.`
    );
  }

  // 1b. Validate LOG_LEVEL
  if (!env.LOG_LEVEL || !VALID_LOG_LEVELS.includes(String(env.LOG_LEVEL).toUpperCase())) {
    if (isProduction) {
      throw new Error(
        `CRITICAL CONFIG ERROR: Invalid LOG_LEVEL "${env.LOG_LEVEL}". Must be one of: ${VALID_LOG_LEVELS.join(', ')}.`
      );
    } else if (env.NODE_ENV !== 'test') {
      console.warn(
        `⚠️  [CONFIG WARNING] Invalid LOG_LEVEL "${env.LOG_LEVEL}". Falling back to safe default.`
      );
    }
  }

  // 2. Validate PORT
  if (isNaN(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
    throw new Error(`CRITICAL CONFIG ERROR: PORT must be an integer between 1 and 65535 (received: ${env.PORT}).`);
  }

  // 3. Validate CLIENT_URL
  if (!env.CLIENT_URL || typeof env.CLIENT_URL !== 'string' || !env.CLIENT_URL.trim()) {
    throw new Error('CRITICAL CONFIG ERROR: CLIENT_URL must be a non-empty string.');
  }
  if (isProduction && (env.CLIENT_URL.includes('*') || env.CLIENT_URL === '*')) {
    throw new Error('CRITICAL CONFIG ERROR: Wildcard CLIENT_URL is strictly forbidden in production with credentials enabled.');
  }
  if (!env.CLIENT_URL.startsWith('http://') && !env.CLIENT_URL.startsWith('https://')) {
    throw new Error(`CRITICAL CONFIG ERROR: CLIENT_URL must start with http:// or https:// (received: ${env.CLIENT_URL}).`);
  }

  // 4. Validate MONGODB_URI
  if (!env.MONGODB_URI || typeof env.MONGODB_URI !== 'string' || !env.MONGODB_URI.trim()) {
    throw new Error('CRITICAL CONFIG ERROR: MONGODB_URI must be configured.');
  }
  if (!env.MONGODB_URI.startsWith('mongodb://') && !env.MONGODB_URI.startsWith('mongodb+srv://')) {
    throw new Error(`CRITICAL CONFIG ERROR: MONGODB_URI must start with mongodb:// or mongodb+srv://.`);
  }

  // 5. Validate AUTH_SECRET
  if (!env.AUTH_SECRET || env.AUTH_SECRET.trim().length < 32) {
    if (isProduction) {
      throw new Error(
        'CRITICAL CONFIG ERROR: AUTH_SECRET must be configured with at least 32 characters in production.'
      );
    } else if (env.NODE_ENV !== 'test') {
      console.warn(
        '⚠️  [CONFIG WARNING] AUTH_SECRET is not defined or is shorter than 32 characters.\n' +
        '   Please set a secure AUTH_SECRET in .env for reliable JWT session signing.'
      );
    }
  }

  if (isProduction && INSECURE_AUTH_SECRET_PLACEHOLDERS.includes(env.AUTH_SECRET.trim())) {
    throw new Error(
      'CRITICAL CONFIG ERROR: Insecure placeholder detected for AUTH_SECRET in production. Set a unique random secret.'
    );
  }

  // 6. Validate GEMINI_API_KEY
  if (!env.GEMINI_API_KEY || !env.GEMINI_API_KEY.trim()) {
    if (isProduction) {
      throw new Error(
        'CRITICAL CONFIG ERROR: GEMINI_API_KEY is required in production environment.'
      );
    } else if (env.NODE_ENV !== 'test') {
      console.warn(
        '⚠️  [CONFIG WARNING] GEMINI_API_KEY is not defined in environment variables.\n' +
        '   Chat requests will fail until a valid GEMINI_API_KEY is set in server/.env or .env.'
      );
    }
  }

  if (isProduction && INSECURE_API_KEY_PLACEHOLDERS.includes(env.GEMINI_API_KEY.trim())) {
    throw new Error(
      'CRITICAL CONFIG ERROR: Insecure placeholder detected for GEMINI_API_KEY in production.'
    );
  }

  // 7. Validate VECTOR_STORE_TYPE & Production Fallback Prevention
  if (!['mongodb_atlas', 'local_memory'].includes(env.VECTOR_STORE_TYPE)) {
    throw new Error(
      `CRITICAL CONFIG ERROR: Invalid VECTOR_STORE_TYPE "${env.VECTOR_STORE_TYPE}". Must be mongodb_atlas or local_memory.`
    );
  }
  if (isProduction && env.VECTOR_STORE_TYPE === 'local_memory' && !env.ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD) {
    throw new Error(
      'CRITICAL CONFIG ERROR: VECTOR_STORE_TYPE cannot be local_memory in production. Configure mongodb_atlas or set ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD=true.'
    );
  }

  // 8. Validate Numeric Security & Concurrency Limits
  const positiveIntegers = [
    ['MAX_FILE_SIZE_MB', env.MAX_FILE_SIZE_MB],
    ['MAX_USER_STORAGE_MB', env.MAX_USER_STORAGE_MB],
    ['MAX_DOCUMENTS_PER_USER', env.MAX_DOCUMENTS_PER_USER],
    ['MAX_EXTRACTED_TEXT_CHARS', env.MAX_EXTRACTED_TEXT_CHARS],
    ['MAX_ANALYSIS_CONTEXT_CHARS', env.MAX_ANALYSIS_CONTEXT_CHARS],
    ['MAX_INSTRUCTION_CHARS', env.MAX_INSTRUCTION_CHARS],
    ['MAX_CSV_ROWS', env.MAX_CSV_ROWS],
    ['MAX_CSV_COLUMNS', env.MAX_CSV_COLUMNS],
    ['MAX_CSV_FIELD_LENGTH', env.MAX_CSV_FIELD_LENGTH],
    ['MAX_CSV_TOTAL_CELLS', env.MAX_CSV_TOTAL_CELLS],
    ['DOCUMENT_EXTRACTION_TIMEOUT_MS', env.DOCUMENT_EXTRACTION_TIMEOUT_MS],
    ['DOCUMENT_ANALYSIS_TIMEOUT_MS', env.DOCUMENT_ANALYSIS_TIMEOUT_MS],
    ['MAX_CONCURRENT_DOCUMENT_PROCESSING', env.MAX_CONCURRENT_DOCUMENT_PROCESSING],
    ['EMBEDDING_DIMENSIONS', env.EMBEDDING_DIMENSIONS],
    ['EMBEDDING_BATCH_SIZE', env.EMBEDDING_BATCH_SIZE],
    ['RAG_TOP_K', env.RAG_TOP_K],
    ['RAG_NUM_CANDIDATES', env.RAG_NUM_CANDIDATES],
    ['MAX_CHUNKS_PER_DOCUMENT', env.MAX_CHUNKS_PER_DOCUMENT],
    ['MAX_TOTAL_CHUNKS_PER_USER', env.MAX_TOTAL_CHUNKS_PER_USER],
    ['MAX_CONCURRENT_INDEXING_JOBS', env.MAX_CONCURRENT_INDEXING_JOBS],
    ['MAX_RAG_CONTEXT_CHARS', env.MAX_RAG_CONTEXT_CHARS],
    ['MAX_RAG_QUERY_CHARS', env.MAX_RAG_QUERY_CHARS],
    ['EMBEDDING_TIMEOUT_MS', env.EMBEDDING_TIMEOUT_MS],
    ['MAX_IMAGE_SIZE_MB', env.MAX_IMAGE_SIZE_MB],
    ['MAX_IMAGES_PER_MESSAGE', env.MAX_IMAGES_PER_MESSAGE],
    ['MAX_IMAGE_DIMENSION', env.MAX_IMAGE_DIMENSION],
    ['MAX_AUDIO_SIZE_MB', env.MAX_AUDIO_SIZE_MB],
    ['MAX_AUDIO_DURATION_SECONDS', env.MAX_AUDIO_DURATION_SECONDS],
    ['MAX_TTS_CHARS', env.MAX_TTS_CHARS],
    ['TTS_CACHE_MAX_MB', env.TTS_CACHE_MAX_MB],
    ['TTS_CACHE_TTL_SECONDS', env.TTS_CACHE_TTL_SECONDS],
    ['MAX_CONCURRENT_UPLOADS', env.MAX_CONCURRENT_UPLOADS],
    ['MAX_CONCURRENT_UPLOADS_PER_USER', env.MAX_CONCURRENT_UPLOADS_PER_USER],
    ['SHUTDOWN_TIMEOUT_MS', env.SHUTDOWN_TIMEOUT_MS],
  ];

  for (const [name, val] of positiveIntegers) {
    if (isNaN(val) || val <= 0) {
      throw new Error(`CRITICAL CONFIG ERROR: ${name} must be a positive integer (received: ${val}).`);
    }
  }

  if (isNaN(env.RAG_SIMILARITY_THRESHOLD) || env.RAG_SIMILARITY_THRESHOLD <= 0 || env.RAG_SIMILARITY_THRESHOLD >= 1) {
    throw new Error(
      `CRITICAL CONFIG ERROR: RAG_SIMILARITY_THRESHOLD must be a float between 0 and 1 (received: ${env.RAG_SIMILARITY_THRESHOLD}).`
    );
  }
}
