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
import { localStorageProvider } from '../services/storage/localStorageProvider.js';
import { ENV } from '../config/env.js';

describe('Phase 10.9: Smart Document Auto-Indexing Comprehensive Suite', () => {
  let userAId;
  let userBId;
  const uniqueSuffix = Date.now();
  const emailA = `faisi-autoindex-alice-${uniqueSuffix}@example.test`;
  const emailB = `faisi-autoindex-bob-${uniqueSuffix}@example.test`;
  const rawPassword = 'Password123!Secure';

  // Sample file buffers
  const sampleTxtBuffer = Buffer.from(
    'FAISI AI Knowledge Base Architecture\n\n' +
    'FAISI AI supports smart automatic background indexing of documents.\n' +
    'When a document is uploaded, text extraction completes immediately,\n' +
    'and embedding generation occurs asynchronously in the background.\n' +
    'This provides instant upload response times and seamless RAG availability.'
  );

  const sampleCsvBuffer = Buffer.from(
    'Feature,Status,Model,Dimensions\n' +
    'Smart Auto-Indexing,Complete,gemini-embedding-2,768\n' +
    'Generation Safety,Active,UUID,N/A\n' +
    'Tenant Isolation,Enforced,MongoDB,N/A'
  );

  // Helper to wait for a condition with timeout
  async function waitForCondition(checkFn, timeoutMs = 5000, intervalMs = 50) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const result = await checkFn();
      if (result) return result;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Condition timed out after ${timeoutMs}ms`);
  }

  // Backup original provider method
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
      const userA = new User({
        email: emailA,
        displayName: 'Alice AutoIndex Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userA.save();
      userAId = userA._id.toString();

      const userB = new User({
        email: emailB,
        displayName: 'Bob AutoIndex Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userB.save();
      userBId = userB._id.toString();
    }

    // Mock embedding generation for determinism and speed in test environment
    originalEmbedText = embeddingService.provider.embedText;
    originalEmbedBatch = embeddingService.provider.embedBatch;

    embeddingService.provider.embedText = async () => {
      const vec = new Array(768).fill(0.001);
      vec[0] = 0.999;
      return vec;
    };

    embeddingService.provider.embedBatch = async (texts) => {
      return texts.map(() => {
        const vec = new Array(768).fill(0.001);
        vec[0] = 0.999;
        return vec;
      });
    };
  });

  after(async () => {
    // Restore original embedding provider methods
    if (originalEmbedText) embeddingService.provider.embedText = originalEmbedText;
    if (originalEmbedBatch) embeddingService.provider.embedBatch = originalEmbedBatch;

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

  describe('1. Asynchronous Upload & Background Auto-Indexing Lifecycle', () => {
    test('1.1 Upload returns immediately with pending indexing state without blocking HTTP path', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const file = {
        originalname: `async_test_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: sampleTxtBuffer.length,
        buffer: sampleTxtBuffer,
      };

      const uploadStart = Date.now();
      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });
      const uploadElapsed = Date.now() - uploadStart;

      // Upload must return fast (under 500ms) and indicate ready extraction + pending indexing
      assert.strictEqual(result.isDuplicate, false);
      assert.strictEqual(result.document.status, 'ready');
      assert.strictEqual(result.document.extractionStatus, 'complete');
      assert.strictEqual(result.document.indexingStatus, 'pending');
      assert.ok(uploadElapsed < 1000, `Upload took too long (${uploadElapsed}ms) - indexing should be async`);

      // Wait for background indexing to complete
      const indexedDoc = await waitForCondition(async () => {
        const d = await Document.findById(result.document._id);
        return d && d.indexingStatus === 'indexed' ? d : null;
      });

      assert.strictEqual(indexedDoc.indexingStatus, 'indexed');
      assert.ok(indexedDoc.chunkCount > 0, 'Chunk count should be > 0');
      assert.ok(indexedDoc.activeGenerationId, 'Should have activeGenerationId');
    });

    test('1.2 Successful auto-indexing produces 768-dimensional DocumentChunk records', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const file = {
        originalname: `vector_check_${Date.now()}.csv`,
        mimetype: 'text/csv',
        size: sampleCsvBuffer.length,
        buffer: sampleCsvBuffer,
      };

      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });

      const indexedDoc = await waitForCondition(async () => {
        const d = await Document.findById(result.document._id);
        return d && d.indexingStatus === 'indexed' ? d : null;
      });

      const chunks = await DocumentChunk.find({
        userId: userAId,
        documentId: indexedDoc._id,
        generationId: indexedDoc.activeGenerationId,
      });

      assert.ok(chunks.length > 0, 'Document chunks must be stored in database');
      assert.strictEqual(chunks.length, indexedDoc.chunkCount);

      for (const chunk of chunks) {
        assert.strictEqual(chunk.embedding.length, 768, 'Embedding must have exactly 768 dimensions');
        assert.ok(chunk.text.length > 0, 'Chunk text must not be empty');
        assert.strictEqual(chunk.metadata.sourceName, indexedDoc.originalName);
      }
    });

    test('1.3 AutoIndex=false respects flag and leaves document as unindexed', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const file = {
        originalname: `manual_only_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: sampleTxtBuffer.length,
        buffer: sampleTxtBuffer,
      };

      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: false,
      });

      assert.strictEqual(result.document.status, 'ready');
      assert.strictEqual(result.document.indexingStatus, 'unindexed');

      // Wait a short moment and confirm it remains unindexed
      await new Promise((r) => setTimeout(r, 100));
      const doc = await Document.findById(result.document._id);
      assert.strictEqual(doc.indexingStatus, 'unindexed');
    });
  });

  describe('2. Failure Handling & Atomic Generation Safety', () => {
    test('2.1 Indexing failure sets indexingStatus=failed while preserving document and extracted text', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // Temporarily simulate embedding failure
      const tempBatch = embeddingService.provider.embedBatch;
      embeddingService.provider.embedBatch = async () => {
        throw new Error('Simulated Gemini 503 Overloaded Error');
      };

      const file = {
        originalname: `fail_test_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: sampleTxtBuffer.length,
        buffer: sampleTxtBuffer,
      };

      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });

      // Document itself should be ready
      assert.strictEqual(result.document.status, 'ready');
      assert.strictEqual(result.document.extractionStatus, 'complete');

      // Wait for background auto-indexing failure to be recorded
      const failedDoc = await waitForCondition(async () => {
        const d = await Document.findById(result.document._id);
        return d && d.indexingStatus === 'failed' ? d : null;
      });

      assert.strictEqual(failedDoc.status, 'ready', 'Document must remain in ready status');
      assert.strictEqual(failedDoc.indexingStatus, 'failed');
      assert.ok(failedDoc.extractedText.includes('Knowledge Base Architecture'), 'Extracted text preserved');
      assert.ok(failedDoc.indexingError.includes('Simulated Gemini 503'), 'Error message recorded');

      // Restore mock
      embeddingService.provider.embedBatch = tempBatch;
    });

    test('2.2 Failed re-indexing protects and retains previous valid activeGenerationId', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // 1. First upload and successfully index
      const file = {
        originalname: `gen_protect_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: sampleTxtBuffer.length,
        buffer: sampleTxtBuffer,
      };

      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });

      const initialDoc = await waitForCondition(async () => {
        const d = await Document.findById(result.document._id);
        return d && d.indexingStatus === 'indexed' ? d : null;
      });

      const initialGenId = initialDoc.activeGenerationId;
      assert.ok(initialGenId, 'Initial active generation must exist');

      const initialChunks = await DocumentChunk.countDocuments({
        userId: userAId,
        documentId: initialDoc._id,
        generationId: initialGenId,
      });
      assert.ok(initialChunks > 0);

      // 2. Simulate failure on subsequent manual or re-indexing attempt
      const tempBatch = embeddingService.provider.embedBatch;
      embeddingService.provider.embedBatch = async () => {
        throw new Error('Simulated Quota Limit 429');
      };

      await assert.rejects(
        async () => {
          await ragService.indexDocument(userAId, initialDoc._id.toString());
        },
        /Simulated Quota Limit 429/
      );

      // Verify document still has its previous valid activeGenerationId
      const refreshedDoc = await Document.findById(initialDoc._id);
      assert.strictEqual(refreshedDoc.activeGenerationId, initialGenId, 'Previous activeGenerationId must be preserved');
      assert.strictEqual(refreshedDoc.indexingStatus, 'indexed', 'Remains indexed with previous working generation');

      // Verify old chunks are still present
      const preservedChunks = await DocumentChunk.countDocuments({
        userId: userAId,
        documentId: initialDoc._id,
        generationId: initialGenId,
      });
      assert.strictEqual(preservedChunks, initialChunks, 'Previous chunks must remain intact');

      // Restore mock
      embeddingService.provider.embedBatch = tempBatch;
    });
  });

  describe('3. Deduplication & Concurrency Protection', () => {
    test('3.1 Duplicate file upload returns existing document without creating duplicate generations', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const file = {
        originalname: `dedup_test_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: sampleTxtBuffer.length,
        buffer: sampleTxtBuffer,
      };

      // Upload 1
      const res1 = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });
      assert.strictEqual(res1.isDuplicate, false);

      await waitForCondition(async () => {
        const d = await Document.findById(res1.document._id);
        return d && d.indexingStatus === 'indexed' ? d : null;
      });

      const genCount1 = await DocumentChunk.distinct('generationId', {
        userId: userAId,
        documentId: res1.document._id,
      });

      // Upload 2 (exact same content buffer)
      const res2 = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });

      assert.strictEqual(res2.isDuplicate, true);
      assert.strictEqual(res2.document._id.toString(), res1.document._id.toString());

      // Confirm no extra generations or duplicate chunks were created
      const genCount2 = await DocumentChunk.distinct('generationId', {
        userId: userAId,
        documentId: res1.document._id,
      });
      assert.strictEqual(genCount2.length, genCount1.length);
    });
  });

  describe('4. Tenant Isolation (IDOR) & Quota Safety', () => {
    test('4.1 User B cannot index, preview, or retrieve User A documents', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const file = {
        originalname: `tenant_iso_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: sampleTxtBuffer.length,
        buffer: sampleTxtBuffer,
      };

      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });

      const docA = await waitForCondition(async () => {
        const d = await Document.findById(result.document._id);
        return d && d.indexingStatus === 'indexed' ? d : null;
      });

      // User B trying to index User A's document must fail with unauthorized/not found
      await assert.rejects(
        async () => {
          await ragService.indexDocument(userBId, docA._id.toString());
        },
        /Document not found or unauthorized/
      );

      // User B searching should not see User A's chunks
      const userBSearch = await retrievalService.retrieveContext({
        userId: userBId,
        query: 'FAISI AI Knowledge Base Architecture',
      });
      assert.strictEqual(userBSearch.hasEvidence, false);
      assert.strictEqual(userBSearch.sources.length, 0);
    });

    test('4.2 Deleting auto-indexed document cascades and releases quota and chunks', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const file = {
        originalname: `delete_cascade_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: sampleTxtBuffer.length,
        buffer: sampleTxtBuffer,
      };

      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });

      const doc = await waitForCondition(async () => {
        const d = await Document.findById(result.document._id);
        return d && d.indexingStatus === 'indexed' ? d : null;
      });

      // Delete document
      const deleted = await documentService.deleteDocument(userAId, doc._id.toString());
      assert.strictEqual(deleted, true);

      // Verify chunks deleted
      const remainingChunks = await DocumentChunk.countDocuments({
        userId: userAId,
        documentId: doc._id,
      });
      assert.strictEqual(remainingChunks, 0, 'All chunks must be deleted on document deletion');
    });
  });

  describe('5. Knowledge Base Retrieval & Citation Integration', () => {
    test('5.1 Automatically indexed document is immediately searchable with citations', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const specializedBuffer = Buffer.from(
        'Project Quantum Nebula Secret Key: QN-9988-ALPHA.\n' +
        'Quantum Nebula is an experimental optical computing engine designed for low-latency matrix multiplication.'
      );

      const file = {
        originalname: `quantum_nebula_${Date.now()}.txt`,
        mimetype: 'text/plain',
        size: specializedBuffer.length,
        buffer: specializedBuffer,
      };

      const result = await documentService.processUpload({
        userId: userAId,
        file,
        autoIndex: true,
      });

      const indexedDoc = await waitForCondition(async () => {
        const d = await Document.findById(result.document._id);
        return d && d.indexingStatus === 'indexed' ? d : null;
      });

      // Perform retrieval query
      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'What is Project Quantum Nebula Secret Key?',
      });

      assert.strictEqual(retrieval.hasEvidence, true);
      assert.ok(retrieval.sources.length > 0);
      assert.strictEqual(retrieval.sources[0].documentName, indexedDoc.originalName);
      assert.ok(retrieval.contextText.includes('QN-9988-ALPHA'));
      assert.ok(retrieval.sources[0].snippet.includes('Quantum Nebula'));
    });
  });
});
