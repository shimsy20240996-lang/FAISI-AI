import { conversationService } from '../services/conversationService.js';

export async function listConversations(req, res, next) {
  try {
    const { limit, skip } = req.query;
    const conversations = await conversationService.getConversations(req.user.id, {
      limit,
      skip,
    });
    res.status(200).json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

export async function createConversation(req, res, next) {
  try {
    const { title, messages } = req.body;
    const clientId = req.headers['x-client-id'];
    const conversation = await conversationService.createConversation(req.user.id, {
      title,
      messages,
      clientId,
    });
    res.status(201).json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const { id } = req.params;
    const conversation = await conversationService.getConversationById(req.user.id, id);
    res.status(200).json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
}

export async function updateConversation(req, res, next) {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const conversation = await conversationService.renameConversation(
      req.user.id,
      id,
      title
    );
    res.status(200).json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    const { id } = req.params;
    const result = await conversationService.deleteConversation(req.user.id, id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function addMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { role, content, status } = req.body;
    const message = await conversationService.addMessage(req.user.id, id, {
      role,
      content,
      status,
    });
    res.status(201).json({ success: true, message });
  } catch (error) {
    next(error);
  }
}

export async function searchConversations(req, res, next) {
  try {
    const { q } = req.query;
    const conversations = await conversationService.searchConversations(
      req.user.id,
      q
    );
    res.status(200).json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

export async function claimConversations(req, res, next) {
  try {
    const clientId = req.headers['x-client-id'] || req.body?.clientId;
    const result = await conversationService.claimAnonymousConversations(
      req.user.id,
      clientId
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function checkAnonymousCount(req, res, next) {
  try {
    const clientId = req.headers['x-client-id'] || req.query?.clientId;
    const count = await conversationService.getAnonymousCount(clientId);
    res.status(200).json({ success: true, unclaimedCount: count });
  } catch (error) {
    next(error);
  }
}
