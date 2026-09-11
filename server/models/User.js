import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [254, 'Email cannot exceed 254 characters'],
      validate: {
        validator: function (v) {
          return EMAIL_REGEX.test(v);
        },
        message: (props) => `"${props.value}" is not a valid email address.`,
      },
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: true, // We include select: true so verifyPassword has access, but toJSON strips it unconditionally
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [60, 'Display name cannot exceed 60 characters'],
    },
    storageUsedBytes: {
      type: Number,
      default: 0,
      min: [0, 'Storage used bytes cannot be negative'],
    },
    documentCount: {
      type: Number,
      default: 0,
      min: [0, 'Document count cannot be negative'],
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: [0, 'Token version cannot be negative'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.passwordHash;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Compares candidate plaintext password with stored bcrypt passwordHash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
UserSchema.methods.verifyPassword = async function (candidatePassword) {
  if (!candidatePassword || typeof candidatePassword !== 'string') {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Hashes a plaintext password using bcrypt with salt rounds = 12.
 * @param {string} password
 * @returns {Promise<string>}
 */
UserSchema.statics.hashPassword = async function (password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  return bcrypt.hash(password, 12);
};

export const User = mongoose.model('User', UserSchema);
export default User;
