import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';

/**
 * Accessible Delete Confirmation Modal
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onConfirm: () => void,
 *   title?: string,
 *   isDeleting?: boolean,
 * }} props
 */
export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'this conversation',
  isDeleting = false,
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Conversation"
      description="Permanently remove conversation from database"
      maxWidth="sm"
    >
      <div className="space-y-4 pt-2" onKeyDown={handleKeyDown}>
        <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-800/40 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs text-red-200 leading-relaxed">
            Are you sure you want to delete <strong className="text-white">"{title}"</strong>?
            This will permanently remove the conversation and its messages from MongoDB. This action cannot be undone.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            isLoading={isDeleting}
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Delete Conversation
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default DeleteConfirmModal;
