import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2, Info } from 'lucide-react';
import { apiDeleteCollection } from '../../services/api';

/**
 * CollectionDeleteModal Component
 * Confirms collection deletion and informs the user that member documents will remain safe in Uncategorized.
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onSuccess: (deletedId: string, uncoupledCount: number) => void,
 *   collection?: any | null,
 * }} props
 */
export default function CollectionDeleteModal({
  isOpen,
  onClose,
  onSuccess,
  collection = null,
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !collection) return null;

  const docCount = collection.documentCount || 0;

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    try {
      const result = await apiDeleteCollection(collection.id);
      onSuccess(collection.id, result.uncoupledCount || 0);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete collection.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-collection-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scaleUp text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 id="delete-collection-title" className="text-sm font-semibold text-white">
                Delete Collection
              </h3>
              <p className="text-[11px] text-white/50">
                Confirm deletion of "{collection.name}"
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
            >
              {error}
            </div>
          )}

          <p className="text-xs text-white/80 leading-relaxed">
            Are you sure you want to delete the collection{' '}
            <strong className="text-white">"{collection.name}"</strong>?
          </p>

          {/* Safety Notice Card */}
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 text-xs leading-relaxed">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-cyan-300">Your documents will not be deleted.</p>
              <p className="text-[11px] text-cyan-200/80 mt-0.5">
                {docCount > 0
                  ? `${docCount} document${docCount > 1 ? 's' : ''} in this collection will remain safe and be moved to Uncategorized.`
                  : 'This collection is currently empty.'}
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer min-h-[44px] sm:min-h-[36px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/20 transition-all cursor-pointer disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Collection</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
