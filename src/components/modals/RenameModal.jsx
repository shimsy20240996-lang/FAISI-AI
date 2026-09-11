import React, { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';

/**
 * Accessible Rename Conversation Modal
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   currentTitle: string,
 *   onSave: (newTitle: string) => void,
 *   isSaving?: boolean,
 * }} props
 */
export function RenameModal({
  isOpen,
  onClose,
  currentTitle = '',
  onSave,
  isSaving = false,
}) {
  const [title, setTitle] = useState(currentTitle);

  useEffect(() => {
    setTitle(currentTitle);
  }, [currentTitle, isOpen]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSaving) return;
    onSave(trimmed);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rename Exploration"
      description="Update the conversation title in MongoDB"
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label
            htmlFor="rename-title-input"
            className="block text-xs font-medium text-neutral-300 dark:text-neutral-300 light:text-neutral-700 mb-1.5"
          >
            Title
          </label>
          <input
            id="rename-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            autoFocus
            disabled={isSaving}
            className="w-full bg-neutral-950/80 dark:bg-neutral-950/80 light:bg-white border border-neutral-800 dark:border-neutral-800 light:border-neutral-300 rounded-xl px-3.5 py-2 text-sm text-neutral-100 dark:text-neutral-100 light:text-neutral-900 placeholder:text-neutral-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          <div className="text-[10px] text-neutral-500 text-right mt-1">
            {title.length}/120
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={!title.trim() || isSaving}
            isLoading={isSaving}
            leftIcon={<Edit2 className="w-3.5 h-3.5" />}
          >
            Save Title
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default RenameModal;
