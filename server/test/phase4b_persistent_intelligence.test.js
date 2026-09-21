import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { documentService } from '../services/documents/documentService.js';
import { geminiService, validateAndSanitizeIntelligence } from '../services/ai/geminiService.js';
import { aiService } from '../services/ai/aiService.js';
import { localStorageProvider } from '../services/storage/localStorageProvider.js';
import { chunkingService } from '../services/rag/chunkingService.js';
import { extractPdfText } from '../services/documents/extractors/pdfExtractor.js';
import { TimeoutError, AIProviderError } from '../utils/errors.js';
import { ENV } from '../config/env.js';

/**
 * Helper to construct a valid multi-page PDF binary buffer in memory for provenance verification.
 */
function createTestPdfBuffer(pagesText) {
  const numPages = pagesText.length;
  const pageObjStartNum = 3;
  const fontObjNum = pageObjStartNum + numPages * 2;
  const objOffsets = [];

  let pdf = '%PDF-1.4\n';
  objOffsets.push(pdf.length);
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  const pageRefs = [];
  for (let i = 0; i < numPages; i++) {
    const pageNum = pageObjStartNum + i * 2;
    pageRefs.push(pageNum + ' 0 R');
  }

  objOffsets.push(pdf.length);
  pdf += '2 0 obj\n<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + numPages + ' >>\nendobj\n';

  for (let i = 0; i < numPages; i++) {
    const pageObjNum = pageObjStartNum + i * 2;
    const contentObjNum = pageObjNum + 1;
    const text = pagesText[i];
    const streamContent = 'BT /F1 12 Tf 100 700 Td (' + text + ') Tj ET';

    objOffsets.push(pdf.length);
    pdf += pageObjNum + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + contentObjNum + ' 0 R /Resources << /Font << /F1 ' + fontObjNum + ' 0 R >> >> >>\nendobj\n';

    objOffsets.push(pdf.length);
    pdf += contentObjNum + ' 0 obj\n<< /Length ' + streamContent.length + ' >>\nstream\n' + streamContent + '\nendstream\nendobj\n';
  }

  objOffsets.push(pdf.length);
  pdf += fontObjNum + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const startxref = pdf.length;
  pdf += 'xref\n0 ' + (fontObjNum + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 0; i < objOffsets.length; i++) {
    const offsetStr = String(objOffsets[i]).padStart(10, '0');
    pdf += offsetStr + ' 00000 n \n';
  }

  pdf += 'trailer\n<< /Size ' + (fontObjNum + 1) + ' /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF';
  return Buffer.from(pdf);
}

describe('Phase 4B: Persistent Document Intelligence Test Suite', () => {
  let userAId = new mongoose.Types.ObjectId().toString();
  let userBId = new mongoose.Types.ObjectId().toString();
  const uniqueSuffix = Date.now();
  const emailA = `faisi-p4b-alice-${uniqueSuffix}@example.test`;
  const emailB = `faisi-p4b-bob-${uniqueSuffix}@example.test`;
  const rawPassword = 'Password123!Secure';

  let originalGetClient;
  let geminiCallCount = 0;

  // In-memory document & user store for offline/local test execution
  const inMemoryDocs = new Map();
  let isUsingMemoryStore = false;
  let originalDocMethods = {};
  let originalUserMethods = {};

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
      // Offline fallback: Use in-memory store for models
    }

    if (mongoose.connection.readyState === 1) {
      try {
        const userA = new User({
          email: emailA,
          displayName: 'Alice Intelligence',
          passwordHash: await User.hashPassword(rawPassword),
        });
        await userA.save();
        userAId = userA._id.toString();

        const userB = new User({
          email: emailB,
          displayName: 'Bob Intelligence',
          passwordHash: await User.hashPassword(rawPassword),
        });
        await userB.save();
        userBId = userB._id.toString();
      } catch {
        // Fall back to memory store if database write fails
      }
    }

    if (mongoose.connection.readyState !== 1) {
      isUsingMemoryStore = true;

      // Mock Document methods
      originalDocMethods = {
        create: Document.create,
        findById: Document.findById,
        findOne: Document.findOne,
        findOneAndUpdate: Document.findOneAndUpdate,
        updateOne: Document.updateOne,
        deleteOne: Document.deleteOne,
        deleteMany: Document.deleteMany,
      };

      originalUserMethods = {
        findOneAndUpdate: User.findOneAndUpdate,
        updateOne: User.updateOne,
        findById: User.findById,
        deleteMany: User.deleteMany,
      };

      DocumentChunk.deleteMany = async () => ({ deletedCount: 0 });

      // Helper to wrap raw doc with Mongoose-like behaviors
      function wrapDoc(data) {
        const docObj = {
          _id: data._id || new mongoose.Types.ObjectId(),
          userId: data.userId,
          originalName: data.originalName,
          safeName: data.safeName || data.originalName,
          mimeType: data.mimeType || 'application/pdf',
          extension: data.extension || 'pdf',
          size: data.size || 100,
          sha256: data.sha256,
          storageKey: data.storageKey,
          status: data.status || 'ready',
          extractionStatus: data.extractionStatus || 'complete',
          extractedText: data.extractedText || '',
          extractedTextLength: data.extractedTextLength || (data.extractedText ? data.extractedText.length : 0),
          pageCount: data.pageCount || 1,
          createdAt: data.createdAt || new Date(),
          updatedAt: data.updatedAt || new Date(),
          intelligence: {
            status: 'idle',
            summary: null,
            keyTopics: [],
            keyFacts: [],
            sourceSha256: null,
            model: null,
            promptVersion: 'v1',
            generatedAt: null,
            generationId: null,
            generationStartedAt: null,
            error: null,
            ...(data.intelligence || {}),
          },
        };

        docObj.save = async function () {
          docObj.updatedAt = new Date();
          inMemoryDocs.set(docObj._id.toString(), docObj);
          return docObj;
        };

        return docObj;
      }

      Document.create = async function (data) {
        const doc = wrapDoc(data);
        inMemoryDocs.set(doc._id.toString(), doc);
        return doc;
      };

      Document.findById = async function (id) {
        if (!id) return null;
        return inMemoryDocs.get(id.toString()) || null;
      };

      Document.findOne = async function (query) {
        for (const doc of inMemoryDocs.values()) {
          let match = true;
          if (query._id && doc._id.toString() !== query._id.toString()) match = false;
          if (query.userId && doc.userId.toString() !== query.userId.toString()) match = false;
          if (match) return doc;
        }
        return null;
      };

      Document.findOneAndUpdate = async function (query, update, options) {
        for (const doc of inMemoryDocs.values()) {
          let match = true;
          if (query._id && doc._id.toString() !== query._id.toString()) match = false;
          if (query.userId && doc.userId.toString() !== query.userId.toString()) match = false;
          if (query.status && doc.status !== query.status) match = false;
          if (query['intelligence.generationId'] && doc.intelligence?.generationId !== query['intelligence.generationId']) match = false;

          if (query.$or) {
            const orMatched = query.$or.some((clause) => {
              let clauseMatch = true;

              if (clause['intelligence.status']) {
                if (typeof clause['intelligence.status'] === 'string') {
                  if (doc.intelligence?.status !== clause['intelligence.status']) {
                    clauseMatch = false;
                  }
                } else if (clause['intelligence.status'].$in) {
                  if (!clause['intelligence.status'].$in.includes(doc.intelligence?.status)) {
                    clauseMatch = false;
                  }
                }
              }

              if (clause['intelligence.status']?.$exists === false) {
                if (doc.intelligence?.status) {
                  clauseMatch = false;
                }
              }

              if (clause['intelligence.sourceSha256']?.$ne !== undefined) {
                if (doc.intelligence?.sourceSha256 === clause['intelligence.sourceSha256'].$ne) {
                  clauseMatch = false;
                }
              }

              if (clause['intelligence.generationStartedAt']?.$lt) {
                if (
                  doc.intelligence?.status !== 'generating' ||
                  !doc.intelligence?.generationStartedAt ||
                  new Date(doc.intelligence.generationStartedAt).getTime() >= new Date(clause['intelligence.generationStartedAt'].$lt).getTime()
                ) {
                  clauseMatch = false;
                }
              }

              return clauseMatch;
            });
            if (!orMatched) match = false;
          }

          if (match) {
            if (update.$set) {
              for (const [key, val] of Object.entries(update.$set)) {
                if (key.startsWith('intelligence.')) {
                  const subKey = key.replace('intelligence.', '');
                  doc.intelligence[subKey] = val;
                } else {
                  doc[key] = val;
                }
              }
            }
            doc.updatedAt = new Date();
            inMemoryDocs.set(doc._id.toString(), doc);
            return doc;
          }
        }
        return null;
      };

      Document.updateOne = async function (query, update) {
        for (const doc of inMemoryDocs.values()) {
          let match = true;
          if (query._id && doc._id.toString() !== query._id.toString()) match = false;
          if (query.userId && doc.userId.toString() !== query.userId.toString()) match = false;
          if (query['intelligence.generationId'] && doc.intelligence?.generationId !== query['intelligence.generationId']) match = false;

          if (match) {
            if (update.$set) {
              for (const [key, val] of Object.entries(update.$set)) {
                if (key.startsWith('intelligence.')) {
                  const subKey = key.replace('intelligence.', '');
                  doc.intelligence[subKey] = val;
                } else {
                  doc[key] = val;
                }
              }
            }
            doc.updatedAt = new Date();
            inMemoryDocs.set(doc._id.toString(), doc);
            return { matchedCount: 1, modifiedCount: 1 };
          }
        }
        return { matchedCount: 0, modifiedCount: 0 };
      };

      Document.deleteOne = async function (query) {
        for (const [id, doc] of inMemoryDocs.entries()) {
          let match = true;
          if (query._id && doc._id.toString() !== query._id.toString()) match = false;
          if (query.userId && doc.userId.toString() !== query.userId.toString()) match = false;
          if (match) {
            inMemoryDocs.delete(id);
            return { deletedCount: 1 };
          }
        }
        return { deletedCount: 0 };
      };

      Document.deleteMany = async function (query) {
        let deleted = 0;
        for (const [id, doc] of inMemoryDocs.entries()) {
          let match = true;
          if (query?.userId?.$in) {
            const allowed = query.userId.$in.map((u) => u.toString());
            if (!allowed.includes(doc.userId.toString())) match = false;
          }
          if (match) {
            inMemoryDocs.delete(id);
            deleted++;
          }
        }
        return { deletedCount: deleted };
      };

      User.findOneAndUpdate = async () => ({ _id: userAId, documentCount: 1, storageUsedBytes: 100 });
      User.updateOne = async () => ({ matchedCount: 1, modifiedCount: 1 });
      User.findById = async () => ({ _id: userAId, documentCount: 1, storageUsedBytes: 100 });
      User.deleteMany = async () => ({ deletedCount: 0 });
    }

    originalGetClient = geminiService.getClient;
  });

  beforeEach(() => {
    geminiCallCount = 0;
    // Standard mock for Gemini structured output
    geminiService.getClient = () => ({
      models: {
        generateContent: async () => {
          geminiCallCount++;
          return {
            text: JSON.stringify({
              summary: 'Executive Summary: FAISI AI offers advanced persistent document intelligence with verified provenance and multi-tenant security.',
              keyTopics: ['Document Intelligence', 'Multi-tenant Isolation', 'Structured Output'],
              keyFacts: [
                'Persistence reduces redundant Gemini API calls to zero on cached lookups.',
                'Uses SHA-256 source content fingerprinting for automatic cache validation.',
                'Enforces atomic status claim to prevent race conditions during generation.',
              ],
            }),
          };
        },
      },
    });
  });

  after(async () => {
    geminiService.getClient = originalGetClient;
    if (isUsingMemoryStore) {
      Object.assign(Document, originalDocMethods);
      Object.assign(User, originalUserMethods);
    }
    if (mongoose.connection.readyState === 1) {
      try {
        await Document.deleteMany({ userId: { $in: [userAId, userBId] } });
        await User.deleteMany({ _id: { $in: [userAId, userBId] } });
      } catch {}
    }
  });

  // Helper to create a test ready document
  async function createTestDoc(userId, name = 'annual_report.pdf', text = 'Default document content for analysis.') {
    const sha256 = crypto.createHash('sha256').update(text).digest('hex');
    const storageKey = `test-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    return await Document.create({
      userId: new mongoose.Types.ObjectId(userId),
      originalName: name,
      safeName: name,
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: Buffer.byteLength(text),
      sha256,
      storageKey,
      status: 'ready',
      extractionStatus: 'complete',
      extractedText: text,
      extractedTextLength: text.length,
      pageCount: 1,
    });
  }

  // =========================================================================
  // 1. Schema & Persistence
  // =========================================================================
  test('1. Document intelligence schema stores and retrieves all required fields correctly', async () => {
    const doc = await createTestDoc(userAId, 'schema_test.pdf', 'Content for schema testing');
    const now = new Date();
    const genId = crypto.randomUUID();

    doc.intelligence = {
      status: 'ready',
      summary: 'Test summary paragraph.',
      keyTopics: ['Topic A', 'Topic B'],
      keyFacts: ['Fact 1', 'Fact 2'],
      sourceSha256: doc.sha256,
      model: 'gemini-3.6-flash',
      promptVersion: 'v1',
      generatedAt: now,
      generationId: genId,
      generationStartedAt: null,
      error: null,
    };
    await doc.save();

    const fetched = await Document.findById(doc._id);
    assert.strictEqual(fetched.intelligence.status, 'ready');
    assert.strictEqual(fetched.intelligence.summary, 'Test summary paragraph.');
    assert.deepStrictEqual(fetched.intelligence.keyTopics, ['Topic A', 'Topic B']);
    assert.deepStrictEqual(fetched.intelligence.keyFacts, ['Fact 1', 'Fact 2']);
    assert.strictEqual(fetched.intelligence.sourceSha256, doc.sha256);
    assert.strictEqual(fetched.intelligence.model, 'gemini-3.6-flash');
    assert.strictEqual(fetched.intelligence.promptVersion, 'v1');
    assert.strictEqual(fetched.intelligence.generationId, genId);
    assert.strictEqual(fetched.intelligence.generationStartedAt, null);
    assert.strictEqual(fetched.intelligence.error, null);
  });

  // =========================================================================
  // 2. First Generation (Cache Miss)
  // =========================================================================
  test('2. First generation calls Gemini and persists structured intelligence', async () => {
    const doc = await createTestDoc(userAId, 'first_gen.pdf', 'Document text for first generation');
    
    const result = await documentService.generateDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(result.cached, false);
    assert.strictEqual(geminiCallCount, 1);
    assert.ok(result.intelligence.summary.includes('Executive Summary'));
    assert.strictEqual(result.intelligence.status, 'ready');
    assert.strictEqual(result.intelligence.sourceSha256, doc.sha256);
    assert.strictEqual(result.intelligence.keyTopics.length, 3);
    assert.strictEqual(result.intelligence.keyFacts.length, 3);

    // Verify written to database
    const saved = await Document.findById(doc._id);
    assert.strictEqual(saved.intelligence.status, 'ready');
    assert.strictEqual(saved.intelligence.summary, result.intelligence.summary);
  });

  // =========================================================================
  // 3. Cache Hit (Zero Gemini Calls)
  // =========================================================================
  test('3. Cache hit returns persisted intelligence with 0 Gemini API calls', async () => {
    const doc = await createTestDoc(userAId, 'cache_hit.pdf', 'Document text for cache hit testing');
    
    // Initial generation
    await documentService.generateDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(geminiCallCount, 1);

    // Second call via generateDocumentIntelligence (force=false)
    geminiCallCount = 0;
    const res1 = await documentService.generateDocumentIntelligence(userAId, doc._id.toString(), { force: false });
    assert.strictEqual(res1.cached, true);
    assert.strictEqual(geminiCallCount, 0, 'Gemini MUST NOT be called on cache hit');
    assert.strictEqual(res1.intelligence.status, 'ready');

    // Third call via getDocumentIntelligence (GET endpoint)
    const res2 = await documentService.getDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(res2.cached, true);
    assert.strictEqual(geminiCallCount, 0, 'Gemini MUST NOT be called on GET intelligence');
    assert.strictEqual(res2.intelligence.status, 'ready');
  });

  // =========================================================================
  // 4. Force Regeneration
  // =========================================================================
  test('4. Force regeneration bypasses valid cache and calls Gemini again', async () => {
    const doc = await createTestDoc(userAId, 'force_regen.pdf', 'Document text for force regen');
    
    // Initial generation
    await documentService.generateDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(geminiCallCount, 1);

    // Forced regeneration
    geminiCallCount = 0;
    const forced = await documentService.generateDocumentIntelligence(userAId, doc._id.toString(), { force: true });
    assert.strictEqual(forced.cached, false);
    assert.strictEqual(geminiCallCount, 1, 'Gemini MUST be called when force is true');
    assert.strictEqual(forced.intelligence.status, 'ready');
  });

  // =========================================================================
  // 5. SHA Mismatch Invalidation
  // =========================================================================
  test('5. Source SHA-256 mismatch invalidates cache and triggers fresh generation', async () => {
    const doc = await createTestDoc(userAId, 'sha_mismatch.pdf', 'Original text');
    
    // Generate initial intelligence
    await documentService.generateDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(geminiCallCount, 1);

    // Simulate content change by altering document sha256
    const newHash = crypto.createHash('sha256').update('Altered content text').digest('hex');
    doc.sha256 = newHash;
    doc.extractedText = 'Altered content text';
    await doc.save();

    // Cache check should be invalid
    const isCacheValid = documentService.isCachedIntelligenceValid(doc);
    assert.strictEqual(isCacheValid, false);

    // Call generateDocumentIntelligence with force=false -> triggers fresh generation
    geminiCallCount = 0;
    const refreshed = await documentService.generateDocumentIntelligence(userAId, doc._id.toString(), { force: false });
    assert.strictEqual(refreshed.cached, false);
    assert.strictEqual(geminiCallCount, 1, 'Gemini MUST be called when source hash changes');
    assert.strictEqual(refreshed.intelligence.sourceSha256, newHash);
  });

  // =========================================================================
  // 6. Structured Output Validation
  // =========================================================================
  test('6. validateAndSanitizeIntelligence accepts valid structured JSON and bounds fields', () => {
    const validJson = JSON.stringify({
      summary: '  Executive Summary of the findings.  ',
      keyTopics: ['  Topic 1  ', 'Topic 2', ''],
      keyFacts: ['Fact 1', '   ', 'Fact 2'],
    });

    const parsed = validateAndSanitizeIntelligence(validJson);
    assert.strictEqual(parsed.summary, 'Executive Summary of the findings.');
    assert.deepStrictEqual(parsed.keyTopics, ['Topic 1', 'Topic 2']);
    assert.deepStrictEqual(parsed.keyFacts, ['Fact 1', 'Fact 2']);
  });

  // =========================================================================
  // 7. Malformed JSON Handling
  // =========================================================================
  test('7. validateAndSanitizeIntelligence safely rejects malformed unparseable JSON', () => {
    assert.throws(
      () => validateAndSanitizeIntelligence('This is plain text, not JSON.'),
      (err) => err instanceof AIProviderError && err.code === 'INVALID_STRUCTURED_OUTPUT'
    );
  });

  // =========================================================================
  // 8. Markdown-Wrapped JSON Handling
  // =========================================================================
  test('8. validateAndSanitizeIntelligence safely strips markdown code fences before parsing', () => {
    const wrappedJson = '```json\n{\n  "summary": "Clean summary from code block.",\n  "keyTopics": ["A", "B"],\n  "keyFacts": ["1", "2"]\n}\n```';
    const parsed = validateAndSanitizeIntelligence(wrappedJson);
    assert.strictEqual(parsed.summary, 'Clean summary from code block.');
    assert.deepStrictEqual(parsed.keyTopics, ['A', 'B']);
    assert.deepStrictEqual(parsed.keyFacts, ['1', '2']);
  });

  // =========================================================================
  // 9. Missing / Invalid Fields Rejection
  // =========================================================================
  test('9. validateAndSanitizeIntelligence rejects missing summary or invalid array types', () => {
    // Missing summary
    assert.throws(
      () => validateAndSanitizeIntelligence(JSON.stringify({ keyTopics: ['A'], keyFacts: ['1'] })),
      (err) => err instanceof AIProviderError && err.code === 'INVALID_STRUCTURED_OUTPUT'
    );

    // keyTopics not an array
    assert.throws(
      () => validateAndSanitizeIntelligence(JSON.stringify({ summary: 'Valid', keyTopics: 'Not an array', keyFacts: [] })),
      (err) => err instanceof AIProviderError && err.code === 'INVALID_STRUCTURED_OUTPUT'
    );
  });

  // =========================================================================
  // 10. Gemini Fallback Model
  // =========================================================================
  test('10. generateDocumentIntelligence falls back to secondary model when primary fails', async () => {
    const calls = [];
    geminiService.getClient = () => ({
      models: {
        generateContent: async ({ model }) => {
          calls.push(model);
          if (model === 'gemini-3.6-flash') {
            const err = new Error('503 Service Unavailable');
            err.status = 503;
            throw err;
          }
          return {
            text: JSON.stringify({
              summary: 'Summary generated by fallback model.',
              keyTopics: ['Fallback'],
              keyFacts: ['Worked via fallback'],
            }),
          };
        },
      },
    });

    const result = await geminiService.generateDocumentIntelligence({
      documentText: 'Document text for fallback test',
      fileName: 'fallback_doc.pdf',
    });

    assert.strictEqual(result.summary, 'Summary generated by fallback model.');
    assert.strictEqual(result.model, 'gemini-3.5-flash-lite');
    assert.ok(calls.includes('gemini-3.6-flash'));
    assert.ok(calls.includes('gemini-3.5-flash-lite'));
  });

  // =========================================================================
  // 11. Failed First Generation
  // =========================================================================
  test('11. Failed first generation results in failed status without corrupted fields', async () => {
    const doc = await createTestDoc(userAId, 'failed_first.pdf', 'Document text for failure test');

    geminiService.getClient = () => ({
      models: {
        generateContent: async () => {
          const err = new Error('Permanent API quota error');
          err.status = 400;
          throw err;
        },
      },
    });

    await assert.rejects(
      async () => await documentService.generateDocumentIntelligence(userAId, doc._id.toString()),
      (err) => err instanceof Error
    );

    const saved = await Document.findById(doc._id);
    assert.strictEqual(saved.intelligence.status, 'failed');
    assert.strictEqual(saved.intelligence.generationStartedAt, null);
    assert.ok(saved.intelligence.error, 'Error message must be populated');
  });

  // =========================================================================
  // 12. Failed Regeneration Preserves Prior Valid Intelligence
  // =========================================================================
  test('12. Failed regeneration preserves valid previous intelligence and restores status: ready', async () => {
    const doc = await createTestDoc(userAId, 'preserve_on_fail.pdf', 'Document text for preservation');

    // 1. Successful initial generation
    const initial = await documentService.generateDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(initial.intelligence.status, 'ready');
    const initialSummary = initial.intelligence.summary;
    const initialTopics = initial.intelligence.keyTopics;
    const initialFacts = initial.intelligence.keyFacts;

    // 2. Trigger forced regeneration with failing Gemini
    geminiService.getClient = () => ({
      models: {
        generateContent: async () => {
          const err = new Error('500 Internal Server Error in upstream Gemini');
          err.status = 500;
          throw err;
        },
      },
    });

    await assert.rejects(
      async () => await documentService.generateDocumentIntelligence(userAId, doc._id.toString(), { force: true }),
      (err) => err instanceof Error
    );

    // 3. Verify prior intelligence is 100% PRESERVED!
    const saved = await Document.findById(doc._id);
    assert.strictEqual(saved.intelligence.status, 'ready', 'Status MUST be restored to ready');
    assert.strictEqual(saved.intelligence.summary, initialSummary, 'Summary MUST NOT be erased');
    assert.deepStrictEqual(saved.intelligence.keyTopics, initialTopics, 'Key topics MUST NOT be erased');
    assert.deepStrictEqual(saved.intelligence.keyFacts, initialFacts, 'Key facts MUST NOT be erased');
    assert.strictEqual(saved.intelligence.sourceSha256, doc.sha256);
    assert.strictEqual(saved.intelligence.generationStartedAt, null);
    assert.ok(saved.intelligence.error, 'Error message must be populated');
  });

  // =========================================================================
  // 13. Concurrency Protection (No Duplicate Generations)
  // =========================================================================
  test('13. Concurrent generation requests do not trigger duplicate Gemini calls', async () => {
    const doc = await createTestDoc(userAId, 'concurrent.pdf', 'Document text for concurrency test');

    // Delay the mock response to simulate real API latency
    geminiService.getClient = () => ({
      models: {
        generateContent: async () => {
          geminiCallCount++;
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            text: JSON.stringify({
              summary: 'Concurrent resolution summary.',
              keyTopics: ['Concurrency'],
              keyFacts: ['Only generated once'],
            }),
          };
        },
      },
    });

    // Launch two requests concurrently
    const [reqA, reqB] = await Promise.all([
      documentService.generateDocumentIntelligence(userAId, doc._id.toString()),
      documentService.generateDocumentIntelligence(userAId, doc._id.toString()),
    ]);

    assert.strictEqual(geminiCallCount, 1, 'Gemini MUST only be called once across concurrent requests');
    assert.ok(reqA.cached || reqA.inProgress || reqA.intelligence);
    assert.ok(reqB.cached || reqB.inProgress || reqB.intelligence);
  });

  // =========================================================================
  // 14. Force Request During Active Generation Lock
  // =========================================================================
  test('14. Force request does not bypass an active generation lock', async () => {
    const doc = await createTestDoc(userAId, 'active_lock.pdf', 'Document text for active lock');

    // Manually place document in 'generating' state with current timestamp
    doc.intelligence = {
      status: 'generating',
      generationId: crypto.randomUUID(),
      generationStartedAt: new Date(),
    };
    await doc.save();

    // Forced request should return inProgress state rather than starting a new generation
    const res = await documentService.generateDocumentIntelligence(userAId, doc._id.toString(), { force: true });
    assert.strictEqual(res.inProgress, true);
    assert.strictEqual(geminiCallCount, 0, 'Active generation lock must not be bypassed');
  });

  // =========================================================================
  // 15. Stale Generation Lock Recovery
  // =========================================================================
  test('15. Stale generation lock (> 90 seconds) is safely reclaimed and regenerated', async () => {
    const doc = await createTestDoc(userAId, 'stale_lock.pdf', 'Document text for stale lock');

    // Manually place document in 'generating' state from 2 minutes ago (stale)
    const staleTime = new Date(Date.now() - 120000);
    doc.intelligence = {
      status: 'generating',
      generationId: 'stale-uuid-12345',
      generationStartedAt: staleTime,
    };
    await doc.save();

    // Call generate -> should reclaim stale lock and generate successfully
    const res = await documentService.generateDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(res.cached, false);
    assert.strictEqual(geminiCallCount, 1, 'Stale lock should be reclaimed and Gemini called');
    assert.strictEqual(res.intelligence.status, 'ready');
  });

  // =========================================================================
  // 16. Multi-Tenant IDOR Protection (Read)
  // =========================================================================
  test('16. User B cannot read User A document intelligence', async () => {
    const doc = await createTestDoc(userAId, 'alice_private.pdf', 'Alice secret document content');
    await documentService.generateDocumentIntelligence(userAId, doc._id.toString());

    // User B attempts to read User A's intelligence
    const res = await documentService.getDocumentIntelligence(userBId, doc._id.toString());
    assert.strictEqual(res, null, 'User B must not access User A document intelligence');
  });

  // =========================================================================
  // 17. Multi-Tenant IDOR Protection (Generate)
  // =========================================================================
  test('17. User B cannot trigger intelligence generation on User A document', async () => {
    const doc = await createTestDoc(userAId, 'alice_private_gen.pdf', 'Alice secret content');

    await assert.rejects(
      async () => await documentService.generateDocumentIntelligence(userBId, doc._id.toString()),
      (err) => err.statusCode === 404 || err.code === 'DOCUMENT_NOT_FOUND'
    );
  });

  // =========================================================================
  // 18. Document Deletion Cascade
  // =========================================================================
  test('18. Deleting document deletes intelligence atomically with zero orphans', async () => {
    const doc = await createTestDoc(userAId, 'to_delete.pdf', 'Delete test document');
    await documentService.generateDocumentIntelligence(userAId, doc._id.toString());

    const deleted = await documentService.deleteDocument(userAId, doc._id.toString());
    assert.strictEqual(deleted, true);

    const docCheck = await Document.findById(doc._id);
    assert.strictEqual(docCheck, null);

    const intelCheck = await documentService.getDocumentIntelligence(userAId, doc._id.toString());
    assert.strictEqual(intelCheck, null);
  });

  // =========================================================================
  // 19. Backward Compatibility of Free-Form Analysis
  // =========================================================================
  test('19. Existing analyzeDocument endpoint continues to support custom free-form instructions', async () => {
    geminiService.getClient = () => ({
      models: {
        generateContent: async () => ({
          text: 'Custom analysis response for user instruction.',
        }),
      },
    });

    const doc = await createTestDoc(userAId, 'custom_analyze.pdf', 'Text for custom analysis.');
    const analysisRes = await aiService.analyzeDocument({
      documentText: doc.extractedText,
      fileName: doc.originalName,
      instruction: 'Explain in simple terms for a student',
    });

    assert.strictEqual(analysisRes.content, 'Custom analysis response for user instruction.');
    assert.strictEqual(analysisRes.role, 'assistant');
  });

  // =========================================================================
  // 20. Phase 4A Page-Aware Provenance Non-Interference
  // =========================================================================
  test('20. Phase 4A page-aware PDF extraction and chunking remain 100% operational', async () => {
    const page1 = 'Page 1 executive summary for Phase 4A baseline check.';
    const page2 = 'Page 2 financial metrics and page provenance check.';
    const pdfBuffer = createTestPdfBuffer([page1, page2]);

    const extracted = await extractPdfText(pdfBuffer);
    assert.strictEqual(extracted.pageCount, 2);
    assert.ok(extracted.extractedText.includes('--- Page 1 ---'));
    assert.ok(extracted.extractedText.includes('--- Page 2 ---'));

    const mockDoc = {
      _id: new mongoose.Types.ObjectId(),
      originalName: 'provenance_check.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      pageCount: 2,
      extractedText: extracted.extractedText,
    };

    const chunks = chunkingService.chunkDocument(mockDoc, 'gen-test-123');
    assert.ok(chunks.length >= 2);
    assert.strictEqual(chunks[0].metadata.pageNumber, 1);
    assert.strictEqual(chunks[chunks.length - 1].metadata.pageNumber, 2);
  });
});
