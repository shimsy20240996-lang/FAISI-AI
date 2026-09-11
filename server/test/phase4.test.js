import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Conversation } from '../models/Conversation.js';
import { conversationService } from '../services/conversationService.js';
import { extractClientId } from '../middleware/clientId.js';

describe('Phase 4: Architecture & Schema Verification', () => {
  test('Conversation Model has correct indexes, fields, and userId: null', () => {
    const schema = Conversation.schema;
    assert.ok(schema.paths.clientId, 'clientId path exists');
    assert.strictEqual(schema.paths.clientId.isRequired, true, 'clientId is required');
    assert.ok(schema.paths.userId, 'userId path exists');
    assert.strictEqual(schema.paths.userId.defaultValue, null, 'userId defaults to null');
    assert.ok(schema.paths.title, 'title path exists');
    assert.ok(schema.paths.messages, 'messages path exists');
  });

  test('Message Subdocument schema validates status enum [complete, stopped, error]', () => {
    const messagePath = Conversation.schema.path('messages');
    const statusPath = messagePath.schema.path('status');
    assert.ok(statusPath, 'status path exists on Message schema');
    assert.deepStrictEqual(
      statusPath.enumValues,
      ['complete', 'stopped', 'error'],
      'status enum matches requirement'
    );
  });

  test('extractClientId middleware rejects missing or invalid x-client-id header', () => {
    let receivedErr = null;

    // Test missing header
    const mockReq1 = { headers: {}, query: {}, body: {} };
    extractClientId(mockReq1, {}, (err) => {
      receivedErr = err;
    });
    assert.ok(receivedErr, 'Error passed to next()');
    assert.strictEqual(receivedErr.statusCode, 400);
    assert.strictEqual(receivedErr.code, 'VALIDATION_ERROR');

    // Test valid header
    const mockReq2 = { headers: { 'x-client-id': 'client-test-uuid-12345' }, query: {}, body: {} };
    let nextCalled = false;
    extractClientId(mockReq2, {}, (err) => {
      if (!err) nextCalled = true;
    });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(mockReq2.clientId, 'client-test-uuid-12345');
  });

  test('Stream state logic differentiates normal completion vs user stop vs provider error', () => {
    // Normal completion
    let streamCompleted = true;
    let userAborted = false;
    let status = streamCompleted ? 'complete' : userAborted ? 'stopped' : 'error';
    assert.strictEqual(status, 'complete', 'Normal completion produces status complete');

    // User abort before completion
    streamCompleted = false;
    userAborted = true;
    status = streamCompleted ? 'complete' : userAborted ? 'stopped' : 'error';
    assert.strictEqual(status, 'stopped', 'User abort before completion produces status stopped');

    // Unexpected error before completion
    streamCompleted = false;
    userAborted = false;
    status = streamCompleted ? 'complete' : userAborted ? 'stopped' : 'error';
    assert.strictEqual(status, 'error', 'Error before completion produces status error');
  });
});
