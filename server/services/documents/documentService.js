import mongoose from 'mongoose';
import { Document } from '../../models/Document.js';
import { DocumentChunk } from '../../models/DocumentChunk.js';
import { User } from '../../models/User.js';
import { storageService } from '../storage/storageService.js';
import { validateUploadedFile } from './fileValidationService.js';
import { extractionService } from './extractionService.js';
import { ragService } from '../rag/ragService.js';
import { ENV } from '../../config/env.js';
import { recordDocumentProcessing } from '../../utils/metrics.js';

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
  async processUpload({ userId, file, autoIndex = true }) {
    if (!file || !file.buffer) {
      throw new Error('No document file was provided in the request');
    }

    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

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
   * List user's documents with pagination and total stats
   */
  async getUserDocuments(userId, { limit = 50, skip = 0 } = {}) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const boundedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const boundedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const [documents, total] = await Promise.all([
      Document.find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .skip(boundedSkip)
        .limit(boundedLimit),
      Document.countDocuments({ userId: userObjectId }),
    ]);

    return { documents, total, limit: boundedLimit, skip: boundedSkip };
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
}

export const documentService = new DocumentService();
