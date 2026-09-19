import mongoose from 'mongoose';
import { aiService } from '../services/ai/aiService.js';
import { conversationService } from '../services/conversationService.js';
import { retrievalService } from '../services/rag/retrievalService.js';
import { imageValidationService } from '../services/media/imageValidationService.js';
import { streamConcurrencyManager } from '../middleware/rateLimiter.js';
import { Document } from '../models/Document.js';
import {
  NOVA_SYSTEM_INSTRUCTION,
  DOCUMENT_RAG_SYSTEM_INSTRUCTION,
  MULTIMODAL_SYSTEM_INSTRUCTION,
} from '../services/ai/systemPrompt.js';
import { isDatabaseConnected } from '../config/database.js';
import { ENV } from '../config/env.js';
import { recordSSEStreamStart, recordSSEStreamEnd } from '../utils/metrics.js';
import { getAIModelConfig } from '../services/ai/geminiService.js';

/**
 * Health check controller.
 * Safely reports AI configuration and database connection status without leaking credentials or secrets.
 */
export async function getHealth(req, res) {
  const dbConnected = isDatabaseConnected();
  const { primaryModel, fallbackModel } = getAIModelConfig();

  res.status(200).json({
    success: true,
    service: 'FAISI AI API',
    status: dbConnected ? 'online' : 'degraded',
    aiConfigured: Boolean(ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.trim().length > 0),
    database: dbConnected ? 'connected' : 'disconnected',
    model: primaryModel,
    ...(fallbackModel ? { fallbackModel } : {}),
    version: '0.8.1',
  });
}

/**
 * Main synchronous chat controller (Phase 2 compatibility).
 */
export async function handleChat(req, res, next) {
  try {
    const { messages, systemInstruction, attachments } = req.body;

    const aiResponse = await aiService.generateResponse({
      messages,
      systemInstruction,
      attachments,
    });

    res.status(200).json({
      success: true,
      message: aiResponse,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Progressive streaming chat controller with real-time SSE delivery, multimodal support, and user-owned MongoDB persistence.
 */
export async function handleChatStream(req, res) {
  const {
    messages,
    systemInstruction,
    conversationId,
    isRegenerate,
    useKnowledgeBase,
    selectedDocIds,
    attachments,
  } = req.body;
  const userId = req.user?.id;

  // Stream Concurrency Check (Max 2 active streams per user/IP)
  const streamKey = req.user?.id || req.ip || 'anonymous';
  if (!streamConcurrencyManager.acquire(streamKey)) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'CONCURRENT_STREAM_LIMIT_EXCEEDED',
        message: 'You have reached the maximum number of active streaming responses (2). Please wait for an existing stream to complete.',
      },
    });
  }

  let concurrencyReleased = false;
  const releaseConcurrency = () => {
    if (!concurrencyReleased) {
      concurrencyReleased = true;
      streamConcurrencyManager.release(streamKey);
    }
  };

  // Set SSE response headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Phase 10.6-D SSE Stream Telemetry
  recordSSEStreamStart();
  const sseStartHr = process.hrtime.bigint();
  let sseFinalized = false;
  const finalizeSSE = (outcome = 'completed') => {
    if (sseFinalized) return;
    sseFinalized = true;
    const durationMs = Number(process.hrtime.bigint() - sseStartHr) / 1e6;
    recordSSEStreamEnd({ outcome, durationMs });
  };

  // Sanitize attachments metadata for persistence (never store raw binaries)
  let userAttachments = undefined;
  if (Array.isArray(attachments) && attachments.length > 0) {
    userAttachments = attachments.map((att) => ({
      id: att.id || `att_${Date.now()}`,
      type: att.type || 'image',
      name: (att.name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100),
      mimeType: att.mimeType || 'image/png',
      size: att.size || 0,
      width: att.width,
      height: att.height,
      storageReference: att.storageReference,
      createdAt: att.createdAt || new Date(),
    }));
  }

  // If conversationId is provided with an authenticated user, verify ownership and persist user message
  if (
    conversationId &&
    userId &&
    isDatabaseConnected() &&
    !isRegenerate &&
    Array.isArray(messages) &&
    messages.length > 0
  ) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg?.content) {
      try {
        await conversationService.addMessage(userId, conversationId, {
          role: 'user',
          content: lastUserMsg.content,
          status: 'complete',
          attachments: userAttachments,
        });
      } catch (dbErr) {
        console.warn('⚠️  Could not persist user message to MongoDB:', dbErr.message);
      }
    }
  }

  let effectiveMessages = [...messages];
  let effectiveSystemInstruction = systemInstruction;
  let ragSources = [];

  // Phase 8: Resolve image binary buffers for multimodal inference
  if (userAttachments && userAttachments.length > 0 && userId) {
    const resolvedAttachments = [];
    for (const att of userAttachments) {
      if (att.storageReference) {
        try {
          const { buffer, mimeType } = await imageValidationService.getImageBuffer(
            userId,
            att.storageReference
          );
          resolvedAttachments.push({
            type: 'image',
            mimeType,
            data: buffer.toString('base64'),
          });
        } catch (imgErr) {
          console.warn('⚠️  Could not load image buffer for multimodal stream:', imgErr.message);
        }
      } else if (att.data) {
        resolvedAttachments.push(att);
      }
    }

    if (resolvedAttachments.length > 0) {
      const lastUserIndex = effectiveMessages.findLastIndex((m) => m.role === 'user');
      if (lastUserIndex !== -1) {
        effectiveMessages[lastUserIndex] = {
          ...effectiveMessages[lastUserIndex],
          attachments: resolvedAttachments,
        };
      }
      if (!effectiveSystemInstruction || effectiveSystemInstruction === NOVA_SYSTEM_INSTRUCTION) {
        effectiveSystemInstruction = MULTIMODAL_SYSTEM_INSTRUCTION;
      }
    }
  }

  // Phase 7: Knowledge Base Retrieval when useKnowledgeBase is active
  if (useKnowledgeBase && userId && Array.isArray(messages) && messages.length > 0) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

    if (lastUserMsg?.content) {
      // 1. Verify selected document IDs (IDOR & Type Hardening)
      let verifiedDocIds = [];
      let hadExplicitSelection = false;

      if (Array.isArray(selectedDocIds) && selectedDocIds.length > 0) {
        hadExplicitSelection = true;
        const validObjectIds = [
          ...new Set(
            selectedDocIds
              .filter((id) => id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))
              .map((id) => id.toString())
          ),
        ];

        if (validObjectIds.length > 0) {
          const ownedDocs = await Document.find({
            _id: { $in: validObjectIds },
            userId,
          }).select('_id');
          verifiedDocIds = ownedDocs.map((d) => d._id.toString());
        }
      }

      // If user explicitly selected documents, but none are valid or owned by user,
      // return no evidence immediately without querying all user documents or leaking info.
      if (hadExplicitSelection && verifiedDocIds.length === 0) {
        const noEvidenceText =
          "I couldn't find enough relevant information in your uploaded documents to answer this confidently.";
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: noEvidenceText })}\n\n`);

        if (conversationId && userId && isDatabaseConnected()) {
          try {
            await conversationService.addMessage(userId, conversationId, {
              role: 'assistant',
              content: noEvidenceText,
              status: 'complete',
            });
          } catch (dbErr) {
            console.warn('⚠️  Could not persist no-evidence response:', dbErr.message);
          }
        }

        finalizeSSE('completed');
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        releaseConcurrency();
        return;
      }

      // 2. Retrieve context from Knowledge Base
      let retrieval;
      try {
        retrieval = await retrievalService.retrieveContext({
          userId,
          query: lastUserMsg.content,
          selectedDocIds: verifiedDocIds,
        });
      } catch (retrievalErr) {
        console.error('🔴 [RAG Retrieval Error in ChatStream]:', retrievalErr.message);
        retrieval = { hasEvidence: false, contextText: '', sources: [] };
      }

      // 3. Strict No-Evidence Behavior: No silent fallback to general knowledge
      if (!retrieval.hasEvidence) {
        const noEvidenceText =
          "I couldn't find enough relevant information in your uploaded documents to answer this confidently.";
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: noEvidenceText })}\n\n`);

        if (conversationId && userId && isDatabaseConnected()) {
          try {
            await conversationService.addMessage(userId, conversationId, {
              role: 'assistant',
              content: noEvidenceText,
              status: 'complete',
            });
          } catch (dbErr) {
            console.warn('⚠️  Could not persist no-evidence response:', dbErr.message);
          }
        }

        finalizeSSE('completed');
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        releaseConcurrency();
        return;
      }

      // 4. If evidence found, emit preliminary SSE event for citations
      ragSources = retrieval.sources;
      res.write(`event: rag_sources\ndata: ${JSON.stringify({ sources: ragSources })}\n\n`);

      // 5. Augment prompt with isolated untrusted context
      const augmentedPrompt = `<RETRIEVED_KNOWLEDGE_BASE>\n${retrieval.contextText}\n</RETRIEVED_KNOWLEDGE_BASE>\n\nUser Question:\n${lastUserMsg.content}`;

      effectiveMessages = effectiveMessages.map((m, idx) => {
        if (m === lastUserMsg || idx === effectiveMessages.lastIndexOf(lastUserMsg)) {
          return { ...m, role: m.role, content: augmentedPrompt };
        }
        return m;
      });

      effectiveSystemInstruction = DOCUMENT_RAG_SYSTEM_INSTRUCTION;
    }
  }

  let accumulatedText = '';
  let isStreamCompleted = false;
  let isUserAborted = false;
  let persistenceDone = false;
  const clientAbortController = new AbortController();

  const persistAssistantMessage = async (content, status) => {
    if (
      persistenceDone ||
      !conversationId ||
      !userId ||
      !isDatabaseConnected() ||
      !content ||
      content.trim().length === 0
    ) {
      return;
    }
    persistenceDone = true;
    try {
      if (isRegenerate) {
        await conversationService.updateLastAssistantMessage(userId, conversationId, {
          content,
          status,
          sources: ragSources.length > 0 ? ragSources : undefined,
        });
      } else {
        await conversationService.addMessage(userId, conversationId, {
          role: 'assistant',
          content,
          status,
          sources: ragSources.length > 0 ? ragSources : undefined,
        });
      }
    } catch (dbErr) {
      console.warn(`⚠️  Could not persist ${status} assistant response:`, dbErr.message);
    }
  };

  // If client connection closes prematurely before stream completion, abort AI generation
  res.on('close', async () => {
    releaseConcurrency();
    if (!isStreamCompleted) {
      isUserAborted = true;
      clientAbortController.abort();
      finalizeSSE('client_disconnected');
      await persistAssistantMessage(accumulatedText, 'stopped');
    }
  });

  const { primaryModel } = getAIModelConfig();
  let activeModelUsed = primaryModel;

  try {
    const streamResult = await aiService.streamResponse({
      messages: effectiveMessages,
      systemInstruction: effectiveSystemInstruction,
      signal: clientAbortController.signal,
      onModelSelected: (model) => {
        if (model) {
          activeModelUsed = model;
        }
      },
      onChunk: (text) => {
        if (!res.writableEnded && !isUserAborted) {
          accumulatedText += text;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
        }
      },
    });

    if (streamResult?.model) {
      activeModelUsed = streamResult.model;
    }

    if (!res.writableEnded && !isUserAborted) {
      isStreamCompleted = true;
      finalizeSSE('completed');
      await persistAssistantMessage(accumulatedText, 'complete');
      res.write(`data: ${JSON.stringify({ type: 'done', model: activeModelUsed })}\n\n`);
    }
  } catch (error) {
    if (ENV.NODE_ENV !== 'test') {
      console.error('🔴 [ChatStream Error]:', error.message);
    }
    finalizeSSE('failed');

    if (!res.writableEnded && !isUserAborted) {
      const safeMessage =
        error.code === 'API_KEY_MISSING'
          ? 'Gemini API key is not configured on the server. Please set GEMINI_API_KEY in your server environment.'
          : error.code === 'INVALID_API_KEY'
          ? 'FAISI is temporarily unable to connect to its AI service.'
          : error.code === 'RATE_LIMIT_EXCEEDED'
          ? 'FAISI is temporarily rate-limited. Please try again in a moment.'
          : (error.code === 'MODEL_HIGH_DEMAND' || error.code === 'SERVICE_UNAVAILABLE' || error.statusCode === 503 || error.status === 503)
          ? 'FAISI is experiencing high demand right now. Please try again in a moment.'
          : (error.code === 'TIMEOUT_ERROR' || error.statusCode === 504 || error.status === 504 || error.message?.toLowerCase().includes('timed out') || error.message?.toLowerCase().includes('timeout'))
          ? 'FAISI couldn\'t complete the response because the AI service took too long to respond. Please try again.'
          : (error.isOperational && error.message && !error.message.includes('AIza') && !error.message.includes('key=') && !error.message.includes('streaming timed out'))
          ? error.message
          : 'FAISI couldn\'t reach the AI service right now. Please try again shortly.';

      res.write(
        `data: ${JSON.stringify({ type: 'error', message: safeMessage, code: error.code || 'UPSTREAM_SERVICE_ERROR' })}\n\n`
      );
    }
  } finally {
    releaseConcurrency();
    finalizeSSE(isStreamCompleted ? 'completed' : (isUserAborted ? 'client_disconnected' : 'failed'));
    if (!res.writableEnded) {
      res.end();
    }
  }
}
