import mongoose from 'mongoose';

const documentChunkSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    generationId: {
      type: String,
      required: true,
      index: true,
    },
    chunkId: {
      type: String,
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: 4000,
    },
    textLength: {
      type: Number,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    embeddingModel: {
      type: String,
      default: 'gemini-embedding-2',
    },
    embeddingVersion: {
      type: String,
      default: 'v1',
    },
    metadata: {
      sourceName: {
        type: String,
        required: true,
      },
      mimeType: {
        type: String,
        required: true,
      },
      pageNumber: {
        type: Number,
        default: null,
      },
      sectionTitle: {
        type: String,
        default: null,
      },
      isCsv: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for performant multi-tenant retrieval, generation isolation, and uniqueness
documentChunkSchema.index({ userId: 1, documentId: 1, generationId: 1, chunkIndex: 1 }, { unique: true });
documentChunkSchema.index({ userId: 1, generationId: 1, createdAt: -1 });

// Transform output to strip raw embedding vectors and internal database identifiers
documentChunkSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.embedding; // Never expose heavy float arrays to frontend
    return ret;
  },
});

export const DocumentChunk = mongoose.model('DocumentChunk', documentChunkSchema);
