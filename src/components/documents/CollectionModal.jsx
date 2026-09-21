import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, FolderEdit, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { apiCreateCollection, apiUpdateCollection } from '../../services/api';

export const PRESET_COLLECTION_COLORS = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#8b5cf6', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#14b8a6', label: 'Teal' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#64748b', label: 'Slate' },
];

/**
 * CollectionModal Component
 * Accessible dialog for creating or editing user document collections.
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onSuccess: (collection: any, isEdit: boolean) => void,
 *   collection?: any | null,
 * }} props
 */
export default function CollectionModal({
  isOpen,
  onClose,
  onSuccess,
  collection = null,
}) {
  const isEdit = Boolean(collection && collection.id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef(null);
  const modalRef = useRef(null);

  // Initialize or reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (collection) {
        setName(collection.name || '');
        setDescription(collection.description || '');
        setColor(collection.color || '#6366f1');
      } else {
        setName('');
        setDescription('');
        setColor('#6366f1');
      }
      setError('');
      setIsSubmitting(false);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, collection]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Collection name is required.');
      nameInputRef.current?.focus();
      return;
    }

    if (trimmedName.length > 60) {
      setError('Collection name cannot exceed 60 characters.');
      return;
    }

    if (description.trim().length > 300) {
      setError('Description cannot exceed 300 characters.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      let result;
      if (isEdit) {
        result = await apiUpdateCollection(collection.id, {
          name: trimmedName,
          description: description.trim(),
          color,
        });
      } else {
        result = await apiCreateCollection({
          name: trimmedName,
          description: description.trim(),
          color,
        });
      }

      onSuccess(result, isEdit);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save collection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scaleUp text-neutral-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm"
              style={{ backgroundColor: `${color}30`, borderColor: `${color}60`, borderWidth: 1 }}
            >
              {isEdit ? (
                <FolderEdit className="w-4 h-4" style={{ color }} />
              ) : (
                <FolderPlus className="w-4 h-4" style={{ color }} />
              )}
            </div>
            <div>
              <h3 id="collection-modal-title" className="text-sm font-semibold text-white">
                {isEdit ? 'Edit Collection' : 'Create New Collection'}
              </h3>
              <p className="text-[11px] text-white/50">
                {isEdit ? 'Update collection details and color' : 'Group related documents into a dedicated workspace'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Collection Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="collection-name" className="text-xs font-medium text-white/80">
                Collection Name <span className="text-red-400">*</span>
              </label>
              <span className="text-[10px] text-white/40">{name.length}/60</span>
            </div>
            <input
              id="collection-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="e.g. Research, Projects, University, Contracts"
              maxLength={60}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="collection-description" className="text-xs font-medium text-white/80">
                Description <span className="text-white/40 text-[10px]">(Optional)</span>
              </label>
              <span className="text-[10px] text-white/40">{description.length}/300</span>
            </div>
            <textarea
              id="collection-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              placeholder="Brief summary of documents in this collection..."
              rows={2}
              maxLength={300}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors resize-none"
            />
          </div>

          {/* Color Palette Picker */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-white/80 block">
              Color Tag
            </label>
            <div className="grid grid-cols-5 gap-2.5" role="radiogroup" aria-label="Collection color selection">
              {PRESET_COLLECTION_COLORS.map((c) => {
                const isSelected = color.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={c.label}
                    onClick={() => setColor(c.hex)}
                    className={`h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer relative min-h-[44px] sm:min-h-[32px] focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                      isSelected
                        ? 'ring-2 ring-white scale-105 shadow-md'
                        : 'opacity-80 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  >
                    {isSelected && (
                      <Check className="w-4 h-4 text-white drop-shadow-md stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer min-h-[44px] sm:min-h-[36px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-[36px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEdit ? 'Saving...' : 'Creating...'}</span>
                </>
              ) : (
                <span>{isEdit ? 'Save Changes' : 'Create Collection'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
