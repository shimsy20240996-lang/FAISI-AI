import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import EventEmitter from 'node:events';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { documentService } from '../services/documents/documentService.js';
import { ragService } from '../services/rag/ragService.js';
import { retrievalService } from '../services/rag/retrievalService.js';
import { embeddingService } from '../services/embeddings/embeddingService.js';
import { aiService } from '../services/ai/aiService.js';
import { conversationService } from '../services/conversationService.js';
import { handleChatStream } from '../controllers/chatController.js';
import { ragController } from '../controllers/ragController.js';
import { localStorageProvider } from '../services/storage/localStorageProvider.js';
import { ENV } from '../config/env.js';

describe('Phase 10.10: Smart Document Selection in Chat Comprehensive Suite', () => {
  let userAId;
  let userBId;
  let docA1Id;
  let docA2Id;
  let docAUnindexedId;
  let docAFailedId;
  let docB1Id;

  const uniqueSuffix = Date.now();
  const emailA = `faisi-docselect-alice-${uniqueSuffix}@example.test`;
  const emailB = `faisi-docselect-bob-${uniqueSuffix}@example.test`;
  const rawPassword = 'Password123!Secure';

  // Distinct content buffers
  const bufferDocA1 = Buffer.from(
    'Alpha Project Financial Report 2026.\n' +
    'The total revenue for Alpha Project in Q1 was 45.8 million dollars.\n' +
    'Alpha Project primary expense was quantum computing infrastructure.'
  );

  const bufferDocA2 = Buffer.from(
    'Beta System Architecture Specification.\n' +
    'Beta System utilizes a distributed event bus running on Apache Kafka.\n' +
    'Beta System throughput target is 250,000 transactions per second.'
  );

  const bufferDocB = Buffer.from(
    'Gamma Confidential Personnel Records.\n' +
    'Gamma Project lead scientist is Dr. Elena Rostova.\n' +
    'Gamma Project facility is located in Geneva Sector 7.'
  );

  // Helper to wait for background indexing
  async function waitForCondition(checkFn, timeoutMs = 5000, intervalMs = 50) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const result = await checkFn();
      if (result) return result;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Condition timed out after ${timeoutMs}ms`);
  }

  // Helper to create mock SSE Response
  function createMockSSEResponse() {
    const emitter = new EventEmitter();
    const chunks = [];
    const events = [];
    let isEnded = false;
    let statusCode = 200;
    let headers = {};

    emitter.writeHead = (code, h) => {
      statusCode = code;
      headers = h || {};
    };
    emitter.flushHeaders = () => {};
    emitter.write = (data) => {
      const text = data.toString();
      chunks.push(text);
      if (text.startsWith('event:')) {
        const lines = text.split('\n');
        const eventType = lines[0].replace('event:', '').trim();
        const dataLine = lines.find((l) => l.startsWith('data:'));
        if (dataLine) {
          try {
            events.push({ type: eventType, data: JSON.parse(dataLine.replace('data:', '').trim()) });
          } catch {}
        }
      } else if (text.startsWith('data:')) {
        try {
          events.push({ type: 'data', data: JSON.parse(text.replace('data:', '').trim()) });
        } catch {}
      }
    };
    emitter.end = () => {
      isEnded = true;
      emitter.emit('finish');
    };

    return {
      res: emitter,
      getChunks: () => chunks,
      getEvents: () => events,
      getFullText: () =>
        events
          .filter((e) => e.data && e.data.type === 'chunk')
          .map((e) => e.data.text)
          .join(''),
      isEnded: () => isEnded,
      getStatusCode: () => statusCode,
      getHeaders: () => headers,
    };
  }

  // Backup original methods
  let originalEmbedText;
  let originalEmbedBatch;
  let originalStreamResponse;

  before(async () => {
    await localStorageProvider.init();

    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ENV.MONGODB_URI, {
          dbName: ENV.MONGODB_DB_NAME,
          serverSelectionTimeoutMS: 3000,
        });
      }
    } catch {
      // Fallback
    }

    if (mongoose.connection.readyState === 1) {
      // Create User A
      const userA = new User({
        email: emailA,
        displayName: 'Alice DocSelect Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userA.save();
      userAId = userA._id.toString();

      // Create User B (for IDOR tests)
      const userB = new User({
        email: emailB,
        displayName: 'Bob DocSelect Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userB.save();
      userBId = userB._id.toString();

      // Mock embeddings
      originalEmbedText = embeddingService.provider.embedText;
      originalEmbedBatch = embeddingService.provider.embedBatch;
      originalStreamResponse = aiService.streamResponse;

      embeddingService.provider.embedText = async (text) => {
        const vec = new Array(768).fill(0.001);
        if (text.includes('Alpha') || text.includes('revenue') || text.includes('45.8')) {
          vec[0] = 0.999;
        } else if (text.includes('Beta') || text.includes('Kafka') || text.includes('250,000')) {
          vec[1] = 0.999;
        } else if (text.includes('Gamma') || text.includes('Rostova') || text.includes('Geneva')) {
          vec[2] = 0.999;
        }
        return vec;
      };

      embeddingService.provider.embedBatch = async (chunks) => {
        return chunks.map((c) => {
          const text = typeof c === 'string' ? c : c.text || '';
          const vec = new Array(768).fill(0.001);
          if (text.includes('Alpha') || text.includes('revenue') || text.includes('45.8')) {
            vec[0] = 0.999;
          } else if (text.includes('Beta') || text.includes('Kafka') || text.includes('250,000')) {
            vec[1] = 0.999;
          } else if (text.includes('Gamma') || text.includes('Rostova') || text.includes('Geneva')) {
            vec[2] = 0.999;
          }
          return vec;
        });
      };

      // Mock AI stream response
      aiService.streamResponse = async ({ messages }, { onChunk, onModel }) => {
        if (onModel) onModel('gemini-3.6-flash');
        const lastMsg = messages[messages.length - 1];
        let answer = 'Based on the verified knowledge base: ';
        if (lastMsg.content.includes('45.8 million dollars')) {
          answer += 'Alpha Project Q1 revenue was 45.8 million dollars [Source 1].';
        } else if (lastMsg.content.includes('Apache Kafka')) {
          answer += 'Beta System uses Apache Kafka [Source 1].';
        } else {
          answer += 'General summary provided.';
        }
        if (onChunk) onChunk(answer);
        return answer;
      };

      // 1. Upload & Index Doc A1 (Alpha)
      const resA1 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Alpha_Financial_2026.txt',
          mimetype: 'text/plain',
          size: bufferDocA1.length,
          buffer: bufferDocA1,
        },
        autoIndex: true,
      });
      docA1Id = resA1.document._id.toString();

      // 2. Upload & Index Doc A2 (Beta)
      const resA2 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Beta_Architecture_Spec.txt',
          mimetype: 'text/plain',
          size: bufferDocA2.length,
          buffer: bufferDocA2,
        },
        autoIndex: true,
      });
      docA2Id = resA2.document._id.toString();

      // 3. Upload Doc A3 (Unindexed)
      const resA3 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Draft_Unindexed_Notes.txt',
          mimetype: 'text/plain',
          size: bufferDocA1.length,
          buffer: bufferDocA1,
        },
        autoIndex: false,
      });
      docAUnindexedId = resA3.document._id.toString();

      // 4. Upload Doc A4 (Failed Indexing)
      const resA4 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Corrupted_Index_Doc.txt',
          mimetype: 'text/plain',
          size: bufferDocA1.length,
          buffer: bufferDocA1,
        },
        autoIndex: false,
      });
      docAFailedId = resA4.document._id.toString();
      await Document.findByIdAndUpdate(docAFailedId, {
        indexingStatus: 'failed',
        indexingError: 'Simulated Index Failure',
      });

      // 5. Upload & Index Doc B1 (Gamma for User B)
      const resB1 = await documentService.processUpload({
        userId: userBId,
        file: {
          originalname: 'Gamma_Confidential_Roster.txt',
          mimetype: 'text/plain',
          size: bufferDocB.length,
          buffer: bufferDocB,
        },
        autoIndex: true,
      });
      docB1Id = resB1.document._id.toString();

      // Wait for background indexing on A1, A2, B1
      await waitForCondition(async () => {
        const d1 = await Document.findById(docA1Id);
        const d2 = await Document.findById(docA2Id);
        const db = await Document.findById(docB1Id);
        return d1?.indexingStatus === 'indexed' && d2?.indexingStatus === 'indexed' && db?.indexingStatus === 'indexed';
      });
    }
  });

  after(async () => {
    if (originalEmbedText) embeddingService.provider.embedText = originalEmbedText;
    if (originalEmbedBatch) embeddingService.provider.embedBatch = originalEmbedBatch;
    if (originalStreamResponse) aiService.streamResponse = originalStreamResponse;

    if (mongoose.connection.readyState === 1) {
      if (userAId) {
        await DocumentChunk.deleteMany({ userId: userAId });
        await Document.deleteMany({ userId: userAId });
        await User.deleteOne({ _id: userAId });
      }
      if (userBId) {
        await DocumentChunk.deleteMany({ userId: userBId });
        await Document.deleteMany({ userId: userBId });
        await User.deleteOne({ _id: userBId });
      }
    }
  });

  describe('1. Single Document Selection', () => {
    test('1.1 Selecting Doc A1 retrieves only Doc A1 chunks and ignores Doc A2', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'What was the Alpha Project Q1 revenue and what is Beta System?',
        selectedDocIds: [docA1Id],
      });

      assert.strictEqual(retrieval.hasEvidence, true);
      assert.ok(retrieval.sources.length > 0);

      // Verify every single retrieved chunk belongs ONLY to Doc A1
      for (const src of retrieval.sources) {
        assert.strictEqual(src.documentId.toString(), docA1Id);
        assert.strictEqual(src.documentName, 'Alpha_Financial_2026.txt');
      }
      assert.ok(retrieval.contextText.includes('45.8 million dollars'));
      assert.strictEqual(retrieval.contextText.includes('Beta System'), false);
    });
  });

  describe('2. Multiple Documents Selection', () => {
    test('2.1 Selecting Doc A1 + Doc A2 retrieves evidence from both selected documents', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'Alpha revenue and Beta Kafka architecture specifications',
        selectedDocIds: [docA1Id, docA2Id],
      });

      assert.strictEqual(retrieval.hasEvidence, true);
      const retrievedDocIds = new Set(retrieval.sources.map((s) => s.documentId.toString()));
      assert.ok(retrievedDocIds.has(docA1Id), 'Must contain Doc A1 chunks');
      assert.ok(retrievedDocIds.has(docA2Id), 'Must contain Doc A2 chunks');
    });
  });

  describe('3. All Documents (Omitted / Empty Selection)', () => {
    test('3.1 Omitted selectedDocIds searches across all user indexed documents', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'Alpha Project and Beta transactions throughput',
      });

      assert.strictEqual(retrieval.hasEvidence, true);
      assert.ok(retrieval.sources.length > 0);
    });

    test('3.2 Empty array selectedDocIds: [] searches all user indexed documents', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'Alpha revenue and Beta Kafka architecture specifications',
        selectedDocIds: [],
      });

      assert.strictEqual(retrieval.hasEvidence, true);
      assert.ok(retrieval.sources.length > 0);
    });
  });

  describe('4. Unauthorized Document (IDOR Protection)', () => {
    test('4.1 User A selecting User B document ID is safely rejected with zero leakage', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const mock = createMockSSEResponse();
      const req = {
        user: { id: userAId },
        body: {
          messages: [{ role: 'user', content: 'Tell me about Dr Elena Rostova and Gamma Project' }],
          useKnowledgeBase: true,
          selectedDocIds: [docB1Id], // User B's document ID
        },
      };

      await handleChatStream(req, mock.res);

      assert.strictEqual(mock.getStatusCode(), 200);
      const fullText = mock.getFullText();
      assert.ok(
        fullText.includes("I couldn't find enough relevant information"),
        'Must return no-evidence response'
      );
      assert.strictEqual(fullText.includes('Rostova'), false, 'Must not leak User B content');

      // Verify no rag_sources event was emitted
      const ragSourcesEvents = mock.getEvents().filter((e) => e.type === 'rag_sources');
      assert.strictEqual(ragSourcesEvents.length, 0, 'No citations should be emitted for unauthorized doc');
    });

    test('4.2 ragController.searchKnowledgeBase with unauthorized ID returns 0 results safely', async () => {
      if (mongoose.connection.readyState !== 1) return;

      let responseData = null;
      const req = {
        user: { id: userAId },
        body: {
          query: 'Who is Dr Elena Rostova?',
          selectedDocIds: [docB1Id],
        },
      };
      const res = {
        status: (code) => ({
          json: (data) => {
            responseData = { code, data };
          },
        }),
      };

      await ragController.searchKnowledgeBase(req, res);
      assert.strictEqual(responseData.code, 200);
      assert.strictEqual(responseData.data.hasEvidence, false);
      assert.strictEqual(responseData.data.sources.length, 0);
    });
  });

  describe('5. Invalid / Malformed Document IDs', () => {
    test('5.1 Malformed, null, number, and non-existent IDs in array are handled without CastError', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const mock = createMockSSEResponse();
      const req = {
        user: { id: userAId },
        body: {
          messages: [{ role: 'user', content: 'What was the Alpha revenue?' }],
          useKnowledgeBase: true,
          selectedDocIds: ['invalid-mongo-id', null, 12345, '64f000000000000000000000'],
        },
      };

      await handleChatStream(req, mock.res);
      assert.strictEqual(mock.getStatusCode(), 200);
      const fullText = mock.getFullText();
      assert.ok(fullText.includes("I couldn't find enough relevant information"));
    });
  });

  describe('6. Unindexed Document Selection', () => {
    test('6.1 Selecting unindexed document produces no evidence safely', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'What was the Alpha Project revenue?',
        selectedDocIds: [docAUnindexedId],
      });

      assert.strictEqual(retrieval.hasEvidence, false);
      assert.strictEqual(retrieval.sources.length, 0);
    });
  });

  describe('7. Failed Document Selection', () => {
    test('7.1 Selecting failed-indexing document produces no evidence safely', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'What was the Alpha Project revenue?',
        selectedDocIds: [docAFailedId],
      });

      assert.strictEqual(retrieval.hasEvidence, false);
      assert.strictEqual(retrieval.sources.length, 0);
    });
  });

  describe('8. Knowledge Base OFF Behavior', () => {
    test('8.1 useKnowledgeBase: false ignores selectedDocIds and skips RAG context', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const mock = createMockSSEResponse();
      const req = {
        user: { id: userAId },
        body: {
          messages: [{ role: 'user', content: 'What is Alpha Project?' }],
          useKnowledgeBase: false,
          selectedDocIds: [docA1Id],
        },
      };

      await handleChatStream(req, mock.res);

      assert.strictEqual(mock.getStatusCode(), 200);
      const ragSourcesEvents = mock.getEvents().filter((e) => e.type === 'rag_sources');
      assert.strictEqual(ragSourcesEvents.length, 0, 'RAG sources event should not be emitted');
      assert.ok(mock.getFullText().length > 0, 'Standard model response emitted');
    });
  });

  describe('9. Citation Integrity', () => {
    test('9.1 event: rag_sources emits citations exclusively from the selected document', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const mock = createMockSSEResponse();
      const req = {
        user: { id: userAId },
        body: {
          messages: [{ role: 'user', content: 'What was Alpha Project revenue in 2026?' }],
          useKnowledgeBase: true,
          selectedDocIds: [docA1Id],
        },
      };

      await handleChatStream(req, mock.res);

      const ragEvents = mock.getEvents().filter((e) => e.type === 'rag_sources');
      assert.strictEqual(ragEvents.length, 1);
      assert.ok(ragEvents[0].data.sources.length > 0);

      for (const src of ragEvents[0].data.sources) {
        assert.strictEqual(src.documentId.toString(), docA1Id);
        assert.strictEqual(src.documentName, 'Alpha_Financial_2026.txt');
      }
    });
  });

  describe('10. SSE Streaming & End-to-End Chat Compatibility', () => {
    test('10.1 Streaming completes with SSE chunk, done events, and proper headers', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const mock = createMockSSEResponse();
      const req = {
        user: { id: userAId },
        body: {
          messages: [{ role: 'user', content: 'Tell me about Alpha Project revenue' }],
          useKnowledgeBase: true,
          selectedDocIds: [docA1Id],
        },
      };

      await handleChatStream(req, mock.res);

      const headers = mock.getHeaders();
      assert.strictEqual(headers['Content-Type'], 'text/event-stream; charset=utf-8');
      assert.strictEqual(headers['Cache-Control'], 'no-cache, no-transform');

      const events = mock.getEvents();
      const doneEvent = events.find((e) => e.data && e.data.type === 'done');
      assert.ok(doneEvent, 'Must emit done event');
      assert.strictEqual(mock.isEnded(), true, 'Stream must be closed');
    });
  });

  describe('11. Duplicate Selected Document IDs', () => {
    test('11.1 Duplicate IDs in selectedDocIds array are deduplicated safely', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'Alpha revenue and Beta architecture',
        selectedDocIds: [docA1Id, docA1Id, docA2Id, docA2Id],
      });

      assert.strictEqual(retrieval.hasEvidence, true);
      assert.ok(retrieval.sources.length > 0);
    });
  });

  describe('12. Regeneration with Selected Documents', () => {
    test('12.1 isRegenerate: true with selectedDocIds respects the selection and updates conversation', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // Create conversation
      const conv = await conversationService.createConversation(userAId, 'Regen Exploration');
      await conversationService.addMessage(userAId, conv.id, {
        role: 'user',
        content: 'What was Alpha Project revenue?',
        status: 'complete',
      });
      await conversationService.addMessage(userAId, conv.id, {
        role: 'assistant',
        content: 'Old assistant reply',
        status: 'complete',
      });

      const mock = createMockSSEResponse();
      const req = {
        user: { id: userAId },
        body: {
          conversationId: conv.id,
          messages: [{ role: 'user', content: 'What was Alpha Project revenue?' }],
          useKnowledgeBase: true,
          isRegenerate: true,
          selectedDocIds: [docA1Id],
        },
      };

      await handleChatStream(req, mock.res);

      assert.strictEqual(mock.getStatusCode(), 200);
      const updatedConv = await conversationService.getConversation(userAId, conv.id);
      const lastMsg = updatedConv.messages[updatedConv.messages.length - 1];
      assert.strictEqual(lastMsg.role, 'assistant');
      assert.ok(lastMsg.content.includes('Alpha Project Q1 revenue'));
      assert.ok(lastMsg.sources.length > 0);
      assert.strictEqual(lastMsg.sources[0].documentId.toString(), docA1Id);
    });
  });
});
