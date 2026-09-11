/**
 * NOVA AI — Frontend API Client (Phase 5)
 * Securely communicates with the NOVA Express backend and MongoDB persistence layer.
 * All authenticated requests use credentials: 'include' for secure HTTP-only cookie transmission.
 * Zero AI API keys, MongoDB credentials, or JWT tokens are stored or handled on the client.
 */

import { getClientId } from '../utils/clientId';

/**
 * Helper to build standard request headers including x-client-id.
 */
function getHeaders(customHeaders = {}) {
  return {
    'Content-Type': 'application/json',
    'x-client-id': getClientId(),
    ...customHeaders,
  };
}

/* ==========================================================================
   AUTHENTICATION API (HTTP-only Cookie Session)
   ========================================================================== */

/**
 * Registers a new user account.
 * Sets the secure HTTP-only cookie on success.
 * @param {{ email: string, password: string, displayName: string }} data
 * @returns {Promise<any>}
 */
export async function apiRegister({ email, password, displayName }) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ email, password, displayName }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Registration failed (${response.status})`);
  }

  return data.user;
}

/**
 * Authenticates user credentials and establishes HTTP-only cookie session.
 * @param {{ email: string, password: string }} data
 * @returns {Promise<any>}
 */
export async function apiLogin({ email, password }) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Invalid email or password.');
  }

  return data.user;
}

/**
 * Logs out the user and clears the HTTP-only cookie.
 * @returns {Promise<{ success: boolean }>}
 */
export async function apiLogout() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Logout failed');
  }

  return data;
}

/**
 * Retrieves the currently authenticated user from the active HTTP-only session.
 * @returns {Promise<any>}
 */
export async function apiGetMe() {
  const response = await fetch('/api/auth/me', {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.user || null;
}

/**
 * Claims anonymous conversations created on this browser and assigns them to the current user.
 * @returns {Promise<{ success: boolean, claimedCount: number, totalCount: number }>}
 */
export async function apiClaimConversations() {
  const response = await fetch('/api/conversations/claim', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ clientId: getClientId() }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to claim local conversations');
  }

  return data;
}

/**
 * Checks count of unclaimed anonymous conversations for this browser.
 * @returns {Promise<number>}
 */
export async function apiGetUnclaimedCount() {
  try {
    const response = await fetch('/api/conversations/unclaimed-count', {
      headers: getHeaders(),
      credentials: 'include',
    });

    if (!response.ok) return 0;
    const data = await response.json();
    return data.unclaimedCount || 0;
  } catch {
    return 0;
  }
}

/* ==========================================================================
   CONVERSATION CRUD & SEARCH API (User-Owned)
   ========================================================================== */

/**
 * Fetches all persistent conversations owned by the authenticated user.
 * @param {number} [limit=50]
 * @param {number} [skip=0]
 * @returns {Promise<Array<any>>}
 */
export async function getConversations(limit = 50, skip = 0) {
  const response = await fetch(`/api/conversations?limit=${limit}&skip=${skip}`, {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Failed to fetch conversations (${response.status})`);
  }

  const data = await response.json();
  return data.conversations || [];
}

/**
 * Creates a new user-owned conversation in MongoDB.
 * @param {string} [title='New Exploration']
 * @returns {Promise<any>}
 */
export async function createConversation(title = 'New Exploration') {
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to create conversation');
  }

  const data = await response.json();
  return data.conversation;
}

/**
 * Retrieves a single conversation by ID including its messages (enforces ownership).
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function getConversation(id) {
  const response = await fetch(`/api/conversations/${id}`, {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to load conversation');
  }

  const data = await response.json();
  return data.conversation;
}

/**
 * Renames a conversation title in MongoDB (enforces ownership).
 * @param {string} id
 * @param {string} title
 * @returns {Promise<any>}
 */
export async function renameConversation(id, title) {
  const response = await fetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to rename conversation');
  }

  const data = await response.json();
  return data.conversation;
}

/**
 * Deletes a conversation from MongoDB (enforces ownership).
 * @param {string} id
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteConversation(id) {
  const response = await fetch(`/api/conversations/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to delete conversation');
  }

  return await response.json();
}

/**
 * Searches user's conversations by title and message contents.
 * @param {string} query
 * @returns {Promise<Array<any>>}
 */
export async function searchConversations(query) {
  if (!query || !query.trim()) return [];

  const response = await fetch(`/api/conversations/search?q=${encodeURIComponent(query.trim())}`, {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Search failed');
  }

  const data = await response.json();
  return data.conversations || [];
}

/**
 * Initiates a progressive Server-Sent Events (SSE) stream for live chat completions and persists turns to MongoDB.
 * @param {{
 *   messages: Array<{ role: 'user' | 'assistant', content: string }>,
 *   conversationId?: string,
 *   isRegenerate?: boolean,
 *   systemInstruction?: string,
 * }} payload
 * @param {{
 *   onChunk: (text: string) => void,
 *   onComplete: () => void,
 *   onError: (error: Error) => void,
 * }} callbacks
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export async function streamChatMessage(
  payload,
  { onChunk, onSources, onComplete, onError },
  signal
) {
  try {
    const bodyPayload = Array.isArray(payload) ? { messages: payload } : payload;

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(bodyPayload),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg =
        errorData?.error?.message ||
        `Streaming request failed with status ${response.status}`;
      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEventType = null;

    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return;
      }

      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event:')) {
          currentEventType = trimmed.slice(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (currentEventType === 'rag_sources' && event.sources) {
              if (typeof onSources === 'function') {
                onSources(event.sources);
              }
              currentEventType = null;
            } else if (event.type === 'chunk' && event.text) {
              onChunk(event.text);
            } else if (event.type === 'done') {
              onComplete();
            } else if (event.type === 'error') {
              onError(new Error(event.message || 'Stream generation error.'));
            }
          } catch (parseErr) {
            console.warn('Could not parse SSE payload:', jsonStr, parseErr);
          }
        }
      }
    }

    onComplete();
  } catch (err) {
    if (signal?.aborted || err.name === 'AbortError') {
      return;
    }
    onError(err);
  }
}

/**
 * Checks backend health and database status.
 * @returns {Promise<{ success: boolean, service: string, status: string, aiConfigured: boolean, database: string, model: string, version: string }>}
 */
export async function checkBackendHealth() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) return { success: false, status: 'offline', aiConfigured: false, database: 'disconnected' };
    return await response.json();
  } catch (err) {
    return { success: false, status: 'offline', aiConfigured: false, database: 'disconnected', error: err.message };
  }
}

/* ==========================================================================
   DOCUMENT MANAGEMENT & ANALYSIS API (Phase 6)
   ========================================================================== */

/**
 * Uploads a document (PDF, DOCX, TXT, CSV) to the secure server.
 * @param {File} file
 * @returns {Promise<{ success: boolean, document: any, isDuplicate: boolean, message: string }>}
 */
export async function apiUploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/documents', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'x-client-id': getClientId(),
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Upload failed (${response.status})`);
  }

  return data;
}

/**
 * Retrieves list of documents owned by the authenticated user.
 * @param {number} [limit=50]
 * @param {number} [skip=0]
 * @returns {Promise<{ documents: Array<any>, total: number }>}
 */
export async function apiGetDocuments(limit = 50, skip = 0) {
  const response = await fetch(`/api/documents?limit=${limit}&skip=${skip}`, {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to fetch documents');
  }

  const data = await response.json();
  return {
    documents: data.documents || [],
    total: data.total || 0,
  };
}

/**
 * Retrieves metadata for a single document.
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function apiGetDocument(id) {
  const response = await fetch(`/api/documents/${id}`, {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to fetch document');
  }

  const data = await response.json();
  return data.document;
}

/**
 * Retrieves extracted text and structured preview content for a document.
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function apiGetDocumentContent(id) {
  const response = await fetch(`/api/documents/${id}/content`, {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to fetch document content');
  }

  const data = await response.json();
  return data.content;
}

/**
 * Submits an analysis instruction for a document to the Gemini AI pipeline.
 * @param {string} id
 * @param {string} [instruction]
 * @returns {Promise<{ documentId: string, documentName: string, analysis: { role: string, content: string, model: string } }>}
 */
export async function apiAnalyzeDocument(id, instruction) {
  const response = await fetch(`/api/documents/${id}/analyze`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ instruction }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Document analysis failed');
  }

  return data;
}

/**
 * Deletes a document from server storage and MongoDB.
 * @param {string} id
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function apiDeleteDocument(id) {
  const response = await fetch(`/api/documents/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to delete document');
  }

  return data;
}

/**
 * Retrieves storage usage statistics for the user.
 * @returns {Promise<any>}
 */
export async function apiGetDocumentStats() {
  const response = await fetch('/api/documents/stats', {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.stats || null;
}

/* ==========================================================================
   KNOWLEDGE BASE & RAG API (Phase 7)
   ========================================================================== */

/**
 * Indexes or re-indexes a document into the Knowledge Base.
 * @param {string} id
 * @returns {Promise<{ success: boolean, document: any, chunkCount: number, generationId: string }>}
 */
export async function apiIndexDocument(id) {
  const response = await fetch(`/api/documents/${id}/index`, {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to index document');
  }

  return data;
}

/**
 * Batch indexes all ready documents into Knowledge Base.
 * @returns {Promise<{ success: boolean, results: Array<any> }>}
 */
export async function apiIndexAllDocuments() {
  const response = await fetch('/api/documents/index-all', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Failed to batch index documents');
  }

  return data;
}

/**
 * Performs standalone semantic search against authenticated user's Knowledge Base.
 * @param {string} query
 * @param {string[]} [selectedDocIds]
 * @param {number} [topK]
 * @returns {Promise<{ success: boolean, hasEvidence: boolean, sources: Array<any>, resultCount: number }>}
 */
export async function apiSearchKnowledgeBase(query, selectedDocIds = [], topK = 5) {
  const response = await fetch('/api/rag/search', {
    method: 'POST',
    headers: getHeaders(),
    credentials: 'include',
    body: JSON.stringify({ query, selectedDocIds, topK }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Knowledge Base search failed');
  }

  return data;
}

/**
 * Retrieves chunk preview by ID for citation inspection.
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function apiGetChunkPreview(id) {
  const response = await fetch(`/api/rag/chunks/${id}`, {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Failed to fetch chunk preview');
  }

  const data = await response.json();
  return data.chunk;
}

/**
 * Retrieves user Knowledge Base stats and quotas.
 * @returns {Promise<{ chunkCount: number, maxChunks: number, indexedDocCount: number, totalDocCount: number, isKnowledgeBaseReady: boolean }>}
 */
export async function apiGetRagStats() {
  const response = await fetch('/api/rag/stats', {
    headers: getHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    return {
      chunkCount: 0,
      maxChunks: 2500,
      indexedDocCount: 0,
      totalDocCount: 0,
      isKnowledgeBaseReady: false,
    };
  }

  const data = await response.json();
  return data.stats;
}

/* ==========================================================================
   VOICE & MULTIMODAL MEDIA API (Phase 8)
   ========================================================================== */

/**
 * Uploads up to 3 image attachments (JPEG, PNG, WebP, GIF) to the server.
 * Returns opaque attachment metadata references for chat messaging.
 * @param {File[]} files Array of image files
 * @returns {Promise<{ success: boolean, count: number, attachments: Array<any> }>}
 */
export async function apiUploadImages(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No image files provided for upload.');
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }

  const response = await fetch('/api/media/images', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'x-client-id': getClientId(),
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Image upload failed (${response.status})`);
  }

  return data;
}

/**
 * Returns the public-safe URL for viewing a user-owned media attachment.
 * @param {string} storageReference
 * @returns {string}
 */
export function getMediaUrl(storageReference) {
  if (!storageReference) return '';
  return `/api/media/images/${encodeURIComponent(storageReference)}`;
}

/**
 * Submits an audio recording for verbatim speech transcription using gemini-3.5-transcribe.
 * @param {Blob} audioBlob
 * @param {string} [filename='recording.webm']
 * @returns {Promise<{ success: boolean, text: string, language: string }>}
 */
export async function apiTranscribeAudio(audioBlob, filename = 'recording.webm') {
  if (!audioBlob || audioBlob.size === 0) {
    throw new Error('No audio data provided for transcription.');
  }

  const formData = new FormData();
  formData.append('audio', audioBlob, filename);

  const response = await fetch('/api/media/transcribe', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'x-client-id': getClientId(),
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Audio transcription failed (${response.status})`);
  }

  return data;
}

/**
 * Synthesizes text into spoken audio using gemini-3.1-flash-tts-preview with bounded caching.
 * @param {string} text Text to synthesize (max 2000 chars)
 * @param {string} [voice='Aoede'] Selected voice
 * @returns {Promise<Blob>} Audio binary blob
 */
export async function apiSynthesizeSpeech(text, voice = 'Aoede') {
  if (!text || !text.trim()) {
    throw new Error('Text is required for speech synthesis.');
  }

  const response = await fetch('/api/media/tts', {
    method: 'POST',
    credentials: 'include',
    headers: getHeaders(),
    body: JSON.stringify({ text: text.trim(), voice }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Speech synthesis failed (${response.status})`);
  }

  return await response.blob();
}



