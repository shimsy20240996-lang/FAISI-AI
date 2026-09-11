import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { isDatabaseConnected } from '../config/database.js';
import { AppError, ValidationError } from '../utils/errors.js';

class ConversationService {
  /**
   * Helper to ensure MongoDB connection is healthy before executing queries.
   */
  checkConnection() {
    if (!isDatabaseConnected()) {
      throw new AppError(
        'Database connection is not available. Please ensure MongoDB is running.',
        503,
        'DATABASE_CONNECTION_ERROR'
      );
    }
  }

  /**
   * Helper to validate MongoDB ObjectId format.
   * @param {string} id
   */
  validateId(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError(`Invalid conversation ID format: "${id}".`);
    }
  }

  /**
   * Lists all conversations owned by the authenticated userId.
   * @param {string} userId
   * @param {{ limit?: number, skip?: number }} options
   */
  async getConversations(userId, { limit = 50, skip = 0 } = {}) {
    this.checkConnection();
    const boundedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const boundedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .skip(boundedSkip)
      .limit(boundedLimit)
      .lean({ virtuals: true });

    return conversations.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      messages: c.messages || [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Retrieves a single conversation by ID owned by userId.
   * Enforces strict IDOR protection.
   * @param {string} userId
   * @param {string} id
   */
  async getConversationById(userId, id) {
    this.checkConnection();
    this.validateId(id);

    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    }

    return conversation.toJSON();
  }

  /**
   * Creates a new conversation owned by userId.
   * @param {string} userId
   * @param {{ title?: string, messages?: Array<any>, clientId?: string }} data
   */
  async createConversation(userId, { title = 'New Exploration', messages = [], clientId = 'authenticated' } = {}) {
    this.checkConnection();

    const sanitizedTitle = (title || 'New Exploration').trim().slice(0, 120);
    const conversation = new Conversation({
      userId,
      clientId: clientId || 'authenticated',
      title: sanitizedTitle,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content.trim(),
        status: m.status || 'complete',
        createdAt: m.createdAt || new Date(),
      })),
    });

    await conversation.save();
    return conversation.toJSON();
  }

  /**
   * Renames a conversation title owned by userId.
   * @param {string} userId
   * @param {string} id
   * @param {string} title
   */
  async renameConversation(userId, id, title) {
    this.checkConnection();
    this.validateId(id);

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('Conversation title cannot be empty.');
    }

    const sanitizedTitle = title.trim().slice(0, 120);
    const conversation = await Conversation.findOneAndUpdate(
      { _id: id, userId },
      { title: sanitizedTitle, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!conversation) {
      throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    }

    return conversation.toJSON();
  }

  /**
   * Deletes a conversation owned by userId.
   * @param {string} userId
   * @param {string} id
   */
  async deleteConversation(userId, id) {
    this.checkConnection();
    this.validateId(id);

    const result = await Conversation.findOneAndDelete({ _id: id, userId });
    if (!result) {
      throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    }

    return { success: true, id };
  }

  /**
   * Adds a single message to an existing conversation owned by userId.
   * @param {string} userId
   * @param {string} id
   * @param {{ role: string, content: string, status?: string }} message
   */
  async addMessage(userId, id, { role, content, status = 'complete' }) {
    this.checkConnection();
    this.validateId(id);

    if (!role || !['user', 'assistant'].includes(role)) {
      throw new ValidationError('Message role must be "user" or "assistant".');
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new ValidationError('Message content cannot be empty.');
    }

    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    }

    const newMessage = {
      role,
      content: content.trim(),
      status: ['complete', 'stopped', 'error'].includes(status) ? status : 'complete',
      createdAt: new Date(),
    };

    conversation.messages.push(newMessage);
    conversation.updatedAt = new Date();
    await conversation.save();

    const savedMsg = conversation.messages[conversation.messages.length - 1];
    return {
      id: savedMsg._id.toString(),
      role: savedMsg.role,
      content: savedMsg.content,
      status: savedMsg.status,
      createdAt: savedMsg.createdAt,
    };
  }

  /**
   * Replaces or updates the last assistant message in a conversation owned by userId.
   * @param {string} userId
   * @param {string} id
   * @param {{ content: string, status?: string }} data
   */
  async updateLastAssistantMessage(userId, id, { content, status = 'complete' }) {
    this.checkConnection();
    this.validateId(id);

    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
    }

    // Find the last assistant message index
    let lastAssistantIdx = -1;
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      if (conversation.messages[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }

    if (lastAssistantIdx !== -1) {
      conversation.messages[lastAssistantIdx].content = (content || '').trim();
      conversation.messages[lastAssistantIdx].status = status;
    } else {
      conversation.messages.push({
        role: 'assistant',
        content: (content || '').trim(),
        status,
        createdAt: new Date(),
      });
    }

    conversation.updatedAt = new Date();
    await conversation.save();
    return conversation.toJSON();
  }

  /**
   * Searches conversation titles and message content strictly under userId.
   * @param {string} userId
   * @param {string} query
   */
  async searchConversations(userId, query) {
    this.checkConnection();

    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const safeQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
    const regex = new RegExp(safeQuery, 'i');

    const conversations = await Conversation.find({
      userId,
      $or: [{ title: regex }, { 'messages.content': regex }],
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean({ virtuals: true });

    return conversations.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      messages: c.messages || [],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Claims anonymous Phase 4 conversations belonging to the current browser's clientId.
   * Enforces that only unowned conversations (userId: null) matching the client's clientId can be claimed.
   * @param {string} userId
   * @param {string} clientId
   */
  async claimAnonymousConversations(userId, clientId) {
    this.checkConnection();

    if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
      throw new ValidationError('Valid browser clientId is required for claiming local conversations.');
    }

    // Atomically reassign anonymous conversations where userId is null
    const result = await Conversation.updateMany(
      { clientId: clientId.trim(), userId: null },
      { $set: { userId: new mongoose.Types.ObjectId(userId), updatedAt: new Date() } }
    );

    const totalCount = await Conversation.countDocuments({ userId });
    return {
      claimedCount: result.modifiedCount || 0,
      totalCount,
    };
  }

  /**
   * Returns count of unclaimed anonymous conversations for a given clientId.
   * @param {string} clientId
   */
  async getAnonymousCount(clientId) {
    this.checkConnection();
    if (!clientId) return 0;
    return Conversation.countDocuments({ clientId: clientId.trim(), userId: null });
  }
}

export const conversationService = new ConversationService();
export default conversationService;
