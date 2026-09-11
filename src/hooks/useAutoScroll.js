import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Intelligent Auto-Scroll Hook
 * Tracks user scroll position. Automatically follows streaming text if near the bottom (<100px),
 * but pauses auto-scrolling if the user manually scrolls up to read earlier history.
 */
export function useAutoScroll(dependencies = []) {
  const scrollContainerRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAutoScrolling = useRef(false);

  const checkIfAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const threshold = 100; // pixels from bottom to consider "at bottom"
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    setIsAtBottom(distanceToBottom <= threshold);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isAutoScrolling.current = true;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });

    setIsAtBottom(true);
    setTimeout(() => {
      isAutoScrolling.current = false;
    }, 300);
  }, []);

  // Handle scroll events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isAutoScrolling.current) {
        checkIfAtBottom();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom]);

  // Auto-scroll on content updates if user is at bottom
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return {
    scrollContainerRef,
    bottomAnchorRef,
    isAtBottom,
    scrollToBottom,
  };
}

export default useAutoScroll;
