import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { Conversation } from '../models/Conversation.js';
import {
  embeddingService,
  formatDocumentEmbeddingInput,
  formatQueryEmbeddingInput,
} from '../services/embeddings/embeddingService.js';
import { GeminiEmbeddingProvider } from '../services/embeddings/providers/geminiEmbeddingProvider.js';
import { chunkingService } from '../services/rag/chunkingService.js';
import { vectorStore, computeCosineSimilarity } from '../services/rag/vectorStore.js';
import { retrievalService } from '../services/rag/retrievalService.js';
import { ragService } from '../services/rag/ragService.js';
import { documentService } from '../services/documents/documentService.js';
import { localStorageProvider } from '../services/storage/localStorageProvider.js';
import { DOCUMENT_RAG_SYSTEM_INSTRUCTION } from '../services/ai/systemPrompt.js';
import { ENV } from '../config/env.js';

describe('Phase 7: RAG / Knowledge Base Comprehensive Test Suite', () => {
  let userAId;
  let userBId;
  let docA1Id;
  let docA2Id;
  let docB1Id;

  const uniqueSuffix = Date.now();
  const emailA = `nova-p7-alice-${uniqueSuffix}@example.test`;
  const emailB = `nova-p7-bob-${uniqueSuffix}@example.test`;
  const rawPassword = 'Password123!Secure';

  // Sample mock 768-dimensional normalized vector generator
  function createMockVector(primaryDim = 0, magnitude = 1.0) {
    const vec = new Array(768).fill(0.001);
    vec[primaryDim % 768] = magnitude;
    // Normalize
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map((v) => v / norm);
  }

  before(async () => {
    await localStorageProvider.init();

    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ENV.MONGODB_URI, {
          dbName: ENV.MONGODB_DB_NAME,
          serverSelectionTimeoutMS: 2000,
        });
      }
    } catch {
      // Offline fallback
    }

    if (mongoose.connection.readyState === 1) {
      const userA = new User({
        email: emailA,
        displayName: 'Alice RAG Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userA.save();
      userAId = userA._id.toString();

      const userB = new User({
        email: emailB,
        displayName: 'Bob RAG Tester',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userB.save();
      userBId = userB._id.toString();

      // Create documents for User A
      const docA1 = new Document({
        userId: userA._id,
        originalName: 'nova_architecture_guide.txt',
        sanitizedName: 'nova_architecture_guide.txt',
        mimeType: 'text/plain',
        extension: 'txt',
        size: 2048,
        sha256Hash: `hash_a1_${uniqueSuffix}`,
        storageKey: `key_a1_${uniqueSuffix}`,
        storageProvider: 'local',
        status: 'ready',
        extractedText:
          '# NOVA AI Architecture\n\nNOVA AI uses Gemini 2.5 Flash for chat and Gemini Embedding 2 for vector indexing.\nEmbeddings have 768 dimensions with strict output dimensionality configuration.\nChunking preserves sentence boundaries with 100 character overlaps.',
        extractedTextLength: 260,
      });
      await docA1.save();
      docA1Id = docA1._id.toString();

      const docA2 = new Document({
        userId: userA._id,
        originalName: 'project_metrics.csv',
        sanitizedName: 'project_metrics.csv',
        mimeType: 'text/csv',
        extension: 'csv',
        size: 1024,
        sha256Hash: `hash_a2_${uniqueSuffix}`,
        storageKey: `key_a2_${uniqueSuffix}`,
        storageProvider: 'local',
        status: 'ready',
        extractedText:
          'Metric,Target,Result\nRetrieval Latency,200ms,120ms\nCosine Threshold,0.65,Active\nVector Dimensions,768,Verified',
        extractedTextLength: 110,
      });
      await docA2.save();
      docA2Id = docA2._id.toString();

      // Create document for User B
      const docB1 = new Document({
        userId: userB._id,
        originalName: 'confidential_bob_notes.txt',
        sanitizedName: 'confidential_bob_notes.txt',
        mimeType: 'text/plain',
        extension: 'txt',
        size: 512,
        sha256Hash: `hash_b1_${uniqueSuffix}`,
        storageKey: `key_b1_${uniqueSuffix}`,
        storageProvider: 'local',
        status: 'ready',
        extractedText: 'Confidential project details belonging exclusively to Bob. Alice must never see this.',
        extractedTextLength: 85,
      });
      await docB1.save();
      docB1Id = docB1._id.toString();
    }
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      if (userAId) {
        await DocumentChunk.deleteMany({ userId: userAId });
        await Document.deleteMany({ userId: userAId });
        await Conversation.deleteMany({ userId: userAId });
        await User.findByIdAndDelete(userAId);
      }
      if (userBId) {
        await DocumentChunk.deleteMany({ userId: userBId });
        await Document.deleteMany({ userId: userBId });
        await Conversation.deleteMany({ userId: userBId });
        await User.findByIdAndDelete(userBId);
      }
    }
  });

  // -------------------------------------------------------------
  // 1. Gemini Embedding 2 Configuration & Formatting Invariants
  // -------------------------------------------------------------
  describe('1. Gemini Embedding 2 Configuration & Invariants', () => {
    test('Deterministic Document Embedding formatting follows "title: {title} | text: {content}"', () => {
      const formatted = formatDocumentEmbeddingInput({
        title: 'System Architecture',
        text: 'NOVA AI utilizes 768-dim embeddings.',
      });
      assert.strictEqual(formatted, 'title: System Architecture | text: NOVA AI utilizes 768-dim embeddings.');
    });

    test('Deterministic Query Embedding formatting follows "task: question answering | query: {query}"', () => {
      const formatted = formatQueryEmbeddingInput('What is the embedding dimension?');
      assert.strictEqual(formatted, 'task: question answering | query: What is the embedding dimension?');
    });

    test('GeminiEmbeddingProvider sets model=gemini-embedding-2 and outputDimensionality=768', () => {
      const provider = new GeminiEmbeddingProvider();
      assert.strictEqual(provider.model, 'gemini-embedding-2');
      assert.strictEqual(provider.dimensions, 768);
    });

    test('Provider validates that returned vectors contain strictly 768 finite numeric values', () => {
      const validVector = new Array(768).fill(0.123);
      assert.doesNotThrow(() => {
        const provider = new GeminiEmbeddingProvider();
        provider.validateVector(validVector);
      });

      // Wrong dimension
      assert.throws(() => {
        const provider = new GeminiEmbeddingProvider();
        provider.validateVector(new Array(512).fill(0.1));
      }, /Invalid embedding vector: expected 768 dimensions/);

      // Non-finite value (NaN)
      assert.throws(() => {
        const provider = new GeminiEmbeddingProvider();
        const nanVec = new Array(768).fill(0.1);
        nanVec[10] = NaN;
        provider.validateVector(nanVec);
      }, /not a finite number/);
    });

    test('Batch embedding splits large chunk arrays according to EMBEDDING_BATCH_SIZE (20)', async () => {
      // Mock provider to capture batch chunks
      const capturedBatches = [];
      const mockProvider = {
        name: 'MockGeminiEmbeddingProvider',
        model: 'gemini-embedding-2',
        dimensions: 768,
        async embedBatch(texts) {
          capturedBatches.push(texts.length);
          return texts.map(() => createMockVector(1));
        },
      };

      const originalProvider = embeddingService.provider;
      embeddingService.provider = mockProvider;

      try {
        const dummyItems = new Array(45).fill({
          title: 'Test',
          text: 'Sample chunk text for batching verification.',
        });
        const result = await embeddingService.generateBatchEmbeddings(dummyItems);

        assert.strictEqual(result.length, 45);
        assert.deepStrictEqual(capturedBatches, [20, 20, 5]);
      } finally {
        embeddingService.provider = originalProvider;
      }
    });
  });

  // -------------------------------------------------------------
  // 2. Semantic & Tabular Chunking Service
  // -------------------------------------------------------------
  describe('2. Semantic & Tabular Chunking Service', () => {
    test('Chunks text respecting paragraph and sentence boundaries with truthful null provenance', () => {
      const sampleText = `NOVA AI is a cutting-edge AI workspace designed for professionals.\n\nIt features real-time streaming, persistent conversation sync, and robust multi-format document analysis.\n\nIn Phase 7, a full Retrieval-Augmented Generation system is integrated with Gemini Embedding 2.`;
      const fakeDoc = {
        _id: new mongoose.Types.ObjectId(),
        originalName: 'overview.txt',
        extension: 'txt',
        extractedText: sampleText,
      };

      const chunks = chunkingService.chunkDocument(fakeDoc, 'gen_test_1');

      assert.ok(chunks.length >= 1, `Expected at least 1 chunk, got ${chunks.length}`);
      chunks.forEach((c, idx) => {
        assert.strictEqual(c.chunkIndex, idx);
        assert.ok(c.text.length > 0);
        assert.strictEqual(c.metadata.pageNumber, null, 'pageNumber must be truthfully null when not extracted');
      });
    });

    test('CSV Tabular Chunking groups rows preserving header context', () => {
      const csvText = `ID,Component,Status\n1,Authentication,Approved\n2,Document Storage,Approved\n3,RAG Retrieval,Approved\n4,Vector Indexing,Approved`;
      const fakeCsvDoc = {
        _id: new mongoose.Types.ObjectId(),
        originalName: 'status.csv',
        extension: 'csv',
        extractedText: csvText,
        csvMetadata: { rowCount: 4 },
      };

      const chunks = chunkingService.chunkDocument(fakeCsvDoc, 'gen_test_csv');

      assert.ok(chunks.length >= 1);
      assert.ok(chunks[0].text.includes('CSV Table (4 rows)'));
      assert.ok(chunks[0].text.includes('ID,Component,Status'));
      assert.ok(chunks[0].text.includes('Authentication'));
      assert.strictEqual(chunks[0].metadata.pageNumber, null);
    });

    test('Enforces MAX_CHUNKS_PER_DOCUMENT ceiling (250 chunks)', () => {
      const hugeText = new Array(600).fill('Sentence describing a complex software architecture component. ').join('\n\n');
      const fakeHugeDoc = {
        _id: new mongoose.Types.ObjectId(),
        originalName: 'huge.txt',
        extension: 'txt',
        extractedText: hugeText,
      };

      const chunks = chunkingService.chunkDocument(fakeHugeDoc, 'gen_test_huge');
      assert.ok(chunks.length <= 250, `Chunk count ${chunks.length} exceeded max 250`);
    });
  });

  // -------------------------------------------------------------
  // 3. Vector Similarity & Vector Store
  // -------------------------------------------------------------
  describe('3. Vector Similarity & Dual Engine Vector Store', () => {
    test('Cosine similarity mathematical properties (Identical=1, Orthogonal=0, Opposite=-1)', () => {
      const v1 = [1, 0, 0];
      const v2 = [1, 0, 0];
      const v3 = [0, 1, 0];
      const v4 = [-1, 0, 0];

      assert.strictEqual(Math.round(computeCosineSimilarity(v1, v2) * 100) / 100, 1.0);
      assert.strictEqual(Math.round(computeCosineSimilarity(v1, v3) * 100) / 100, 0.0);
      assert.strictEqual(Math.round(computeCosineSimilarity(v1, v4) * 100) / 100, -1.0);
    });

    test('Vector search enforces numCandidates >= limit invariant', () => {
      assert.ok(
        ENV.RAG_NUM_CANDIDATES >= ENV.RAG_TOP_K,
        `numCandidates (${ENV.RAG_NUM_CANDIDATES}) must be >= top_k (${ENV.RAG_TOP_K})`
      );
    });

    test('Atlas failure in production mode does NOT dump vectors or silently fall back to local_memory', async () => {
      const originalType = vectorStore.type;
      vectorStore.type = 'mongodb_atlas';

      try {
        const originalAggregate = DocumentChunk.aggregate;
        DocumentChunk.aggregate = async () => {
          throw new Error('MongoDB Atlas $vectorSearch failed');
        };

        await assert.rejects(
          async () => {
            await vectorStore.search({
              userId: userAId || new mongoose.Types.ObjectId(),
              queryVector: createMockVector(0),
              topK: 5,
              similarityThreshold: 0.65,
            });
          },
          (err) => {
            assert.ok(err.message.includes('MongoDB Atlas Vector Search failed') || err.message.includes('Atlas'));
            return true;
          }
        );

        DocumentChunk.aggregate = originalAggregate;
      } finally {
        vectorStore.type = originalType;
      }
    });
  });

  // -------------------------------------------------------------
  // 4. Safe Multi-Generation Re-Indexing & Atomic Swap
  // -------------------------------------------------------------
  describe('4. Multi-Generation Safe Re-Indexing & Cascading Deletion', () => {
    test('Indexing creates active generation and populates DocumentChunk records', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const originalProvider = embeddingService.provider;
      embeddingService.provider = {
        name: 'MockGeminiEmbeddingProvider',
        model: 'gemini-embedding-2',
        dimensions: 768,
        async embedBatch(texts) {
          return texts.map((_, i) => createMockVector(i + 1));
        },
      };

      try {
        const result = await ragService.indexDocument(userAId, docA1Id);
        assert.strictEqual(result.documentId, docA1Id);
        assert.ok(result.generationId.startsWith('gen_'));
        assert.ok(result.chunkCount > 0);

        const updatedDoc = await Document.findById(docA1Id);
        assert.strictEqual(updatedDoc.indexingStatus, 'indexed');
        assert.strictEqual(updatedDoc.activeGenerationId, result.generationId);
        assert.strictEqual(updatedDoc.chunkCount, result.chunkCount);

        const chunks = await DocumentChunk.find({
          documentId: docA1Id,
          generationId: result.generationId,
        });
        assert.strictEqual(chunks.length, result.chunkCount);
      } finally {
        embeddingService.provider = originalProvider;
      }
    });

    test('Failed re-indexing preserves the previous working generation and cleans up failed chunks', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const doc = await Document.findById(docA1Id);
      const originalGenerationId = doc.activeGenerationId;
      const originalChunkCount = doc.chunkCount;
      assert.ok(originalGenerationId, 'Document must have an active generation from previous test');

      // Force embedding failure on next re-indexing
      const originalProvider = embeddingService.provider;
      embeddingService.provider = {
        name: 'FailingProvider',
        model: 'gemini-embedding-2',
        dimensions: 768,
        async embedBatch() {
          throw new Error('Simulated Gemini API 503 Quota / Service Unavailable');
        },
      };

      try {
        await assert.rejects(
          async () => {
            await ragService.indexDocument(userAId, docA1Id);
          },
          (err) => {
            assert.ok(err.message.includes('Simulated Gemini API'));
            return true;
          }
        );

        // Verify document state is STILL active and points to original generation
        const preservedDoc = await Document.findById(docA1Id);
        assert.strictEqual(preservedDoc.indexingStatus, 'indexed');
        assert.strictEqual(preservedDoc.activeGenerationId, originalGenerationId);
        assert.strictEqual(preservedDoc.chunkCount, originalChunkCount);

        // Verify original chunks still exist
        const originalChunks = await DocumentChunk.find({
          documentId: docA1Id,
          generationId: originalGenerationId,
        });
        assert.strictEqual(originalChunks.length, originalChunkCount);
      } finally {
        embeddingService.provider = originalProvider;
      }
    });

    test('Deleting document cascades and cleans up all associated DocumentChunk records', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // Index docA2 first
      const originalProvider = embeddingService.provider;
      embeddingService.provider = {
        name: 'MockGeminiEmbeddingProvider',
        model: 'gemini-embedding-2',
        dimensions: 768,
        async embedBatch(texts) {
          return texts.map(() => createMockVector(2));
        },
      };

      try {
        await ragService.indexDocument(userAId, docA2Id);

        const chunksBefore = await DocumentChunk.find({ documentId: docA2Id });
        assert.ok(chunksBefore.length > 0);

        // Delete document via documentService
        await documentService.deleteDocument(userAId, docA2Id);

        // Verify chunks were cascaded and deleted
        const chunksAfter = await DocumentChunk.find({ documentId: docA2Id });
        assert.strictEqual(chunksAfter.length, 0);
      } finally {
        embeddingService.provider = originalProvider;
      }
    });
  });

  // -------------------------------------------------------------
  // 5. Multi-Tenant Security, IDOR Protection & Citation Sanitization
  // -------------------------------------------------------------
  describe('5. Multi-Tenant Isolation & Security Controls', () => {
    test('User B cannot retrieve User A chunks via vector search', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const results = await vectorStore.search({
        userId: userBId,
        queryVector: createMockVector(1),
        topK: 10,
        similarityThreshold: 0.1,
      });

      // User B should find 0 chunks (none of user B docs are indexed yet)
      assert.strictEqual(results.length, 0);
    });

    test('User B cannot access or preview User A chunk metadata', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const chunkA = await DocumentChunk.findOne({ userId: userAId });
      if (!chunkA) return;

      await assert.rejects(
        async () => {
          await ragService.getChunkPreview(userBId, chunkA._id.toString());
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    test('DocumentChunk schema toJSON strips raw embeddings, storage keys, and filesystem paths', () => {
      const chunk = new DocumentChunk({
        userId: new mongoose.Types.ObjectId(),
        documentId: new mongoose.Types.ObjectId(),
        generationId: 'gen_test_123',
        chunkIndex: 0,
        text: 'NOVA AI secure chunk text.',
        tokenCount: 6,
        embedding: new Array(768).fill(0.05),
      });

      const json = chunk.toJSON();
      assert.strictEqual(json.embedding, undefined, 'embedding vector must be stripped from toJSON');
      assert.strictEqual(json.storageKey, undefined, 'storageKey must not exist');
    });

    test('Selected document IDs are strictly authorized against authenticated user documents', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const selected = [docB1Id, docA1Id];
      const validIds = await ragService.validateSelectedDocumentIds(userAId, selected);

      assert.strictEqual(validIds.length, 1);
      assert.strictEqual(validIds[0], docA1Id);
      assert.ok(!validIds.includes(docB1Id), 'User B document ID must be filtered out');
    });
  });

  // -------------------------------------------------------------
  // 6. Retrieval Service & Prompt Injection Isolation
  // -------------------------------------------------------------
  describe('6. Retrieval Service & Prompt Injection Isolation', () => {
    test('Retrieval context strictly bounded by MAX_RAG_CONTEXT_CHARS (12000)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const originalProvider = embeddingService.provider;
      embeddingService.provider = {
        name: 'MockGeminiEmbeddingProvider',
        model: 'gemini-embedding-2',
        dimensions: 768,
        async embedText() {
          return createMockVector(1);
        },
      };

      try {
        const result = await retrievalService.retrieveKnowledgeContext({
          userId: userAId,
          query: 'What is NOVA AI architecture?',
        });

        assert.ok(result.contextText.length <= ENV.MAX_RAG_CONTEXT_CHARS);
        assert.ok(Array.isArray(result.sources));
      } finally {
        embeddingService.provider = originalProvider;
      }
    });

    test('System Prompt encapsulates retrieved documents in <RETRIEVED_KNOWLEDGE_BASE> isolation tags', () => {
      assert.ok(DOCUMENT_RAG_SYSTEM_INSTRUCTION.includes('<RETRIEVED_KNOWLEDGE_BASE>'));
      assert.ok(DOCUMENT_RAG_SYSTEM_INSTRUCTION.includes('UNTRUSTED CONTEXT BOUNDARY'));
      assert.ok(
        DOCUMENT_RAG_SYSTEM_INSTRUCTION.includes(
          "I couldn't find enough relevant information in your uploaded documents to answer this confidently."
        )
      );
    });

    test('Strict No-Evidence response format returned when no chunks pass similarity threshold', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const originalProvider = embeddingService.provider;
      embeddingService.provider = {
        name: 'MockGeminiEmbeddingProvider',
        model: 'gemini-embedding-2',
        dimensions: 768,
        async embedText() {
          // Completely orthogonal vector to stored vectors
          return createMockVector(700);
        },
      };

      try {
        const result = await retrievalService.retrieveKnowledgeContext({
          userId: userAId,
          query: 'Quantum entanglement in space telescopes',
        });

        assert.strictEqual(result.hasEvidence, false);
        assert.strictEqual(result.chunks.length, 0);
        assert.strictEqual(result.sources.length, 0);
      } finally {
        embeddingService.provider = originalProvider;
      }
    });
  });
});
