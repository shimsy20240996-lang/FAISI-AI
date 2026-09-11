import React from 'react';

/**
 * Reusable Card Component
 * @param {{
 *   children: React.ReactNode,
 *   className?: string,
 *   hoverable?: boolean,
 *   onClick?: () => void,
 * }} props
 */
export function Card({
  children,
  className = '',
  hoverable = false,
  onClick,
  ...props
}) {
  const hoverStyles = hoverable
    ? 'cursor-pointer hover:border-neutral-700 dark:hover:border-neutral-700 light:hover:border-neutral-400 hover:bg-neutral-800/50 dark:hover:bg-neutral-800/40 light:hover:bg-neutral-50/90 active:scale-[0.99]'
    : '';

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90 bg-neutral-900/60 dark:bg-neutral-900/60 light:bg-white/80 p-5 backdrop-blur-sm transition-all duration-200 ${hoverStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
