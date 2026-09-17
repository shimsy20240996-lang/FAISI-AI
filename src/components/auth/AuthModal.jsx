import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  X,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';

/**
 * Accessible, original SABU AI Authentication Modal (Login & Registration).
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   initialMode?: 'login' | 'register',
 *   onSuccess?: (user: any) => void,
 * }} props
 */
export function AuthModal({
  isOpen,
  onClose,
  initialMode = 'login',
  onSuccess,
}) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    setMode(initialMode);
    setErrorMessage(null);
  }, [initialMode, isOpen]);

  // Focus restoration & body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    triggerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first input field
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const input = modalRef.current.querySelector('input');
        input?.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        try {
          triggerRef.current.focus();
        } catch {
          // Trigger unmounted
        }
      }
    };
  }, [isOpen]);

  // Keyboard Escape & Tab Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password || password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (mode === 'register') {
      const trimmedName = displayName.trim();
      if (!trimmedName) {
        setErrorMessage('Please enter your display name.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }

      setIsSubmitting(true);
      try {
        const user = await register({
          email: trimmedEmail,
          password,
          displayName: trimmedName,
        });
        onSuccess?.(user);
        onClose();
      } catch (err) {
        setErrorMessage(err.message || 'Registration failed. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        const user = await login({
          email: trimmedEmail,
          password,
        });
        onSuccess?.(user);
        onClose();
      } catch (err) {
        setErrorMessage(err.message || 'Invalid email or password.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <motion.div
        ref={modalRef}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-md bg-neutral-950 dark:bg-neutral-950 light:bg-white border border-neutral-800 dark:border-neutral-800 light:border-neutral-200 rounded-3xl shadow-2xl overflow-hidden relative outline-none"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close authentication window"
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-100 dark:hover:text-neutral-100 light:hover:text-neutral-900 rounded-xl hover:bg-neutral-900 dark:hover:bg-neutral-900 light:hover:bg-neutral-100 transition-colors z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header with SABU Gradient */}
        <div className="p-6 pb-4 text-center border-b border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 mx-auto mb-3 shadow-lg shadow-indigo-500/25 flex items-center justify-center">
            <div className="w-full h-full bg-neutral-950 dark:bg-neutral-950 light:bg-white rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
            </div>
          </div>
          <h2
            id="auth-modal-title"
            className="text-xl font-extrabold tracking-tight text-neutral-100 dark:text-neutral-100 light:text-neutral-900"
          >
            {mode === 'login' ? 'Welcome Back to SABU AI' : 'Create Your SABU AI Account'}
          </h2>
          <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600 mt-1 max-w-xs mx-auto">
            {mode === 'login'
              ? 'Sign in to access your persistent conversations across devices.'
              : 'Sign up for secure, private cloud conversations and synchronization.'}
          </p>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-neutral-900 dark:bg-neutral-900 light:bg-neutral-100 p-1 rounded-xl mt-4 border border-neutral-800/60 dark:border-neutral-800/60 light:border-neutral-200">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-neutral-800 dark:bg-neutral-800 light:bg-white text-neutral-100 dark:text-neutral-100 light:text-neutral-900 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 dark:hover:text-neutral-200 light:hover:text-neutral-700'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-neutral-800 dark:bg-neutral-800 light:bg-white text-neutral-100 dark:text-neutral-100 light:text-neutral-900 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 dark:hover:text-neutral-200 light:hover:text-neutral-700'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Banner */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                aria-live="polite"
                className="p-3 rounded-xl bg-red-950/40 border border-red-800/50 flex items-start gap-2.5 text-xs text-red-200"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Registration Display Name */}
          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-display-name"
                className="block text-xs font-medium text-neutral-300 dark:text-neutral-300 light:text-neutral-700 mb-1.5"
              >
                Display Name
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" />
                <input
                  id="auth-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alice Explorer"
                  maxLength={60}
                  required
                  disabled={isSubmitting}
                  className="w-full bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-neutral-50 border border-neutral-800 dark:border-neutral-800 light:border-neutral-300 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-neutral-100 dark:text-neutral-100 light:text-neutral-900 placeholder:text-neutral-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>
          )}

          {/* Email Address */}
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-neutral-300 dark:text-neutral-300 light:text-neutral-700 mb-1.5"
            >
              Email Address
            </label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
                disabled={isSubmitting}
                className="w-full bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-neutral-50 border border-neutral-800 dark:border-neutral-800 light:border-neutral-300 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-neutral-100 dark:text-neutral-100 light:text-neutral-900 placeholder:text-neutral-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-neutral-300 dark:text-neutral-300 light:text-neutral-700 mb-1.5"
            >
              Password (min. 8 characters)
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                required
                disabled={isSubmitting}
                className="w-full bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-neutral-50 border border-neutral-800 dark:border-neutral-800 light:border-neutral-300 rounded-xl pl-10 pr-10 py-2.5 text-xs text-neutral-100 dark:text-neutral-100 light:text-neutral-900 placeholder:text-neutral-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 text-neutral-500 hover:text-neutral-300 cursor-pointer p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (Register mode only) */}
          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="block text-xs font-medium text-neutral-300 dark:text-neutral-300 light:text-neutral-700 mb-1.5"
              >
                Confirm Password
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 pointer-events-none" />
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={isSubmitting}
                  className="w-full bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-neutral-50 border border-neutral-800 dark:border-neutral-800 light:border-neutral-300 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-neutral-100 dark:text-neutral-100 light:text-neutral-900 placeholder:text-neutral-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full justify-center"
              isLoading={isSubmitting}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              {mode === 'login' ? 'Sign In to SABU AI' : 'Create Account'}
            </Button>
          </div>
        </form>

        {/* Modal Footer Note */}
        <div className="px-6 py-4 bg-neutral-900/50 dark:bg-neutral-900/50 light:bg-neutral-50 border-t border-neutral-800/60 dark:border-neutral-800/60 light:border-neutral-200 text-center">
          <p className="text-[11px] text-neutral-500">
            {mode === 'login' ? (
              <>
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMessage(null);
                  }}
                  className="text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  Create one now
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className="text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  Sign in to your account
                </button>
              </>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default AuthModal;
