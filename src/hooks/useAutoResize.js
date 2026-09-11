import { useEffect, useRef } from 'react';

/**
 * Custom Hook: useAutoResize
 * Automatically recalculates textarea scroll height on value change.
 * @param {string} value - The input text value
 * @param {number} maxHeight - Maximum expansion height in pixels
 */
export function useAutoResize(value, maxHeight = 180) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to compute true scrollHeight accurately
    textarea.style.height = 'auto';

    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;

    // Toggle scrollbar only when exceeding maximum height
    if (textarea.scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  }, [value, maxHeight]);

  return textareaRef;
}

export default useAutoResize;
