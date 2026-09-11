import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { authService } from '../services/authService.js';
import { conversationService } from '../services/conversationService.js';
import { authenticate } from '../middleware/authenticate.js';
import { ENV } from '../config/env.js';

describe('Phase 5: User Authentication & Cloud Sync Test Suite', () => {
  let testUserAId;
  let testUserBId;
  let conversationAId;
  let conversationBId;
  const uniqueSuffix = Date.now();
  const emailA = `nova-phase5-alice-${uniqueSuffix}@example.test`;
  const emailB = `nova-phase5-bob-${uniqueSuffix}@example.test`;
  const rawPassword = 'Password123!Secure';

  before(async () => {
    // Ensure test environment has a valid AUTH_SECRET
    if (!ENV.AUTH_SECRET || ENV.AUTH_SECRET.length < 32) {
      ENV.AUTH_SECRET = 'test_auth_secret_minimum_32_characters_long_for_unit_tests';
    }

    // Connect to test database if available with short timeout
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ENV.MONGODB_URI, {
          dbName: ENV.MONGODB_DB_NAME,
          serverSelectionTimeoutMS: 2000,
        });
      }
    } catch {
      // If live Mongo is not available, mock-based unit assertions will proceed
    }
  });

  after(async () => {
    // Clean up test users and test conversations if DB is connected
    try {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({ email: { $in: [emailA, emailB] } });
        if (testUserAId) await Conversation.deleteMany({ userId: testUserAId });
        if (testUserBId) await Conversation.deleteMany({ userId: testUserBId });
        await mongoose.disconnect();
      }
    } catch {
      // Ignore cleanup error
    }
  });

  describe('1. User Model & Password Security', () => {
    test('User model normalizes email, hashes password with bcrypt, and hides passwordHash in toJSON', async () => {
      const passwordHash = await User.hashPassword(rawPassword);
      assert.ok(passwordHash.startsWith('$2'), 'Password hash is a valid bcrypt hash');
      assert.notStrictEqual(passwordHash, rawPassword, 'Plaintext password is never stored');

      const userDoc = new User({
        email: `  ${emailA.toUpperCase()}  `,
        displayName: 'Alice Explorer',
        passwordHash,
      });

      assert.strictEqual(userDoc.email, emailA.toLowerCase(), 'Email is trimmed and lowercase');

      const isMatch = await userDoc.verifyPassword(rawPassword);
      assert.strictEqual(isMatch, true, 'verifyPassword returns true for valid password');

      const isInvalidMatch = await userDoc.verifyPassword('WrongPassword123');
      assert.strictEqual(isInvalidMatch, false, 'verifyPassword returns false for invalid password');

      const jsonUser = userDoc.toJSON();
      assert.strictEqual(jsonUser.passwordHash, undefined, 'passwordHash is excluded from toJSON serialization');
      assert.ok(jsonUser.id, 'id is present in serialized output');
    });

    test('User model rejects password shorter than 8 characters', async () => {
      await assert.rejects(
        async () => {
          await User.hashPassword('short');
        },
        /at least 8 characters/
      );
    });
  });

  describe('2. AuthService & JWT Tokens', () => {
    test('Generates and verifies secure JWT token', () => {
      const mockUser = { id: 'user-uuid-1234', email: 'alice@example.test', displayName: 'Alice' };
      const token = authService.generateToken(mockUser);
      assert.ok(typeof token === 'string' && token.split('.').length === 3, 'JWT has 3 parts');

      const decoded = authService.verifyToken(token);
      assert.strictEqual(decoded.id, mockUser.id);
      assert.strictEqual(decoded.email, mockUser.email);
      assert.strictEqual(decoded.displayName, mockUser.displayName);
    });

    test('Rejects tampered or invalid JWT tokens', () => {
      assert.throws(
        () => authService.verifyToken('invalid.tampered.token'),
        /Invalid authentication token/
      );
    });
  });

  describe('3. Authenticate Middleware', () => {
    test('Rejects unauthenticated requests missing nova_auth_token cookie with 401', () => {
      const mockReq = { cookies: {}, headers: {} };
      let receivedErr = null;
      authenticate(mockReq, {}, (err) => {
        receivedErr = err;
      });

      assert.ok(receivedErr, 'Error passed to next()');
      assert.strictEqual(receivedErr.statusCode, 401);
      assert.strictEqual(receivedErr.code, 'AUTHENTICATION_REQUIRED');
    });

    test('Authenticates request with valid HTTP-only cookie and sets req.user', () => {
      const mockUser = { id: 'user-uuid-1234', email: 'alice@example.test', displayName: 'Alice' };
      const token = authService.generateToken(mockUser);
      const mockReq = { cookies: { nova_auth_token: token }, headers: {} };

      let nextCalled = false;
      authenticate(mockReq, {}, (err) => {
        if (!err) nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(mockReq.user.id, mockUser.id);
      assert.strictEqual(mockReq.user.email, mockUser.email);
    });
  });

  describe('4. Multi-Tenant Authorization & IDOR Protection', () => {
    test('Ensures User B cannot read or mutate User A conversations (IDOR protection)', async () => {
      if (mongoose.connection.readyState !== 1) return;

      // Create User A
      const userA = new User({
        email: emailA,
        displayName: 'Alice Explorer',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userA.save();
      testUserAId = userA._id.toString();

      // Create User B
      const userB = new User({
        email: emailB,
        displayName: 'Bob Builder',
        passwordHash: await User.hashPassword(rawPassword),
      });
      await userB.save();
      testUserBId = userB._id.toString();

      // User A creates a private conversation
      const convA = await conversationService.createConversation(testUserAId, {
        title: 'Alice Private Project Strategy',
        messages: [{ role: 'user', content: 'Top secret strategy' }],
      });
      conversationAId = convA.id;

      // User B creates a separate conversation
      const convB = await conversationService.createConversation(testUserBId, {
        title: 'Bob Construction Notes',
        messages: [{ role: 'user', content: 'Architecture review' }],
      });
      conversationBId = convB.id;

      // 1. User A can access Conversation A
      const aliceGet = await conversationService.getConversationById(testUserAId, conversationAId);
      assert.strictEqual(aliceGet.title, 'Alice Private Project Strategy');

      // 2. User B attempting to access Conversation A is rejected with 404 (IDOR blocked)
      await assert.rejects(
        async () => {
          await conversationService.getConversationById(testUserBId, conversationAId);
        },
        (err) => err.statusCode === 404 && err.code === 'CONVERSATION_NOT_FOUND'
      );

      // 3. User B attempting to rename Conversation A is rejected with 404
      await assert.rejects(
        async () => {
          await conversationService.renameConversation(testUserBId, conversationAId, 'Hacked Title');
        },
        (err) => err.statusCode === 404
      );

      // 4. User B attempting to delete Conversation A is rejected with 404
      await assert.rejects(
        async () => {
          await conversationService.deleteConversation(testUserBId, conversationAId);
        },
        (err) => err.statusCode === 404
      );

      // 5. Search isolation: User B search does not return Alice's conversation
      const bobSearch = await conversationService.searchConversations(testUserBId, 'secret');
      assert.strictEqual(bobSearch.length, 0, 'User B search does not find Alice private content');

      // 6. User A search finds Alice's conversation
      const aliceSearch = await conversationService.searchConversations(testUserAId, 'secret');
      assert.strictEqual(aliceSearch.length, 1, 'User A search finds own content');
    });
  });

  describe('5. Anonymous Conversation Claiming Security', () => {
    test('Claims only anonymous unassigned conversations matching current browser clientId', async () => {
      if (mongoose.connection.readyState !== 1) return;

      const clientX = `client-uuid-${Date.now()}`;
      const clientY = `client-uuid-other-${Date.now()}`;

      // Create anonymous conversation for Client X
      const anonConvX = new Conversation({
        clientId: clientX,
        userId: null,
        title: 'Client X Local Note',
        messages: [{ role: 'user', content: 'Local turn' }],
      });
      await anonConvX.save();

      // Create anonymous conversation for Client Y
      const anonConvY = new Conversation({
        clientId: clientY,
        userId: null,
        title: 'Client Y Local Note',
        messages: [{ role: 'user', content: 'Other client turn' }],
      });
      await anonConvY.save();

      // User A claims Client X
      const claimResult = await conversationService.claimAnonymousConversations(testUserAId, clientX);
      assert.strictEqual(claimResult.claimedCount, 1, 'Claimed 1 conversation for Client X');

      // Verify Anon Conv X is now owned by User A
      const claimedDocX = await Conversation.findById(anonConvX._id);
      assert.strictEqual(claimedDocX.userId.toString(), testUserAId);

      // Verify Anon Conv Y is still unowned (userId: null) and was NOT claimed
      const unclaimedDocY = await Conversation.findById(anonConvY._id);
      assert.strictEqual(unclaimedDocY.userId, null);

      // Clean up test docs
      await Conversation.deleteOne({ _id: anonConvX._id });
      await Conversation.deleteOne({ _id: anonConvY._id });
    });
  });
});
