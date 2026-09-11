import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import IconButton from './IconButton';

/**
 * Accessible Reusable Modal Component
 * With dynamic focus trapping, focus restoration, body scroll locking, and Escape dismissal.
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   title?: string,
 *   description?: string,
 *   children: React.ReactNode,
 *   maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl',
 *   className?: string,
 * }} props
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  className = '',
}) {
  const modalCardRef = useRef(null);
  const triggerElementRef = useRef(null);

  // Focus restoration & body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    // 1. Save previously focused element to restore on close
    triggerElementRef.current = document.activeElement;

    // 2. Lock body scroll while preserving previous style
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 3. Focus first focusable element inside modal after layout paint
    const timer = setTimeout(() => {
      if (modalCardRef.current) {
        const focusables = modalCardRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          modalCardRef.current.focus();
        }
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
        try {
          triggerElementRef.current.focus();
        } catch {
          // Trigger element may have unmounted
        }
      }
    };
  }, [isOpen]);

  // Keyboard navigation: Escape key & Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalCardRef.current) {
        const focusableElements = Array.from(
          modalCardRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first, cycle to last
          if (document.activeElement === firstElement || !modalCardRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last, cycle to first
          if (document.activeElement === lastElement || !modalCardRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '5xl': 'max-w-5xl',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            ref={modalCardRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`relative w-full ${maxWidthClasses[maxWidth] || maxWidthClasses.md} bg-neutral-900 dark:bg-neutral-900 light:bg-white border border-neutral-800 dark:border-neutral-800 light:border-neutral-200 rounded-2xl shadow-2xl p-6 z-10 outline-none ${className}`}
          >
            {/* Header */}
            {(title || onClose) && (
              <div className="flex items-start justify-between pb-4 border-b border-neutral-800/80 light:border-neutral-200/80 mb-4">
                <div>
                  {title && (
                    <h2
                      id="modal-title"
                      className="text-lg font-bold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tracking-tight"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      id="modal-description"
                      className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-500 mt-0.5"
                    >
                      {description}
                    </p>
                  )}
                </div>
                <IconButton
                  icon={<X className="w-4 h-4" />}
                  label="Close modal"
                  onClick={onClose}
                  size="sm"
                />
              </div>
            )}

            {/* Content */}
            <div>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default Modal;
