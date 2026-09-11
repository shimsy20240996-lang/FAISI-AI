import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, FileText, CheckCircle2 } from 'lucide-react';
import Badge from '../common/Badge';

/**
 * Citation Inspector Modal
 * Displays authentic source chunk snippet, page number, and similarity score.
 */
export function CitationModal({ source, isOpen, onClose }) {
  const modalRef = useRef(null);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !source) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="citation-title"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 id="citation-title" className="text-sm font-semibold text-neutral-100 truncate">
                  Source [{source.sourceIndex}]: {source.documentName}
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Verified Knowledge Base Citation
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close citation details"
              className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-4 text-sm">
            {/* Metadata Pills */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Badge variant="indigo" className="py-1 px-2">
                <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                Score: {Math.round((source.score || 0) * 100)}% Match
              </Badge>

              {source.pageNumber !== null && source.pageNumber !== undefined && (
                <Badge variant="secondary" className="py-1 px-2">
                  Page {source.pageNumber}
                </Badge>
              )}

              {source.sectionTitle && (
                <Badge variant="outline" className="py-1 px-2">
                  Section: {source.sectionTitle}
                </Badge>
              )}
            </div>

            {/* Chunk Snippet Box */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-neutral-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Retrieved Reference Passage
              </span>
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800/80 text-neutral-300 text-xs sm:text-sm leading-relaxed font-sans select-text whitespace-pre-wrap max-h-60 overflow-y-auto">
                {source.snippet || 'No snippet preview available.'}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/40 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default CitationModal;
