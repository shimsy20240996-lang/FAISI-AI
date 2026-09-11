import React from 'react';

/**
 * Reusable Badge Component
 * @param {{
 *   children: React.ReactNode,
 *   variant?: 'default' | 'success' | 'indigo' | 'outline' | 'purple' | 'amber',
 *   className?: string
 * }} props
 */
export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default:
      'bg-neutral-800/80 text-neutral-300 border-neutral-700/60 dark:bg-neutral-800/80 dark:text-neutral-300 light:bg-neutral-200 light:text-neutral-700 light:border-neutral-300',
    success:
      'bg-emerald-950/60 text-emerald-400 border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-400 light:bg-emerald-100 light:text-emerald-700 light:border-emerald-300',
    indigo:
      'bg-indigo-950/60 text-indigo-400 border-indigo-800/60 dark:bg-indigo-950/60 dark:text-indigo-400 light:bg-indigo-100 light:text-indigo-700 light:border-indigo-300',
    purple:
      'bg-purple-950/60 text-purple-400 border-purple-800/60 dark:bg-purple-950/60 dark:text-purple-400 light:bg-purple-100 light:text-purple-700 light:border-purple-300',
    amber:
      'bg-amber-950/60 text-amber-400 border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-400 light:bg-amber-100 light:text-amber-700 light:border-amber-300',
    outline:
      'bg-transparent text-neutral-400 border-neutral-800 dark:text-neutral-400 dark:border-neutral-800 light:text-neutral-600 light:border-neutral-300',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border transition-colors ${
        variants[variant] || variants.default
      } ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
