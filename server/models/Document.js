import mongoose from 'mongoose';
import { ENV } from '../config/env.js';

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    safeName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
    },
    extension: {
      type: String,
      required: true,
      enum: ['pdf', 'docx', 'txt', 'csv'],
    },
    size: {
      type: Number,
      required: true,
      min: 1,
    },
    sha256: {
      type: String,
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'ready', 'failed'],
      default: 'uploaded',
    },
    extractionStatus: {
      type: String,
      enum: ['pending', 'processing', 'complete', 'failed'],
      default: 'pending',
    },
    extractedText: {
      type: String,
      default: '',
      maxlength: ENV.MAX_EXTRACTED_TEXT_CHARS || 100000,
    },
    extractedTextLength: {
      type: Number,
      default: 0,
    },
    extractionError: {
      type: String,
      default: null,
    },
    pageCount: {
      type: Number,
      default: null,
    },
    csvMetadata: {
      headers: { type: [String], default: [] },
      rowCount: { type: Number, default: 0 },
      columnCount: { type: Number, default: 0 },
      previewRows: { type: [[String]], default: [] },
      isTruncated: { type: Boolean, default: false },
    },
    // Phase 7 Indexing & Generation Metadata
    activeGenerationId: {
      type: String,
      default: null,
      index: true,
    },
    indexingStatus: {
      type: String,
      enum: ['unindexed', 'pending', 'processing', 'indexed', 'failed'],
      default: 'unindexed',
      index: true,
    },
    indexedAt: {
      type: Date,
      default: null,
    },
    indexingError: {
      type: String,
      default: null,
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    embeddingModel: {
      type: String,
      default: 'gemini-embedding-2',
    },
    embeddingVersion: {
      type: String,
      default: 'v1',
    },
    // Phase 4B Persistent Document Intelligence
    intelligence: {
      status: {
        type: String,
        enum: ['idle', 'generating', 'ready', 'failed'],
        default: 'idle',
      },
      summary: {
        type: String,
        default: null,
        maxlength: 8000,
      },
      keyTopics: {
        type: [String],
        default: [],
      },
      keyFacts: {
        type: [String],
        default: [],
      },
      sourceSha256: {
        type: String,
        default: null,
      },
      model: {
        type: String,
        default: null,
      },
      promptVersion: {
        type: String,
        default: 'v1',
      },
      generatedAt: {
        type: Date,
        default: null,
      },
      generationId: {
        type: String,
        default: null,
      },
      generationStartedAt: {
        type: Date,
        default: null,
      },
      error: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for performant user queries and duplicate lookups
documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ userId: 1, sha256: 1 }, { unique: true });

// Transform output to strip sensitive internal storage paths
documentSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.storageKey; // Never expose physical storage path to client
    return ret;
  },
});

export const Document = mongoose.model('Document', documentSchema);
