import mongoose from 'mongoose';

const AttachmentSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['image', 'audio'],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    width: {
      type: Number,
      default: undefined,
    },
    height: {
      type: Number,
      default: undefined,
    },
    storageReference: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: [true, 'Message role is required and must be "user" or "assistant"'],
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: [10000, 'Message content cannot exceed 10,000 characters'],
    },
    status: {
      type: String,
      enum: ['complete', 'stopped', 'error'],
      default: 'complete',
    },
    sources: {
      type: [
        {
          sourceIndex: Number,
          documentId: String,
          documentName: String,
          pageNumber: Number,
          sectionTitle: String,
          snippet: String,
          score: Number,
          chunkId: String,
        },
      ],
      default: undefined,
    },
    attachments: {
      type: [AttachmentSchema],
      default: undefined,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

const ConversationSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      required: [true, 'clientId is required for anonymous conversation isolation'],
      index: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Conversation title is required'],
      trim: true,
      maxlength: [120, 'Conversation title cannot exceed 120 characters'],
      default: 'New Exploration',
    },
    messages: [MessageSchema],
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes for fast user sidebar sorting and legacy client migration
ConversationSchema.index({ userId: 1, updatedAt: -1 });
ConversationSchema.index({ clientId: 1, updatedAt: -1 });

export const Conversation = mongoose.model('Conversation', ConversationSchema);
export default Conversation;
