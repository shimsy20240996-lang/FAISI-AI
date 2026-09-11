import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, User, ShieldCheck, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Generates clean 2-letter initials from a display name or email.
 */
function getInitials(name, email) {
  if (name && typeof name === 'string') {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email && typeof email === 'string') {
    return email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

/**
 * Authenticated User Profile Menu & Sign Out Component.
 * @param {{
 *   isCompact?: boolean,
 *   onOpenSettings?: () => void,
 * }} props
 */
export function UserProfileMenu({ isCompact = false, onOpenSettings }) {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!user) return null;

  const initials = getInitials(user.displayName, user.email);

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`User profile: ${user.displayName || user.email}`}
        className={`w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-neutral-800/60 dark:hover:bg-neutral-800/60 light:hover:bg-neutral-200/80 transition-all cursor-pointer border border-transparent ${
          isOpen ? 'bg-neutral-800/60 dark:bg-neutral-800/60 light:bg-neutral-200/80' : ''
        } ${isCompact ? 'justify-center' : ''}`}
      >
        {/* Avatar Circle */}
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 p-0.5 shrink-0 flex items-center justify-center shadow-sm shadow-indigo-500/30">
          <div className="w-full h-full bg-neutral-900 rounded-[6px] flex items-center justify-center text-[10px] font-bold text-white tracking-wider">
            {initials}
          </div>
        </div>

        {/* User Name & Email */}
        {!isCompact && (
          <>
            <div className="flex-1 text-left truncate min-w-0">
              <div className="text-xs font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800 truncate">
                {user.displayName || 'Authenticated User'}
              </div>
              <div className="text-[10px] text-neutral-500 truncate">
                {user.email}
              </div>
            </div>
            <ChevronUp
              className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </>
        )}
      </button>

      {/* Popover Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-56 bg-neutral-950 dark:bg-neutral-950 light:bg-white border border-neutral-800 dark:border-neutral-800 light:border-neutral-200 rounded-2xl shadow-xl p-2 z-50 space-y-1"
          >
            {/* Header info */}
            <div className="px-3 py-2 border-b border-neutral-800/70 dark:border-neutral-800/70 light:border-neutral-200">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                <ShieldCheck className="w-3 h-3" />
                <span>Authenticated</span>
              </div>
              <div className="text-xs font-bold text-neutral-200 dark:text-neutral-200 light:text-neutral-800 truncate mt-0.5">
                {user.displayName}
              </div>
              <div className="text-[11px] text-neutral-500 truncate">{user.email}</div>
            </div>

            {/* Actions */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-950/40 dark:hover:bg-red-950/40 light:hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default UserProfileMenu;
