import React from 'react';

/**
 * Reusable Accessible Button Component
 * @param {{
 *   children: React.ReactNode,
 *   variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger',
 *   size?: 'sm' | 'md' | 'lg',
 *   leftIcon?: React.ReactNode,
 *   rightIcon?: React.ReactNode,
 *   isLoading?: boolean,
 *   disabled?: boolean,
 *   className?: string,
 *   onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void,
 *   type?: 'button' | 'submit' | 'reset',
 *   'aria-label'?: string,
 * }} props
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading = false,
  disabled = false,
  className = '',
  onClick,
  type = 'button',
  'aria-label': ariaLabel,
  ...props
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none';

  const sizeStyles = {
    sm: 'px-3 py-2 sm:py-1.5 text-xs gap-1.5 min-h-[44px] sm:min-h-[34px]',
    md: 'px-4 py-2.5 text-sm gap-2 min-h-[44px] sm:min-h-[42px]',
    lg: 'px-5 py-3 text-base gap-2.5 min-h-[48px]',
  };

  const variantStyles = {
    primary:
      'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 border border-indigo-500/30 active:bg-indigo-700',
    secondary:
      'bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-100 border border-neutral-700/60 light:bg-neutral-200 light:text-neutral-800 light:hover:bg-neutral-300 light:border-neutral-300',
    outline:
      'bg-transparent hover:bg-neutral-800/50 text-neutral-300 border border-neutral-700 hover:border-neutral-600 dark:text-neutral-200 light:text-neutral-700 light:hover:bg-neutral-100 light:border-neutral-300',
    ghost:
      'bg-transparent hover:bg-neutral-800/60 text-neutral-300 hover:text-neutral-100 dark:text-neutral-300 dark:hover:text-white light:text-neutral-600 light:hover:text-neutral-900 light:hover:bg-neutral-100',
    danger:
      'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 active:bg-red-600/40',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
}

export default Button;
