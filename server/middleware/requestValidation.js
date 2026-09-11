import { ValidationError } from '../utils/errors.js';

const ALLOWED_ROLES = new Set(['user', 'assistant']);
const MAX_MESSAGES_COUNT = 50;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_SYSTEM_INSTRUCTION_LENGTH = 4000;

/**
 * Express middleware to validate POST /api/chat payloads.
 */
export function validateChatRequest(req, res, next) {
  const { messages, systemInstruction } = req.body;

  if (!messages) {
    return next(new ValidationError('Missing "messages" field in request body.'));
  }

  if (!Array.isArray(messages)) {
    return next(new ValidationError('"messages" field must be an array.'));
  }

  if (messages.length === 0) {
    return next(new ValidationError('At least one message must be provided in the "messages" array.'));
  }

  if (messages.length > MAX_MESSAGES_COUNT) {
    return next(
      new ValidationError(
        `Conversation length exceeds maximum allowed limit of ${MAX_MESSAGES_COUNT} messages.`
      )
    );
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg || typeof msg !== 'object') {
      return next(new ValidationError(`Message at index ${i} is not a valid object.`));
    }

    if (!msg.role || typeof msg.role !== 'string') {
      return next(new ValidationError(`Message at index ${i} is missing a valid "role" string.`));
    }

    const roleLower = msg.role.toLowerCase();
    if (!ALLOWED_ROLES.has(roleLower)) {
      return next(
        new ValidationError(
          `Invalid role "${msg.role}" at index ${i}. Allowed roles are: "user", "assistant".`
        )
      );
    }

    if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
      return next(
        new ValidationError(`Message at index ${i} has empty or non-string "content".`)
      );
    }

    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      return next(
        new ValidationError(
          `Message content at index ${i} exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`
        )
      );
    }
  }

  if (systemInstruction !== undefined) {
    if (typeof systemInstruction !== 'string') {
      return next(new ValidationError('"systemInstruction" must be a string.'));
    }
    if (systemInstruction.length > MAX_SYSTEM_INSTRUCTION_LENGTH) {
      return next(
        new ValidationError(
          `"systemInstruction" exceeds maximum length of ${MAX_SYSTEM_INSTRUCTION_LENGTH} characters.`
        )
      );
    }
  }

  // Sanitize message roles to lowercase
  req.body.messages = messages.map((m) => ({
    role: m.role.toLowerCase(),
    content: m.content.trim(),
  }));

  next();
}
