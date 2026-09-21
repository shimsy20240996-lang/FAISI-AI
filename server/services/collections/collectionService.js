import mongoose from 'mongoose';
import { Collection } from '../../models/Collection.js';
import { Document } from '../../models/Document.js';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6})$/;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class CollectionService {
  /**
   * Creates a new user-owned collection.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {{ name: string, description?: string, color?: string }} data
   * @returns {Promise<any>}
   */
  async createCollection(userId, { name, description = '', color = '#6366f1' } = {}) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const err = new Error('Collection name is required and cannot be empty.');
      err.statusCode = 400;
      throw err;
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 60) {
      const err = new Error('Collection name cannot exceed 60 characters.');
      err.statusCode = 400;
      throw err;
    }

    const trimmedDesc = typeof description === 'string' ? description.trim() : '';
    if (trimmedDesc.length > 300) {
      const err = new Error('Description cannot exceed 300 characters.');
      err.statusCode = 400;
      throw err;
    }

    const trimmedColor = typeof color === 'string' && color.trim() ? color.trim() : '#6366f1';
    if (!HEX_COLOR_REGEX.test(trimmedColor)) {
      const err = new Error(`"${trimmedColor}" is not a valid 6-character hex color code (e.g. #6366f1).`);
      err.statusCode = 400;
      throw err;
    }

    // Check case-insensitive duplicate per user
    const existing = await Collection.findOne({
      userId: userObjectId,
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
    });

    if (existing) {
      const err = new Error(`A collection named "${trimmedName}" already exists.`);
      err.statusCode = 400;
      throw err;
    }

    const collection = await Collection.create({
      userId: userObjectId,
      name: trimmedName,
      description: trimmedDesc,
      color: trimmedColor,
    });

    return {
      ...collection.toJSON(),
      documentCount: 0,
    };
  }

  /**
   * Retrieves all collections for the authenticated user with live aggregated document counts.
   * @param {string|mongoose.Types.ObjectId} userId
   * @returns {Promise<{ collections: Array<any>, uncategorizedCount: number, total: number }>}
   */
  async getUserCollections(userId) {
    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const [collections, countAgg, uncategorizedCount] = await Promise.all([
      Collection.find({ userId: userObjectId }).sort({ createdAt: -1 }),
      Document.aggregate([
        {
          $match: {
            userId: userObjectId,
            collectionId: { $ne: null },
          },
        },
        {
          $group: {
            _id: '$collectionId',
            count: { $sum: 1 },
          },
        },
      ]),
      Document.countDocuments({
        userId: userObjectId,
        collectionId: null,
      }),
    ]);

    const countMap = new Map();
    for (const item of countAgg) {
      if (item._id) {
        countMap.set(item._id.toString(), item.count);
      }
    }

    const formattedCollections = collections.map((col) => ({
      ...col.toJSON(),
      documentCount: countMap.get(col._id.toString()) || 0,
    }));

    return {
      collections: formattedCollections,
      uncategorizedCount,
      total: formattedCollections.length,
    };
  }

  /**
   * Retrieves a single collection by ID enforcing user ownership.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {string} collectionId
   * @returns {Promise<any|null>}
   */
  async getCollection(userId, collectionId) {
    if (!collectionId || !mongoose.Types.ObjectId.isValid(collectionId)) {
      return null;
    }

    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const collection = await Collection.findOne({
      _id: collectionId,
      userId: userObjectId,
    });

    if (!collection) {
      return null;
    }

    const documentCount = await Document.countDocuments({
      userId: userObjectId,
      collectionId: collection._id,
    });

    return {
      ...collection.toJSON(),
      documentCount,
    };
  }

  /**
   * Updates an existing user collection.
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {string} collectionId
   * @param {{ name?: string, description?: string, color?: string }} data
   * @returns {Promise<any|null>}
   */
  async updateCollection(userId, collectionId, { name, description, color } = {}) {
    if (!collectionId || !mongoose.Types.ObjectId.isValid(collectionId)) {
      return null;
    }

    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const collection = await Collection.findOne({
      _id: collectionId,
      userId: userObjectId,
    });

    if (!collection) {
      return null;
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        const err = new Error('Collection name cannot be empty.');
        err.statusCode = 400;
        throw err;
      }
      const trimmedName = name.trim();
      if (trimmedName.length > 60) {
        const err = new Error('Collection name cannot exceed 60 characters.');
        err.statusCode = 400;
        throw err;
      }

      // Check if duplicate name exists on other collection
      const existing = await Collection.findOne({
        userId: userObjectId,
        _id: { $ne: collection._id },
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
      });

      if (existing) {
        const err = new Error(`A collection named "${trimmedName}" already exists.`);
        err.statusCode = 400;
        throw err;
      }

      collection.name = trimmedName;
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        const err = new Error('Description must be a string.');
        err.statusCode = 400;
        throw err;
      }
      const trimmedDesc = description.trim();
      if (trimmedDesc.length > 300) {
        const err = new Error('Description cannot exceed 300 characters.');
        err.statusCode = 400;
        throw err;
      }
      collection.description = trimmedDesc;
    }

    if (color !== undefined) {
      if (typeof color !== 'string' || !HEX_COLOR_REGEX.test(color.trim())) {
        const err = new Error(`"${color}" is not a valid 6-character hex color code.`);
        err.statusCode = 400;
        throw err;
      }
      collection.color = color.trim();
    }

    await collection.save();

    const documentCount = await Document.countDocuments({
      userId: userObjectId,
      collectionId: collection._id,
    });

    return {
      ...collection.toJSON(),
      documentCount,
    };
  }

  /**
   * Deletes a collection safely without deleting documents (uncouples documents).
   * @param {string|mongoose.Types.ObjectId} userId
   * @param {string} collectionId
   * @returns {Promise<{ success: boolean, uncoupledCount: number }|null>}
   */
  async deleteCollection(userId, collectionId) {
    if (!collectionId || !mongoose.Types.ObjectId.isValid(collectionId)) {
      return null;
    }

    const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const collection = await Collection.findOne({
      _id: collectionId,
      userId: userObjectId,
    });

    if (!collection) {
      return null;
    }

    // Uncouple member documents safely
    const uncoupleResult = await Document.updateMany(
      {
        userId: userObjectId,
        collectionId: collection._id,
      },
      {
        $set: {
          collectionId: null,
        },
      }
    );

    // Delete collection document
    await Collection.deleteOne({
      _id: collection._id,
      userId: userObjectId,
    });

    return {
      success: true,
      message: 'Collection deleted successfully. Member documents were moved to Uncategorized.',
      uncoupledCount: uncoupleResult.modifiedCount || 0,
    };
  }
}

export const collectionService = new CollectionService();
