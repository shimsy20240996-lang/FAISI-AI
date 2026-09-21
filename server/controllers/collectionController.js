import { collectionService } from '../services/collections/collectionService.js';

export class CollectionController {
  /**
   * POST /api/collections
   * Creates a new user-owned collection.
   */
  async createCollection(req, res, next) {
    try {
      const { name, description, color } = req.body || {};
      const collection = await collectionService.createCollection(req.user.id, {
        name,
        description,
        color,
      });

      return res.status(201).json({
        success: true,
        collection,
      });
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: err.code || (statusCode === 400 ? 'INVALID_COLLECTION_DATA' : 'CREATE_COLLECTION_FAILED'),
          message: err.message || 'Failed to create collection.',
        },
      });
    }
  }

  /**
   * GET /api/collections
   * Lists all collections for the authenticated user.
   */
  async getCollections(req, res, next) {
    try {
      const data = await collectionService.getUserCollections(req.user.id);
      return res.status(200).json({
        success: true,
        collections: data.collections,
        uncategorizedCount: data.uncategorizedCount,
        total: data.total,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_COLLECTIONS_FAILED',
          message: err.message || 'Failed to retrieve collections.',
        },
      });
    }
  }

  /**
   * GET /api/collections/:id
   * Retrieves single collection by ID.
   */
  async getCollection(req, res, next) {
    try {
      const collection = await collectionService.getCollection(req.user.id, req.params.id);

      if (!collection) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'COLLECTION_NOT_FOUND',
            message: 'Collection not found.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        collection,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_COLLECTION_FAILED',
          message: err.message || 'Failed to retrieve collection.',
        },
      });
    }
  }

  /**
   * PATCH /api/collections/:id
   * Updates collection name, description, or color.
   */
  async updateCollection(req, res, next) {
    try {
      const { name, description, color } = req.body || {};
      const collection = await collectionService.updateCollection(req.user.id, req.params.id, {
        name,
        description,
        color,
      });

      if (!collection) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'COLLECTION_NOT_FOUND',
            message: 'Collection not found.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        collection,
      });
    } catch (err) {
      const statusCode = err.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: err.code || (statusCode === 400 ? 'INVALID_COLLECTION_UPDATE' : 'UPDATE_COLLECTION_FAILED'),
          message: err.message || 'Failed to update collection.',
        },
      });
    }
  }

  /**
   * DELETE /api/collections/:id
   * Deletes collection safely and moves documents to uncategorized.
   */
  async deleteCollection(req, res, next) {
    try {
      const result = await collectionService.deleteCollection(req.user.id, req.params.id);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'COLLECTION_NOT_FOUND',
            message: 'Collection not found.',
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        uncoupledCount: result.uncoupledCount,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_COLLECTION_FAILED',
          message: err.message || 'Failed to delete collection.',
        },
      });
    }
  }
}

export const collectionController = new CollectionController();
