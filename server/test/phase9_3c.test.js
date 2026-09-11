import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { authService } from '../services/authService.js';
import { authenticate, optionalAuthenticate } from '../middleware/authenticate.js';
import { ENV } from '../config/env.js';
import { logout } from '../controllers/authController.js';

describe('Phase 9.3-C: SEC-VULN-09 JWT Revocation & Token Invalidation Suite', () => {
  let userA;
  let userB;
  let userAId;
  let userBId;
  const uniqueSuffix = Date.now();
  const emailA = `nova-p93c-alice-${uniqueSuffix}@example.test`;
  const emailB = `nova-p93c-bob-${uniqueSuffix}@example.test`;

  const inMemoryUsers = new Map();
  let originalFindById;
  let originalFindByIdAndUpdate;

  before(async () => {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ENV.MONGODB_URI, {
          dbName: ENV.MONGODB_DB_NAME,
          serverSelectionTimeoutMS: 1000,
        });
      }
    } catch {
      // Local/offline test environment
    }

    userAId = new mongoose.Types.ObjectId().toString();
    userBId = new mongoose.Types.ObjectId().toString();

    if (mongoose.connection.readyState === 1) {
      userA = await User.create({
        email: emailA,
        displayName: 'Alice Revocation',
        passwordHash: await User.hashPassword('SuperSecret123!'),
        tokenVersion: 0,
      });
      userAId = userA._id.toString();

      userB = await User.create({
        email: emailB,
        displayName: 'Bob Revocation',
        passwordHash: await User.hashPassword('SuperSecret123!'),
        tokenVersion: 0,
      });
      userBId = userB._id.toString();
    } else {
      userA = new User({
        _id: userAId,
        email: emailA,
        displayName: 'Alice Revocation',
        passwordHash: await User.hashPassword('SuperSecret123!'),
        tokenVersion: 0,
      });
      userB = new User({
        _id: userBId,
        email: emailB,
        displayName: 'Bob Revocation',
        passwordHash: await User.hashPassword('SuperSecret123!'),
        tokenVersion: 0,
      });

      inMemoryUsers.set(userAId, {
        _id: new mongoose.Types.ObjectId(userAId),
        email: emailA,
        displayName: 'Alice Revocation',
        tokenVersion: 0,
      });
      inMemoryUsers.set(userBId, {
        _id: new mongoose.Types.ObjectId(userBId),
        email: emailB,
        displayName: 'Bob Revocation',
        tokenVersion: 0,
      });

      originalFindById = User.findById;
      originalFindByIdAndUpdate = User.findByIdAndUpdate;

      User.findById = function (id) {
        const idStr = id?.toString();
        const doc = inMemoryUsers.get(idStr);
        return {
          select: function () {
            return {
              lean: async function () {
                return doc ? { ...doc } : null;
              },
            };
          },
          then: function (resolve) {
            resolve(doc ? { ...doc, tokenVersion: doc.tokenVersion } : null);
          },
        };
      };

      User.findByIdAndUpdate = async function (id, update) {
        const idStr = id?.toString();
        const doc = inMemoryUsers.get(idStr);
        if (doc && update?.$inc?.tokenVersion) {
          doc.tokenVersion += update.$inc.tokenVersion;
        }
        return doc ? { ...doc } : null;
      };
    }
  });

  after(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({ email: { $in: [emailA, emailB] } });
      }
    } catch {
      // Ignore cleanup error
    }

    if (originalFindById) {
      User.findById = originalFindById;
    }
    if (originalFindByIdAndUpdate) {
      User.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
  });

  // =========================================================================
  // 1. Registration & Schema Default Verification
  // =========================================================================
  describe('1. Registration & Schema Default', () => {
    test('1.1 Newly created user receives tokenVersion: 0 by default', () => {
      assert.strictEqual(userA.tokenVersion, 0, 'New user tokenVersion should default to 0');
    });

    test('1.2 toJSON transforms and hides tokenVersion from client-facing serialization', () => {
      const serialized = userA.toJSON();
      assert.strictEqual(serialized.tokenVersion, undefined, 'tokenVersion must NOT be present in user.toJSON()');
      assert.strictEqual(serialized.passwordHash, undefined, 'passwordHash must NOT be present in user.toJSON()');
    });
  });

  // =========================================================================
  // 2. Token Issuance & Normal Authentication
  // =========================================================================
  describe('2. Token Issuance & Normal Authentication', () => {
    test('2.1 Issued JWT contains the matching tokenVersion in payload', () => {
      const token = authService.generateToken(userA);
      const decoded = authService.verifyToken(token);

      assert.strictEqual(decoded.id, userAId);
      assert.strictEqual(decoded.tokenVersion, 0);
    });

    test('2.2 Normal authentication succeeds when JWT tokenVersion matches DB tokenVersion', async () => {
      const token = authService.generateToken(userA);
      const req = {
        cookies: { [ENV.COOKIE_NAME]: token },
        headers: {},
      };
      const res = {};
      let nextCalled = false;
      let nextError = null;

      await authenticate(req, res, (err) => {
        if (err) nextError = err;
        else nextCalled = true;
      });

      assert.strictEqual(nextCalled, true, 'Next must be called');
      assert.strictEqual(nextError, null, 'No error must occur');
      assert.strictEqual(req.user.id, userAId);
      assert.strictEqual(req.user.email, emailA);
    });
  });

  // =========================================================================
  // 3. Token Invalidation on Version Increment / Logout
  // =========================================================================
  describe('3. Token Invalidation on Version Increment / Logout', () => {
    test('3.1 Incrementing user tokenVersion immediately invalidates previously issued JWT (401)', async () => {
      // Issue token for User A at tokenVersion = 0
      const oldToken = authService.generateToken(userA);

      // Invalidate active tokens by incrementing tokenVersion
      const newVersion = await authService.revokeUserTokens(userAId);
      assert.strictEqual(newVersion, 1, 'Token version should be incremented to 1');

      // Attempt authentication with old token (containing tokenVersion: 0)
      const req = {
        cookies: { [ENV.COOKIE_NAME]: oldToken },
        headers: {},
      };
      let clearedCookie = false;
      const res = {
        clearCookie: () => {
          clearedCookie = true;
        },
      };
      let nextError = null;

      await authenticate(req, res, (err) => {
        nextError = err;
      });

      assert.ok(nextError, 'Authentication must fail');
      assert.strictEqual(nextError.statusCode, 401);
      assert.strictEqual(clearedCookie, true, 'Auth cookie must be cleared on revoked token');
    });

    test('3.2 Newly issued JWT after revocation authenticates successfully', async () => {
      // User A now has tokenVersion: 1
      const freshUserA = { id: userAId, email: emailA, displayName: 'Alice Revocation', tokenVersion: 1 };
      const newToken = authService.generateToken(freshUserA);
      const decoded = authService.verifyToken(newToken);
      assert.strictEqual(decoded.tokenVersion, 1);

      const req = {
        cookies: { [ENV.COOKIE_NAME]: newToken },
        headers: {},
      };
      const res = {};
      let nextCalled = false;
      let nextError = null;

      await authenticate(req, res, (err) => {
        if (err) nextError = err;
        else nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(nextError, null);
      assert.strictEqual(req.user.id, userAId);
    });

    test('3.3 Logout handler atomically increments tokenVersion, clears cookie, and returns 200', async () => {
      const userBefore = { id: userAId, email: emailA, displayName: 'Alice Revocation', tokenVersion: 1 };
      const token = authService.generateToken(userBefore);

      const req = {
        cookies: { [ENV.COOKIE_NAME]: token },
        user: { id: userAId },
      };
      let clearedCookieName = null;
      let responseStatus = null;
      let responseBody = null;

      const res = {
        clearCookie: (name) => {
          clearedCookieName = name;
        },
        status: (code) => {
          responseStatus = code;
          return {
            json: (body) => {
              responseBody = body;
            },
          };
        },
      };

      await logout(req, res);

      assert.strictEqual(responseStatus, 200);
      assert.strictEqual(responseBody?.success, true);
      assert.strictEqual(clearedCookieName, ENV.COOKIE_NAME);

      // Verify that the token prior to logout is now rejected
      const verifyReq = {
        cookies: { [ENV.COOKIE_NAME]: token },
        headers: {},
      };
      let nextError = null;
      await authenticate(verifyReq, { clearCookie: () => {} }, (err) => {
        nextError = err;
      });
      assert.ok(nextError, 'Token prior to logout must now be rejected');
      assert.strictEqual(nextError.statusCode, 401);
    });
  });

  // =========================================================================
  // 4. Multi-Token, Cross-User Isolation & Concurrency
  // =========================================================================
  describe('4. Multi-Token, Cross-User Isolation & Concurrency', () => {
    test('4.1 Multiple tokens issued under same version are all revoked simultaneously on logout', async () => {
      const currentVer = 2;
      const user = { id: userAId, email: emailA, displayName: 'Alice Revocation', tokenVersion: currentVer };
      const token1 = authService.generateToken(user);
      const token2 = authService.generateToken(user);

      // Revoke tokens
      await authService.revokeUserTokens(userAId);

      // Both tokens must now fail authentication
      for (const token of [token1, token2]) {
        const req = { cookies: { [ENV.COOKIE_NAME]: token }, headers: {} };
        let err = null;
        await authenticate(req, { clearCookie: () => {} }, (e) => {
          err = e;
        });
        assert.ok(err, 'Token must be rejected');
        assert.strictEqual(err.statusCode, 401);
      }
    });

    test('4.2 User A token revocation does NOT affect User B (Cross-User Isolation)', async () => {
      // User B has tokenVersion 0
      const tokenB = authService.generateToken(userB);

      // Invalidate User A
      await authService.revokeUserTokens(userAId);

      // User B's token must still authenticate normally
      const reqB = {
        cookies: { [ENV.COOKIE_NAME]: tokenB },
        headers: {},
      };
      let nextCalledB = false;
      let errB = null;

      await authenticate(reqB, {}, (err) => {
        if (err) errB = err;
        else nextCalledB = true;
      });

      assert.strictEqual(nextCalledB, true);
      assert.strictEqual(errB, null);
      assert.strictEqual(reqB.user.id, userBId);
    });

    test('4.3 Legacy user without tokenVersion field is handled safely as version 0', async () => {
      // Simulate legacy user with undefined tokenVersion
      const legacyUserId = new mongoose.Types.ObjectId().toString();
      inMemoryUsers.set(legacyUserId, {
        _id: new mongoose.Types.ObjectId(legacyUserId),
        email: 'legacy@example.test',
        displayName: 'Legacy User',
      });

      // Legacy token without tokenVersion in JWT payload
      const legacyToken = authService.generateToken({ id: legacyUserId, email: 'legacy@example.test', displayName: 'Legacy User' });
      const req = {
        cookies: { [ENV.COOKIE_NAME]: legacyToken },
        headers: {},
      };
      let nextCalled = false;
      await authenticate(req, {}, (err) => {
        if (!err) nextCalled = true;
      });
      assert.strictEqual(nextCalled, true, 'Legacy token matches normalized version 0');
    });

    test('4.4 Error messages for revoked tokens are generic and do not leak internal version details', async () => {
      const revokedToken = authService.generateToken({ id: userAId, email: emailA, displayName: 'Alice', tokenVersion: 999 });
      const req = {
        cookies: { [ENV.COOKIE_NAME]: revokedToken },
        headers: {},
      };
      let nextErr = null;
      await authenticate(req, { clearCookie: () => {} }, (err) => {
        nextErr = err;
      });

      assert.ok(nextErr);
      assert.strictEqual(nextErr.statusCode, 401);
      assert.ok(!nextErr.message.toLowerCase().includes('version'), 'Error message must NOT mention version');
      assert.ok(!nextErr.message.toLowerCase().includes('mismatch'), 'Error message must NOT mention mismatch');
      assert.ok(!nextErr.message.toLowerCase().includes('mongo'), 'Error message must NOT mention mongo/database');
    });

    test('4.5 Concurrent logout calls atomically increment tokenVersion without race conditions', async () => {
      const initialDoc = inMemoryUsers.get(userAId);
      const startVersion = initialDoc?.tokenVersion || 0;

      // Fire 5 concurrent revokeUserTokens requests
      const promises = Array.from({ length: 5 }, () => authService.revokeUserTokens(userAId));
      await Promise.all(promises);

      const finalDoc = inMemoryUsers.get(userAId);
      assert.strictEqual(finalDoc.tokenVersion, startVersion + 5, '5 atomic increments must result in exactly +5 tokenVersion');
    });

    test('4.6 OptionalAuthenticate ignores revoked tokens without crashing', async () => {
      const staleToken = authService.generateToken({ id: userAId, email: emailA, displayName: 'Alice', tokenVersion: 0 });
      const req = {
        cookies: { [ENV.COOKIE_NAME]: staleToken },
        headers: {},
      };
      let nextCalled = false;
      await optionalAuthenticate(req, {}, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.user, undefined, 'req.user must remain undefined for revoked token in optionalAuthenticate');
    });
  });
});
