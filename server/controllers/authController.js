import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { authService } from '../services/authService.js';
import { isDatabaseConnected } from '../config/database.js';
import { ENV } from '../config/env.js';
import { AppError, ValidationError, AuthenticationError } from '../utils/errors.js';

// Pre-computed valid bcrypt cost=12 hash used for dummy comparison to eliminate timing discrepancies
const DUMMY_BCRYPT_HASH = '$2a$12$e8rGvUuJ4U1NqG5yO8m2OeJk8b9zW7Y5kP2vX6cQ9lR3nT7sD1f2q';

function checkDatabase() {
  if (!isDatabaseConnected()) {
    throw new AppError(
      'Database connection is not available. Please ensure MongoDB is running.',
      503,
      'DATABASE_CONNECTION_ERROR'
    );
  }
}

/**
 * Register a new user account.
 */
export async function register(req, res, next) {
  try {
    checkDatabase();
    const { email, password, displayName } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new ValidationError('A valid email address is required.');
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long.');
    }
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      throw new ValidationError('Display name is required.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sanitizedDisplayName = displayName.trim().slice(0, 60);

    // Check if email already registered
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new AppError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_REGISTERED'
      );
    }

    // Hash password with bcrypt
    const passwordHash = await User.hashPassword(password);

    // Create and save user
    const newUser = new User({
      email: normalizedEmail,
      displayName: sanitizedDisplayName,
      passwordHash,
    });

    await newUser.save();

    // Issue HTTP-only authentication cookie
    const token = authService.generateToken(newUser);
    authService.setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      user: newUser.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Log in to an existing user account.
 */
export async function login(req, res, next) {
  try {
    checkDatabase();
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      throw new ValidationError('Email and password are required.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Perform constant dummy bcrypt work to mitigate email enumeration timing discrepancies
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      throw new AuthenticationError('Invalid email or password.');
    }

    // Verify password hash
    const isMatch = await user.verifyPassword(password);
    if (!isMatch) {
      throw new AuthenticationError('Invalid email or password.');
    }

    // Issue HTTP-only authentication cookie
    const token = authService.generateToken(user);
    authService.setAuthCookie(res, token);

    res.status(200).json({
      success: true,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Log out, atomically increment tokenVersion to revoke all active JWTs, and clear the authentication cookie.
 */
export async function logout(req, res) {
  try {
    const token = req.cookies?.[ENV.COOKIE_NAME];
    let userId = req.user?.id;

    if (!userId && token) {
      try {
        const decoded = authService.verifyToken(token);
        if (decoded?.id) {
          userId = decoded.id;
        }
      } catch {
        // Ignore token decode/verification errors during logout
      }
    }

    if (userId) {
      await authService.revokeUserTokens(userId);
    }
  } catch {
    // Non-blocking catch to ensure cookie clearance always completes
  }

  authService.clearAuthCookie(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
}

/**
 * Get current authenticated user profile.
 */
export async function getMe(req, res, next) {
  try {
    checkDatabase();
    const user = await User.findById(req.user.id);
    if (!user) {
      authService.clearAuthCookie(res);
      throw new AuthenticationError('User account not found. Please sign in again.');
    }

    res.status(200).json({
      success: true,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}
