import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Accessible Tooltip Component
 * @param {{
 *   content: React.ReactNode,
 *   children: React.ReactElement,
 *   position?: 'top' | 'bottom' | 'left' | 'right',
 *   delay?: number
 * }} props
 */
export function Tooltip({ content, children, position = 'top', delay = 200 }) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState(null);

  if (!content) return children;

  const show = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const hide = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 pointer-events-none whitespace-nowrap rounded-md bg-neutral-900 dark:bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-200 shadow-xl border border-neutral-700/60 ${positionClasses[position]}`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Tooltip;
