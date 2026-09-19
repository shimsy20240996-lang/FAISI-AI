import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { documentService } from '../services/documents/documentService.js';
import { ragService } from '../services/rag/ragService.js';
import { retrievalService } from '../services/rag/retrievalService.js';
import { embeddingService } from '../services/embeddings/embeddingService.js';
import { ragController } from '../controllers/ragController.js';
import { localStorageProvider } from '../services/storage/localStorageProvider.js';
import { ENV } from '../config/env.js';

describe('Phase 10.11: Knowledge Base Semantic Search & Explorer Test Suite', () => {
  let userAId;
  let userBId;
  let docA1Id;
  let docA2Id;
  let docAUnindexedId;
  let docAFailedId;
  let docB1Id;

  const uniqueSuffix = Date.now();
  const emailA = `faisi-search-alice-${uniqueSuffix}@example.test`;
  const emailB = `faisi-search-bob-${uniqueSuffix}@example.test`;
  const rawPassword = 'Password123!Secure';

  // Distinct content buffers for semantic indexing
  const bufferDocA1 = Buffer.from(
    'Quantum Computing Financial Strategy 2026.\n' +
    'The total capital expenditure for Quantum Qubit hardware in Q1 was 92.4 million dollars.\n' +
    'Superconducting circuits delivered a 99.8 percent quantum gate fidelity rate.'
  );

  const bufferDocA2 = Buffer.from(
    'Distributed Cloud Storage Protocol Architecture.\n' +
    'The cluster distributes encrypted blob replicas across 12 distinct edge geographic zones.\n' +
    'Automated heartbeat failover ensures zero data loss with Raft consensus.'
  );

  const bufferDocB = Buffer.from(
    'Confidential Medical Genetics Research Alpha.\n' +
    'CRISPR genomic editing trials showed high specificity in human cellular telomeres.\n' +
    'Lead medical investigator is Dr. Marcus Vance in Zurich facility.'
  );

  // Helper to wait for background indexing
  async function waitForCondition(checkFn, timeoutMs = 6000, intervalMs = 50) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const result = await checkFn();
      if (result) return result;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Condition timed out after ${timeoutMs}ms`);
  }

  // Mock response object
  function createMockResponse() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  }

  // Backup original embedding methods
  let originalEmbedText;
  let originalEmbedBatch;

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
      // Allow fallback if offline
    }

    if (mongoose.connection.readyState === 1) {
      // 1. Create User A and User B
      const userA = new User({
        email: emailA,
        displayName: 'Alice Search Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userA.save();
      userAId = userA._id.toString();

      const userB = new User({
        email: emailB,
        displayName: 'Bob Search Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userB.save();
      userBId = userB._id.toString();

      // 2. Mock deterministic embeddings for test matching
      originalEmbedText = embeddingService.provider.embedText;
      originalEmbedBatch = embeddingService.provider.embedBatch;

      embeddingService.provider.embedText = async (text) => {
        const vec = new Array(768).fill(0.001);
        const lower = (text || '').toLowerCase();
        if (lower.includes('quantum') || lower.includes('qubit') || lower.includes('expenditure') || lower.includes('superconducting')) {
          vec[0] = 0.999;
        } else if (lower.includes('cloud') || lower.includes('storage') || lower.includes('raft') || lower.includes('consensus') || lower.includes('failover') || lower.includes('distributed')) {
          vec[1] = 0.999;
        } else if (lower.includes('genetics') || lower.includes('crispr') || lower.includes('vance') || lower.includes('medical')) {
          vec[2] = 0.999;
        }
        return vec;
      };

      embeddingService.provider.embedBatch = async (chunks) => {
        return chunks.map((c) => {
          const text = (typeof c === 'string' ? c : c.text || '').toLowerCase();
          const vec = new Array(768).fill(0.001);
          if (text.includes('quantum') || text.includes('qubit') || text.includes('expenditure') || text.includes('superconducting')) {
            vec[0] = 0.999;
          } else if (text.includes('cloud') || text.includes('storage') || text.includes('raft') || text.includes('consensus') || text.includes('failover') || text.includes('distributed')) {
            vec[1] = 0.999;
          } else if (text.includes('genetics') || text.includes('crispr') || text.includes('vance') || text.includes('medical')) {
            vec[2] = 0.999;
          }
          return vec;
        });
      };

      // 3. Upload and Auto-Index Doc A1 (Quantum Strategy)
      const resA1 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Quantum_Financial_Strategy.txt',
          mimetype: 'text/plain',
          size: bufferDocA1.length,
          buffer: bufferDocA1,
        },
        autoIndex: true,
      });
      docA1Id = resA1.document._id.toString();

      // 4. Upload and Auto-Index Doc A2 (Distributed Cloud)
      const resA2 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Distributed_Cloud_Architecture.txt',
          mimetype: 'text/plain',
          size: bufferDocA2.length,
          buffer: bufferDocA2,
        },
        autoIndex: true,
      });
      docA2Id = resA2.document._id.toString();

      // 5. Upload Doc A3 (Unindexed)
      const resA3 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Unindexed_Notes.txt',
          mimetype: 'text/plain',
          size: bufferDocA1.length,
          buffer: bufferDocA1,
        },
        autoIndex: false,
      });
      docAUnindexedId = resA3.document._id.toString();

      // 6. Upload Doc A4 (Failed Indexing)
      const resA4 = await documentService.processUpload({
        userId: userAId,
        file: {
          originalname: 'Corrupted_File.txt',
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

      // 7. Upload and Auto-Index Doc B1 (Bob's Medical Genetics)
      const resB1 = await documentService.processUpload({
        userId: userBId,
        file: {
          originalname: 'Genetics_Research_Vance.txt',
          mimetype: 'text/plain',
          size: bufferDocB.length,
          buffer: bufferDocB,
        },
        autoIndex: true,
      });
      docB1Id = resB1.document._id.toString();

      // Wait for auto-indexing of active documents
      await waitForCondition(async () => {
        const d1 = await Document.findById(docA1Id);
        const d2 = await Document.findById(docA2Id);
        const db1 = await Document.findById(docB1Id);
        return (
          d1?.indexingStatus === 'indexed' &&
          d2?.indexingStatus === 'indexed' &&
          db1?.indexingStatus === 'indexed'
        );
      }, 8000);
    }
  });

  after(async () => {
    // Restore original embedding methods
    if (originalEmbedText) embeddingService.provider.embedText = originalEmbedText;
    if (originalEmbedBatch) embeddingService.provider.embedBatch = originalEmbedBatch;

    // Clean up created test data
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

  // TEST 1: Authenticated Semantic Search (All Documents)
  test('1. Semantic Search across all indexed documents returns matching passages with scores', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'What was the capital expenditure for quantum hardware in Q1?',
        selectedDocIds: [],
        topK: 5,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasEvidence, true);
    assert.ok(res.body.sources.length > 0, 'Expected at least one matching source');

    const topMatch = res.body.sources[0];
    assert.equal(topMatch.documentId.toString(), docA1Id);
    assert.equal(topMatch.documentName, 'Quantum_Financial_Strategy.txt');
    assert.ok(topMatch.snippet.includes('Quantum Qubit hardware') || topMatch.snippet.includes('million dollars'));
    assert.ok(topMatch.score >= 0.65, `Score ${topMatch.score} should exceed threshold`);
    assert.ok(topMatch.chunkId, 'chunkId should be present');
  });

  // TEST 2: Query Validation (Empty / Whitespace / Non-string)
  test('2. Semantic Search rejects empty or whitespace query with 400 INVALID_QUERY', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const reqEmpty = {
      user: { id: userAId },
      body: { query: '   ' },
    };
    const resEmpty = createMockResponse();

    await ragController.searchKnowledgeBase(reqEmpty, resEmpty);

    assert.equal(resEmpty.statusCode, 400);
    assert.equal(resEmpty.body.success, false);
    assert.equal(resEmpty.body.error.code, 'INVALID_QUERY');

    const reqNull = {
      user: { id: userAId },
      body: { query: null },
    };
    const resNull = createMockResponse();

    await ragController.searchKnowledgeBase(reqNull, resNull);

    assert.equal(resNull.statusCode, 400);
    assert.equal(resNull.body.success, false);
    assert.equal(resNull.body.error.code, 'INVALID_QUERY');
  });

  // TEST 3: Single Document Filtering
  test('3. Semantic Search filtered by single document returns passages strictly from that document', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'What is the distributed consensus protocol and geographic zones?',
        selectedDocIds: [docA2Id],
        topK: 5,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasEvidence, true);

    res.body.sources.forEach((source) => {
      assert.equal(source.documentId.toString(), docA2Id);
      assert.equal(source.documentName, 'Distributed_Cloud_Architecture.txt');
    });
  });

  // TEST 4: Multi-Document Filtering
  test('4. Semantic Search with multiple selected document IDs searches within specified scope', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'Tell me about quantum computing or cloud storage architecture',
        selectedDocIds: [docA1Id, docA2Id],
        topK: 5,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.sources.length > 0);

    const allowedIds = new Set([docA1Id, docA2Id]);
    res.body.sources.forEach((source) => {
      assert.ok(allowedIds.has(source.documentId.toString()), `Source documentId ${source.documentId} must be in allowed set`);
    });
  });

  // TEST 5: IDOR & Foreign User Document Rejection
  test('5. Semantic Search with foreign document ID (User B) returns zero evidence for User A', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'Who is the lead medical investigator Dr. Marcus Vance?',
        selectedDocIds: [docB1Id], // Belongs to User B
        topK: 5,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasEvidence, false);
    assert.equal(res.body.sources.length, 0);
    assert.equal(res.body.resultCount, 0);
  });

  // TEST 6: Malformed Document IDs Resilience
  test('6. Semantic Search gracefully filters out malformed non-ObjectId document IDs', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'quantum qubit hardware expenditure',
        selectedDocIds: ['not-a-valid-id', null, 12345, docA1Id],
        topK: 5,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasEvidence, true);
    assert.ok(res.body.sources.length > 0);
    assert.equal(res.body.sources[0].documentId.toString(), docA1Id);
  });

  // TEST 7: No-Result Query Handling
  test('7. Semantic Search for out-of-domain query returns hasEvidence: false and empty sources', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'Medieval knight armor forging techniques in 14th century Burgundy',
        selectedDocIds: [],
        topK: 5,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasEvidence, false);
    assert.equal(res.body.sources.length, 0);
    assert.equal(res.body.resultCount, 0);
  });

  // TEST 8: Unindexed and Failed Documents Exclusion
  test('8. Semantic Search never returns chunks from unindexed or failed documents', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'Draft unindexed secret content notes',
        selectedDocIds: [docAUnindexedId, docAFailedId],
        topK: 5,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.hasEvidence, false);
    assert.equal(res.body.sources.length, 0);
  });

  // TEST 9: Response Schema and Metadata Integrity
  test('9. Search response source objects conform to citation metadata schema', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'Superconducting circuits quantum gate fidelity',
        selectedDocIds: [docA1Id],
        topK: 3,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.sources.length > 0);

    const source = res.body.sources[0];
    assert.equal(typeof source.sourceIndex, 'number');
    assert.ok(typeof source.documentId === 'string' || source.documentId instanceof mongoose.Types.ObjectId);
    assert.equal(typeof source.documentName, 'string');
    assert.equal(typeof source.snippet, 'string');
    assert.equal(typeof source.score, 'number');
    assert.ok(typeof source.chunkId === 'string' || source.chunkId instanceof mongoose.Types.ObjectId);
    assert.ok(source.pageNumber === null || typeof source.pageNumber === 'number');
    assert.ok(source.sectionTitle === null || typeof source.sectionTitle === 'string');
  });

  // TEST 10: Custom topK parameter handling
  test('10. Custom topK parameter bounds maximum returned passages', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'quantum architecture distributed system',
        selectedDocIds: [],
        topK: 1,
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.sources.length <= 1, `Result count ${res.body.sources.length} must be <= 1`);
  });

  // TEST 11: Ask FAISI Integration Context Validation
  test('11. Ask FAISI action data preserves documentId and builds valid contextual query structure', async () => {
    if (mongoose.connection.readyState !== 1) return;

    const req = {
      user: { id: userAId },
      body: {
        query: 'Raft consensus and heartbeat failover',
        selectedDocIds: [docA2Id],
      },
    };
    const res = createMockResponse();

    await ragController.searchKnowledgeBase(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.sources.length > 0);

    const source = res.body.sources[0];

    // Simulate Ask FAISI payload construction
    const docName = source.documentName || 'this document';
    const cleanSnippet = source.snippet ? source.snippet.trim().slice(0, 150) : '';
    const askFaisiPrompt = cleanSnippet
      ? `Can you explain this excerpt from "${docName}": "${cleanSnippet}"?`
      : `Can you summarize the key findings in "${docName}"?`;

    assert.ok(askFaisiPrompt.includes('Distributed_Cloud_Architecture.txt'));
    assert.ok(askFaisiPrompt.includes('consensus') || askFaisiPrompt.includes('failover') || askFaisiPrompt.includes('replicas'));
    assert.equal(source.documentId.toString(), docA2Id);
  });
});
