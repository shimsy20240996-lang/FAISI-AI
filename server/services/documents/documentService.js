import crypto from 'crypto';
import mongoose from 'mongoose';
import { Document } from '../../models/Document.js';
import { DocumentChunk } from '../../models/DocumentChunk.js';
import { Collection } from '../../models/Collection.js';
import { User } from '../../models/User.js';
import { storageService } from '../storage/storageService.js';
import { validateUploadedFile } from './fileValidationService.js';
import { extractionService } from './extractionService.js';
import { ragService } from '../rag/ragService.js';
import { aiService } from '../ai/aiService.js';
import { ENV } from '../../config/env.js';
import { recordDocumentProcessing } from '../../utils/metrics.js';

const TAG_REGEX = /^[a-z0-9_-]+$/;

/**
 * Normalizes, validates, and deduplicates an array of document tags.
 * Rejects invalid tags, excessive tags, or bad characters with 400 errors.
 * @param {Array<string>} tags
 * @returns {Array<string>}
 */
export function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    const err = new Error('Tags must be an array of strings.');
    err.statusCode = 400;
    throw err;
  }

  if (tags.length > 10) {
    const err = new Error('A document can have a maximum of 10 tags.');
    err.statusCode = 400;
    throw err;
  }

  const normalizedSet = new Set();

  for (const rawTag of tags) {
    if (typeof rawTag !== 'string') {
      const err = new Error('Each tag must be a string.');
      err.statusCode = 400;
      throw err;
    }

    const trimmed = rawTag.trim().toLowerCase();
    if (!trimmed) {
      const err = new Error('Tags cannot be empty strings.');
      err.statusCode = 400;
      throw err;
    }

    if (trimmed.length > 30) {
      const err = new Error(`Tag "${trimmed}" exceeds maximum allowed length of 30 characters.`);
      err.statusCode = 400;
      throw err;
    }

    if (!TAG_REGEX.test(trimmed)) {
      const err = new Error(
        `Tag "${trimmed}" contains invalid characters. Only lowercase alphanumeric characters, hyphens, and underscores are permitted.`
      );
      err.statusCode = 400;
      throw err;
    }

    normalizedSet.add(trimmed);
  }

  return Array.from(normalizedSet);
}

export class DocumentService {
  /**
   * Atomically reserves document count and storage quota for a user.
   * Concurrency-safe against race conditions via conditional atomic findOneAndUpdate.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {number} incomingSizeBytes
   */
  async reserveQuota(userId, incomingSizeBytes) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const maxStorageBytes = (ENV.MAX_USER_STORAGE_MB || 100) * 1024 * 1024;
    const maxDocuments = ENV.MAX_DOCUMENTS_PER_USER || 50;

    // Atomic conditional increment ensuring limits are never exceeded under concurrent requests
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userObjectId,
        $and: [
          {
            $or: [
              { documentCount: { $exists: false } },
              { documentCount: { $lt: maxDocuments } },
            ],
          },
          {
            $or: [
              { storageUsedBytes: { $exists: false } },
              { storageUsedBytes: { $lte: maxStorageBytes - incomingSizeBytes } },
            ],
          },
        ],
      },
      {
        $inc: {
          documentCount: 1,
          storageUsedBytes: incomingSizeBytes,
        },
      },
      {
        new: true,
      }
    );

    if (!updatedUser) {
      // Check current user stats to return specific, user-friendly error message
      const currentUser = await User.findById(userObjectId);
      if (currentUser) {
        const currentCount = currentUser.documentCount || 0;
        const currentBytes = currentUser.storageUsedBytes || 0;

        if (currentCount >= maxDocuments) {
          throw new Error(
            `User document limit reached (${currentCount}/${maxDocuments}). Please delete older documents before uploading new ones.`
          );
        }
        if (currentBytes + incomingSizeBytes > maxStorageBytes) {
          const currentMB = (currentBytes / (1024 * 1024)).toFixed(2);
          throw new Error(
            `User storage quota exceeded. Current: ${currentMB} MB / ${ENV.MAX_USER_STORAGE_MB} MB limit.`
          );
        }
      }
      throw new Error('User storage quota exceeded or account not found.');
    }

    return updatedUser;
  }

  /**
   * Atomically rolls back / releases reserved quota for a user.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {number} sizeBytes
   */
  async releaseQuota(userId, sizeBytes) {
    if (!sizeBytes || sizeBytes <= 0) return;
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    try {
      await User.updateOne(
        { _id: userObjectId },
        [
          {
            $set: {
              documentCount: { $max: [0, { $subtract: [{ $ifNull: ['$documentCount', 1] }, 1] }] },
              storageUsedBytes: { $max: [0, { $subtract: [{ $ifNull: ['$storageUsedBytes', sizeBytes] }, sizeBytes] }] },
            },
          },
        ]
      );
    } catch (err) {
      // Fallback simple increment if pipeline update fails
      await User.updateOne(
        { _id: userObjectId, documentCount: { $gt: 0 } },
        {
          $inc: {
            documentCount: -1,
            storageUsedBytes: -sizeBytes,
          },
        }
      ).catch((fallbackErr) => {
        console.warn('⚠️  Could not release quota on fallback:', fallbackErr.message);
      });
    }
  }

  /**
   * Legacy quota check helper for pre-flight validation
   */
  async checkUserQuotas(userId, incomingSizeBytes) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const user = await User.findById(userObjectId);
    const maxStorageBytes = (ENV.MAX_USER_STORAGE_MB || 100) * 1024 * 1024;
    const maxDocuments = ENV.MAX_DOCUMENTS_PER_USER || 50;

    const currentCount = user?.documentCount || (await Document.countDocuments({ userId: userObjectId }));
    if (currentCount >= maxDocuments) {
      throw new Error(
        `User document limit reached (${currentCount}/${maxDocuments}). Please delete older documents before uploading new ones.`
      );
    }

    let currentBytes = user?.storageUsedBytes;
    if (typeof currentBytes !== 'number') {
      const stats = await Document.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: null, totalBytes: { $sum: '$size' } } },
      ]);
      currentBytes = stats.length > 0 ? stats[0].totalBytes : 0;
    }

    if (currentBytes + incomingSizeBytes > maxStorageBytes) {
      const currentMB = (currentBytes / (1024 * 1024)).toFixed(2);
      throw new Error(
        `User storage quota exceeded. Current: ${currentMB} MB / ${ENV.MAX_USER_STORAGE_MB} MB limit.`
      );
    }
  }

  /**
   * Checks concurrent active document processing to prevent resource exhaustion
   */
  async checkConcurrency(userId) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const activeProcessing = await Document.countDocuments({
      userId: userObjectId,
      status: 'processing',
    });

    if (activeProcessing >= ENV.MAX_CONCURRENT_DOCUMENT_PROCESSING) {
      throw new Error(
        `Too many documents currently processing (${activeProcessing}). Please wait for existing extractions to finish.`
      );
    }
  }

  /**
   * Checks if user already uploaded an identical file by SHA-256 (User-scoped duplicate check)
   */
  async findDuplicate(userId, sha256) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    return await Document.findOne({ userId: userObjectId, sha256 });
  }

  /**
   * Uploads, validates, stores, and extracts a document for the user with atomic quota reservation & rollback,
   * and automatically initiates asynchronous background indexing for Knowledge Base readiness.
   */
  async processUpload({ userId, file, autoIndex = true, collectionId = null }) {
    if (!file || !file.buffer) {
      throw new Error('No document file was provided in the request');
    }

    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    // Optional collection assignment verification
    let verifiedCollectionId = null;
    if (collectionId && mongoose.Types.ObjectId.isValid(collectionId)) {
      const col = await Collection.findOne({ _id: collectionId, userId: userObjectId });
      if (col) {
        verifiedCollectionId = col._id;
      }
    }

    // Step 1: Multi-layer file validation & checksum
    const validated = validateUploadedFile(file, userObjectId.toString());

    // Step 2: Duplicate detection (User-scoped)
    const existingDuplicate = await this.findDuplicate(userObjectId, validated.sha256);
    if (existingDuplicate) {
      return {
        document: existingDuplicate,
        isDuplicate: true,
        message: `This file was already uploaded as "${existingDuplicate.originalName}".`,
      };
    }

    // Step 3: Concurrency check
    await this.checkConcurrency(userObjectId);

    // Step 4: Atomic Quota Reservation (DB-backed, concurrency-safe against race conditions)
    await this.reserveQuota(userObjectId, validated.size);

    let storageSaved = false;
    // Step 5: Save physical file to storage
    try {
      await storageService.save(validated.storageKey, file.buffer);
      storageSaved = true;
    } catch (saveErr) {
      // Rollback quota reservation on physical storage write failure
      await this.releaseQuota(userObjectId, validated.size);
      throw new Error(`Failed to save document file: ${saveErr.message}`);
    }

    // Step 6: Create database record with initial processing state
    let doc;
    try {
      doc = await Document.create({
        userId: userObjectId,
        collectionId: verifiedCollectionId,
        originalName: validated.originalName,
        safeName: validated.safeName,
        mimeType: validated.mimeType,
        extension: validated.extension,
        size: validated.size,
        sha256: validated.sha256,
        storageKey: validated.storageKey,
        status: 'processing',
        extractionStatus: 'processing',
      });
    } catch (dbErr) {
      // Rollback: delete stored physical file and release quota if database insertion fails
      if (storageSaved) {
        try {
          await storageService.delete(validated.storageKey);
        } catch (cleanupErr) {
          console.error('Storage rollback cleanup failed:', cleanupErr);
        }
      }
      await this.releaseQuota(userObjectId, validated.size);

      // Gracefully handle duplicate key race conditions (E11000)
      if (dbErr.code === 11000) {
        const duplicate = await this.findDuplicate(userObjectId, validated.sha256);
        if (duplicate) {
          return {
            document: duplicate,
            isDuplicate: true,
            message: `This file was already uploaded as "${duplicate.originalName}".`,
          };
        }
      }
      throw new Error(`Database error saving document: ${dbErr.message}`);
    }

    // Step 7: Perform text extraction with timeout protection
    const extractStart = process.hrtime.bigint();
    try {
      const extractionResult = await extractionService.extract(file.buffer, validated.extension);
      const durationMs = Number(process.hrtime.bigint() - extractStart) / 1e6;
      recordDocumentProcessing({ operation: 'extract', outcome: 'success', durationMs });

      doc.status = 'ready';
      doc.extractionStatus = 'complete';
      doc.extractedText = extractionResult.extractedText || '';
      doc.extractedTextLength = extractionResult.length || (extractionResult.extractedText ? extractionResult.extractedText.length : 0);
      if (extractionResult.csvMetadata) {
        doc.csvMetadata = extractionResult.csvMetadata;
      }
      if (extractionResult.pageCount) {
        doc.pageCount = extractionResult.pageCount;
      }

      const hasExtractableText = Boolean(doc.extractedText && doc.extractedText.trim().length > 0);
      if (autoIndex && hasExtractableText) {
        doc.indexingStatus = 'pending';
      }

      await doc.save();

      // Step 8: Trigger background auto-indexing asynchronously without blocking the upload HTTP response
      if (autoIndex && hasExtractableText) {
        setImmediate(async () => {
          try {
            await ragService.indexDocument(userObjectId, doc._id.toString());
          } catch (indexErr) {
            console.error(`🔴 [Auto-Indexing Background Error for Doc ${doc._id}]:`, indexErr.message);
          }
        });
      }
    } catch (extErr) {
      // Extraction failed: update status to 'failed' rather than leaving in 'processing'
      const durationMs = Number(process.hrtime.bigint() - extractStart) / 1e6;
      recordDocumentProcessing({ operation: 'extract', outcome: 'failed', durationMs });
      console.error(`Document extraction error for document ${doc._id}:`, extErr.message);
      doc.status = 'failed';
      doc.extractionStatus = 'failed';
      doc.extractionError = extErr.message || 'Text extraction failed';
      await doc.save();
    }

    return {
      document: doc,
      isDuplicate: false,
    };
  }

  /**
   * List user's documents with pagination, collection filtering, tag filtering, and total stats
   */
  async getUserDocuments(userId, { limit = 50, skip = 0, collectionId, tag } = {}) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const boundedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const boundedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const filter = { userId: userObjectId };

    if (collectionId === 'uncategorized') {
      filter.collectionId = null;
    } else if (collectionId && mongoose.Types.ObjectId.isValid(collectionId)) {
      filter.collectionId = new mongoose.Types.ObjectId(collectionId);
    }

    if (tag && typeof tag === 'string' && tag.trim()) {
      filter.tags = tag.trim().toLowerCase();
    }

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .sort({ createdAt: -1 })
        .skip(boundedSkip)
        .limit(boundedLimit),
      Document.countDocuments(filter),
    ]);

    return { documents, total, limit: boundedLimit, skip: boundedSkip };
  }

  /**
   * Updates document collection assignment (Move/Remove to Uncategorized).
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {string} documentId
   * @param {string|null} collectionId
   * @returns {Promise<any|null>}
   */
  async updateDocumentCollection(userId, documentId, collectionId) {
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      const err = new Error('Invalid document ID.');
      err.statusCode = 400;
      throw err;
    }
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    let targetColId = null;
    if (collectionId !== null && collectionId !== undefined && collectionId !== '') {
      if (!mongoose.Types.ObjectId.isValid(collectionId)) {
        const err = new Error('Invalid collection ID.');
        err.statusCode = 400;
        throw err;
      }
      const col = await Collection.findOne({ _id: collectionId, userId: userObjectId });
      if (!col) {
        const err = new Error('Collection not found.');
        err.statusCode = 404;
        throw err;
      }
      targetColId = col._id;
    }

    const doc = await Document.findOneAndUpdate(
      { _id: documentId, userId: userObjectId },
      { $set: { collectionId: targetColId } },
      { new: true }
    );

    return doc;
  }

  /**
   * Updates document tags with strict normalization and validation.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {string} documentId
   * @param {Array<string>} rawTags
   * @returns {Promise<any|null>}
   */
  async updateDocumentTags(userId, documentId, rawTags) {
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      const err = new Error('Invalid document ID.');
      err.statusCode = 400;
      throw err;
    }
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const normalizedTags = normalizeTags(rawTags);

    const doc = await Document.findOneAndUpdate(
      { _id: documentId, userId: userObjectId },
      { $set: { tags: normalizedTags } },
      { new: true }
    );

    return doc;
  }

  /**
   * Retrieve a single document owned by the user (IDOR protected)
   */
  async getUserDocument(userId, documentId) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return null;
    }
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    return await Document.findOne({ _id: documentId, userId: userObjectId });
  }

  /**
   * Retrieve bounded extracted text/preview content for a document
   */
  async getDocumentContent(userId, documentId) {
    const doc = await this.getUserDocument(userId, documentId);
    if (!doc) {
      return null;
    }

    return {
      id: doc._id.toString(),
      originalName: doc.originalName,
      extension: doc.extension,
      size: doc.size,
      status: doc.status,
      extractionStatus: doc.extractionStatus,
      extractedTextLength: doc.extractedTextLength,
      extractedText: doc.extractedText || '',
      csvMetadata: doc.csvMetadata || null,
      pageCount: doc.pageCount || null,
      createdAt: doc.createdAt,
    };
  }

  /**
   * Delete a document physically and from MongoDB (IDOR protected) and release quota
   */
  async deleteDocument(userId, documentId) {
    const deleteStart = process.hrtime.bigint();
    try {
      const doc = await this.getUserDocument(userId, documentId);
      if (!doc) {
        return false;
      }

      // Physical storage deletion
      try {
        await storageService.delete(doc.storageKey);
      } catch (storageErr) {
        console.warn(`Storage file deletion warning for ${doc.storageKey}:`, storageErr.message);
      }

      // Cascade delete all associated chunks
      try {
        await DocumentChunk.deleteMany({ _id: { $exists: true }, userId: doc.userId, documentId: doc._id });
      } catch (chunkErr) {
        console.warn(`Chunk deletion warning for document ${doc._id}:`, chunkErr.message);
      }

      // Database deletion
      await Document.deleteOne({ _id: doc._id, userId: doc.userId });

      // Atomically release user document count and storage bytes
      await this.releaseQuota(doc.userId, doc.size);

      const durationMs = Number(process.hrtime.bigint() - deleteStart) / 1e6;
      recordDocumentProcessing({ operation: 'delete', outcome: 'success', durationMs });
      return true;
    } catch (err) {
      const durationMs = Number(process.hrtime.bigint() - deleteStart) / 1e6;
      recordDocumentProcessing({ operation: 'delete', outcome: 'failed', durationMs });
      throw err;
    }
  }

  /**
   * Aggregate storage usage for a user
   */
  async getUserStorageStats(userId) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const stats = await Document.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: null,
          totalBytes: { $sum: '$size' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalBytes = stats.length > 0 ? stats[0].totalBytes : 0;
    const count = stats.length > 0 ? stats[0].count : 0;

    return {
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      maxMB: ENV.MAX_USER_STORAGE_MB,
      count,
      maxCount: ENV.MAX_DOCUMENTS_PER_USER,
    };
  }

  /**
   * Helper verifying whether persisted document intelligence is valid for the current document content.
   * @param {Object} doc
   * @returns {boolean}
   */
  isCachedIntelligenceValid(doc) {
    if (!doc || !doc.intelligence) return false;
    const { intelligence, sha256 } = doc;
    return (
      intelligence.status === 'ready' &&
      intelligence.sourceSha256 === sha256 &&
      typeof intelligence.summary === 'string' &&
      intelligence.summary.trim().length > 0 &&
      Array.isArray(intelligence.keyTopics) &&
      Array.isArray(intelligence.keyFacts)
    );
  }

  /**
   * Retrieves persisted intelligence for a document (IDOR protected, 0 Gemini calls).
   * @param {string | mongoose.Types.ObjectId} userId
   * @param {string} documentId
   * @returns {Promise<Object | null>}
   */
  async getDocumentIntelligence(userId, documentId) {
    const doc = await this.getUserDocument(userId, documentId);
    if (!doc) {
      return null;
    }

    const STALE_LOCK_MS = 90000;
    const isStaleHash = doc.intelligence?.sourceSha256 && doc.intelligence.sourceSha256 !== doc.sha256;

    if (this.isCachedIntelligenceValid(doc)) {
      return {
        status: 'ready',
        cached: true,
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        intelligence: doc.intelligence,
      };
    }

    if (doc.intelligence?.status === 'generating') {
      const isStale =
        doc.intelligence.generationStartedAt &&
        Date.now() - new Date(doc.intelligence.generationStartedAt).getTime() > STALE_LOCK_MS;

      if (isStale) {
        return {
          status: 'idle',
          isStale: true,
          documentId: doc._id.toString(),
          documentName: doc.originalName,
          intelligence: { status: 'idle' },
        };
      }

      return {
        status: 'generating',
        inProgress: true,
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        intelligence: doc.intelligence,
      };
    }

    if (doc.intelligence?.status === 'failed') {
      return {
        status: 'failed',
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        intelligence: doc.intelligence,
      };
    }

    if (isStaleHash) {
      return {
        status: 'idle',
        isStale: true,
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        intelligence: { status: 'idle' },
      };
    }

    return {
      status: doc.intelligence?.status || 'idle',
      documentId: doc._id.toString(),
      documentName: doc.originalName,
      intelligence: doc.intelligence || { status: 'idle' },
    };
  }

  /**
   * Generates or retrieves structured document intelligence with atomic concurrency claim,
   * SHA-256 cache verification, stale-lock recovery, and safe error restoration.
   * @param {string | mongoose.Types.ObjectId} userId
   * @param {string} documentId
   * @param {{ force?: boolean }} [options]
   */
  async generateDocumentIntelligence(userId, documentId, { force = false } = {}) {
    const doc = await this.getUserDocument(userId, documentId);
    if (!doc) {
      const err = new Error('Document not found or unauthorized.');
      err.statusCode = 404;
      err.code = 'DOCUMENT_NOT_FOUND';
      throw err;
    }

    if (doc.status !== 'ready') {
      const err = new Error(`Document is currently in "${doc.status}" state and cannot be analyzed yet.`);
      err.statusCode = 400;
      err.code = 'DOCUMENT_NOT_READY';
      throw err;
    }

    if (doc.extractionStatus !== 'complete') {
      const err = new Error(`Document extraction is currently in "${doc.extractionStatus}" state.`);
      err.statusCode = 400;
      err.code = 'EXTRACTION_NOT_COMPLETE';
      throw err;
    }

    if (!doc.extractedText || doc.extractedText.trim().length === 0) {
      const err = new Error('Document contains no extractable text for intelligence generation.');
      err.statusCode = 400;
      err.code = 'NO_EXTRACTABLE_TEXT';
      throw err;
    }

    // Step 1: Cache hit check (if not forced)
    if (!force && this.isCachedIntelligenceValid(doc)) {
      return {
        cached: true,
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        intelligence: doc.intelligence,
      };
    }

    // Track whether previous valid intelligence existed before locking for safe non-destructive restoration
    const hadPriorValidIntelligence =
      doc.intelligence?.status === 'ready' &&
      doc.intelligence?.sourceSha256 === doc.sha256 &&
      typeof doc.intelligence?.summary === 'string' &&
      doc.intelligence.summary.trim().length > 0;

    // Step 2: Atomic lock acquisition
    const STALE_LOCK_MS = 90000;
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MS);
    const generationId = crypto.randomUUID();
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const claimQuery = {
      _id: doc._id,
      userId: userObjectId,
      status: 'ready',
      $or: [
        { 'intelligence.status': { $in: ['idle', 'failed'] } },
        { 'intelligence.status': { $exists: false } },
        { 'intelligence.status': 'ready', 'intelligence.sourceSha256': { $ne: doc.sha256 } },
        { 'intelligence.status': 'generating', 'intelligence.generationStartedAt': { $lt: staleCutoff } },
        ...(force ? [{ 'intelligence.status': 'ready' }] : []),
      ],
    };

    const lockedDoc = await Document.findOneAndUpdate(
      claimQuery,
      {
        $set: {
          'intelligence.status': 'generating',
          'intelligence.generationId': generationId,
          'intelligence.generationStartedAt': new Date(),
        },
      },
      { new: true }
    );

    // If another process already holds active generation lock
    if (!lockedDoc) {
      const currentDoc = await this.getUserDocument(userId, documentId);
      if (currentDoc?.intelligence?.status === 'generating') {
        const isStale =
          currentDoc.intelligence.generationStartedAt &&
          Date.now() - new Date(currentDoc.intelligence.generationStartedAt).getTime() > STALE_LOCK_MS;

        if (!isStale) {
          return {
            inProgress: true,
            documentId: doc._id.toString(),
            documentName: doc.originalName,
            intelligence: currentDoc.intelligence,
            message: 'Intelligence generation is already in progress.',
          };
        }
      }

      if (!force && this.isCachedIntelligenceValid(currentDoc)) {
        return {
          cached: true,
          documentId: doc._id.toString(),
          documentName: doc.originalName,
          intelligence: currentDoc.intelligence,
        };
      }
    }

    // Step 3: Execute structured Gemini intelligence generation
    try {
      const genResult = await aiService.generateDocumentIntelligence({
        documentText: doc.extractedText,
        fileName: doc.originalName,
      });

      if (!genResult) {
        throw new Error('AI intelligence generation returned empty response');
      }

      const updated = await Document.findOneAndUpdate(
        {
          _id: doc._id,
          userId: userObjectId,
          'intelligence.generationId': generationId,
        },
        {
          $set: {
            'intelligence.status': 'ready',
            'intelligence.summary': genResult.summary,
            'intelligence.keyTopics': genResult.keyTopics,
            'intelligence.keyFacts': genResult.keyFacts,
            'intelligence.sourceSha256': doc.sha256,
            'intelligence.model': genResult.model,
            'intelligence.promptVersion': genResult.promptVersion || 'v1',
            'intelligence.generatedAt': new Date(),
            'intelligence.generationId': generationId,
            'intelligence.generationStartedAt': null,
            'intelligence.error': null,
          },
        },
        { new: true }
      );

      return {
        cached: false,
        documentId: doc._id.toString(),
        documentName: doc.originalName,
        intelligence: updated ? updated.intelligence : genResult,
      };
    } catch (genErr) {
      const sanitizedError = (genErr.message || 'Intelligence generation failed')
        .replace(/key=[a-zA-Z0-9_-]+/gi, 'key=[REDACTED]')
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[API_KEY_REDACTED]');

      if (hadPriorValidIntelligence) {
        // Safe restoration: preserve valid prior intelligence!
        await Document.updateOne(
          {
            _id: doc._id,
            userId: userObjectId,
            'intelligence.generationId': generationId,
          },
          {
            $set: {
              'intelligence.status': 'ready',
              'intelligence.generationStartedAt': null,
              'intelligence.error': sanitizedError,
            },
          }
        );
      } else {
        await Document.updateOne(
          {
            _id: doc._id,
            userId: userObjectId,
            'intelligence.generationId': generationId,
          },
          {
            $set: {
              'intelligence.status': 'failed',
              'intelligence.generationId': null,
              'intelligence.generationStartedAt': null,
              'intelligence.error': sanitizedError,
            },
          }
        );
      }

      throw genErr;
    }
  }
}

export const documentService = new DocumentService();
