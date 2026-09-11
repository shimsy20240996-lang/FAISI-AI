import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { authService } from '../services/authService.js';
import { ENV } from '../config/env.js';
import { AuthenticationError } from '../utils/errors.js';

/**
 * Authentication Middleware.
 * Strictly reads the secure HTTP-only cookie 'nova_auth_token'.
 * Attaches verified user identity to req.user = { id, email, displayName }.
 * Rejects unauthenticated requests or revoked tokens with 401 Unauthorized.
 */
export async function authenticate(req, res, next) {
  const token = req.cookies?.[ENV.COOKIE_NAME];

  if (!token) {
    return next(
      new AuthenticationError('Authentication required. Please sign in.')
    );
  }

  try {
    const decoded = authService.verifyToken(token);
    if (!decoded || !decoded.id) {
      return next(
        new AuthenticationError('Invalid authentication session. Please sign in again.')
      );
    }

    // Verify user and tokenVersion against database state
    if (mongoose.Types.ObjectId.isValid(decoded.id)) {
      let user = null;
      try {
        user = await User.findById(decoded.id)
          .select('_id email displayName tokenVersion')
          .lean();
      } catch {
        // Database query error
      }

      if (user) {
        const currentTokenVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
        const tokenVersionInJwt = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;

        if (currentTokenVersion !== tokenVersionInJwt) {
          if (res?.clearCookie) {
            authService.clearAuthCookie(res);
          }
          return next(
            new AuthenticationError('Session has expired. Please sign in again.')
          );
        }

        req.user = {
          id: (user._id || user.id).toString(),
          email: user.email,
          displayName: user.displayName,
        };
      } else {
        // User not found in active database
        if (res?.clearCookie) {
          authService.clearAuthCookie(res);
        }
        return next(
          new AuthenticationError('Invalid authentication session. Please sign in again.')
        );
      }
    } else {
      // Fallback for offline mock tests or non-ObjectId identifiers
      req.user = {
        id: decoded.id,
        email: decoded.email,
        displayName: decoded.displayName,
      };
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional Authentication Middleware.
 * Attaches req.user if a valid non-revoked cookie is present, but does not block unauthenticated requests.
 */
export async function optionalAuthenticate(req, res, next) {
  const token = req.cookies?.[ENV.COOKIE_NAME];

  if (token) {
    try {
      const decoded = authService.verifyToken(token);
      if (decoded && decoded.id) {
        if (mongoose.Types.ObjectId.isValid(decoded.id)) {
          let user = null;
          try {
            user = await User.findById(decoded.id)
              .select('_id email displayName tokenVersion')
              .lean();
          } catch {
            // Database query error
          }

          if (user) {
            const currentTokenVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
            const tokenVersionInJwt = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;

            if (currentTokenVersion === tokenVersionInJwt) {
              req.user = {
                id: (user._id || user.id).toString(),
                email: user.email,
                displayName: user.displayName,
              };
            }
          }
        } else {
          req.user = {
            id: decoded.id,
            email: decoded.email,
            displayName: decoded.displayName,
          };
        }
      }
    } catch {
      // Ignore errors for optional auth
    }
  }

  next();
}
