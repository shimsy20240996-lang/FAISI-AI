import React from 'react';
import Tooltip from './Tooltip';

/**
 * Reusable Accessible Icon Button Component
 * Guarantees a minimum 40-44px touch target for accessibility.
 * @param {{
 *   icon: React.ReactNode,
 *   label: string,
 *   tooltip?: string,
 *   tooltipPosition?: 'top' | 'bottom' | 'left' | 'right',
 *   variant?: 'ghost' | 'secondary' | 'primary' | 'outline',
 *   size?: 'sm' | 'md' | 'lg',
 *   disabled?: boolean,
 *   isActive?: boolean,
 *   className?: string,
 *   onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void,
 * }} props
 */
export function IconButton({
  icon,
  label,
  tooltip,
  tooltipPosition = 'top',
  variant = 'ghost',
  size = 'md',
  disabled = false,
  isActive = false,
  className = '',
  onClick,
  ...props
}) {
  const sizeStyles = {
    sm: 'min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] w-auto h-auto sm:w-8 sm:h-8 p-2.5 sm:p-1.5 text-xs',
    md: 'min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] w-auto h-auto sm:w-10 sm:h-10 p-2.5 sm:p-2 text-sm',
    lg: 'min-w-[44px] min-h-[44px] w-11 h-11 p-2.5 text-base',
  };

  const variantStyles = {
    ghost:
      'bg-transparent hover:bg-neutral-800/70 text-neutral-400 hover:text-neutral-100 active:bg-neutral-800 dark:hover:bg-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 light:text-neutral-600 light:hover:bg-neutral-200/80 light:hover:text-neutral-900',
    secondary:
      'bg-neutral-800/80 hover:bg-neutral-700/80 text-neutral-300 border border-neutral-700/50 dark:bg-neutral-800 dark:text-neutral-200 light:bg-neutral-200 light:text-neutral-800 light:border-neutral-300',
    primary:
      'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 active:bg-indigo-700',
    outline:
      'bg-transparent hover:bg-neutral-800/40 text-neutral-400 border border-neutral-800 hover:border-neutral-700 dark:text-neutral-300',
  };

  const activeStyles = isActive
    ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40 hover:bg-indigo-600/30'
    : '';

  const buttonElement = (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none active:scale-95 focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none ${sizeStyles[size]} ${variantStyles[variant]} ${activeStyles} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );

  if (tooltip && !disabled) {
    return (
      <Tooltip content={tooltip} position={tooltipPosition}>
        {buttonElement}
      </Tooltip>
    );
  }

  return buttonElement;
}

export default IconButton;
