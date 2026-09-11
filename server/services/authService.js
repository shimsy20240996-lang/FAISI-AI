import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { AuthenticationError } from '../utils/errors.js';

class AuthService {
  /**
   * Generates a signed JWT payload for an authenticated user.
   * @param {{ id: string, email: string, displayName: string }} user
   * @returns {string}
   */
  generateToken(user) {
    if (!ENV.AUTH_SECRET) {
      throw new Error('AUTH_SECRET is not configured on the server.');
    }

    const payload = {
      id: user.id || user._id?.toString(),
      email: user.email,
      displayName: user.displayName,
      tokenVersion: typeof user.tokenVersion === 'number' ? user.tokenVersion : 0,
    };

    return jwt.sign(payload, ENV.AUTH_SECRET, {
      expiresIn: ENV.AUTH_EXPIRES_IN || '7d',
    });
  }

  /**
   * Verifies a JWT token and returns the decoded payload.
   * @param {string} token
   * @returns {{ id: string, email: string, displayName: string }}
   */
  verifyToken(token) {
    if (!token || typeof token !== 'string') {
      throw new AuthenticationError('Authentication token is required.');
    }

    if (!ENV.AUTH_SECRET) {
      throw new Error('AUTH_SECRET is not configured on the server.');
    }

    try {
      const decoded = jwt.verify(token, ENV.AUTH_SECRET);
      return decoded;
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthenticationError('Session has expired. Please sign in again.');
      }
      throw new AuthenticationError('Invalid authentication token.');
    }
  }

  /**
   * Attaches the secure HTTP-only authentication cookie to the response.
   * @param {import('express').Response} res
   * @param {string} token
   */
  setAuthCookie(res, token) {
    const isProduction = ENV.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    };

    res.cookie(ENV.COOKIE_NAME, token, cookieOptions);
  }

  /**
   * Clears the authentication cookie from the response.
   * @param {import('express').Response} res
   */
  clearAuthCookie(res) {
    const isProduction = ENV.NODE_ENV === 'production';
    res.clearCookie(ENV.COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }

  /**
   * Atomically increments the tokenVersion for a user, invalidating all currently active JWTs.
   * @param {string} userId
   * @returns {Promise<number>}
   */
  async revokeUserTokens(userId) {
    if (!userId) return 0;
    const { User } = await import('../models/User.js');
    const updated = await User.findByIdAndUpdate(
      userId,
      { $inc: { tokenVersion: 1 } },
      { new: true, select: '_id tokenVersion' }
    );
    return updated?.tokenVersion ?? 0;
  }
}

export const authService = new AuthService();
export default authService;
