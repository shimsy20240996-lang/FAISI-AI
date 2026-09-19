import React from 'react';
import { Moon, Sun, Monitor, Shield, Sparkles, Sliders } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { APP_CONFIG } from '../../utils/constants';

export function SettingsModal({
  isOpen,
  onClose,
  theme,
  setTheme,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings & Preferences"
      description="Customize your FAISI AI workspace experience"
      maxWidth="md"
    >
      <div className="space-y-6 pt-2">
        {/* Appearance / Theme Selection */}
        <div>
          <label className="text-xs font-semibold text-neutral-300 dark:text-neutral-300 light:text-neutral-700 uppercase tracking-wider block mb-3">
            Interface Theme
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                theme === 'dark'
                  ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
                  : 'border-neutral-800 dark:border-neutral-800 light:border-neutral-200 text-neutral-400 hover:border-neutral-700'
              }`}
            >
              <Moon className="w-5 h-5 text-indigo-400" />
              <div>
                <div className="text-sm font-medium">Dark Mode</div>
                <div className="text-xs text-neutral-500">Deep neutral theme (Default)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                theme === 'light'
                  ? 'border-indigo-500 bg-indigo-100/50 text-indigo-700'
                  : 'border-neutral-800 dark:border-neutral-800 light:border-neutral-200 text-neutral-400 hover:border-neutral-700'
              }`}
            >
              <Sun className="w-5 h-5 text-amber-500" />
              <div>
                <div className="text-sm font-medium">Light Mode</div>
                <div className="text-xs text-neutral-500">Clean bright aesthetic</div>
              </div>
            </button>
          </div>
        </div>

        {/* Accessibility Options */}
        <div className="p-4 rounded-xl bg-neutral-950/60 dark:bg-neutral-950/60 light:bg-neutral-100/70 border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
                Reduced Motion Compliance
              </span>
            </div>
            <Badge variant="success">OS Synchronized</Badge>
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
            Animations automatically respect your device's <code>prefers-reduced-motion</code> accessibility settings.
          </p>
        </div>

        {/* About & Version Info */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200 text-xs text-neutral-500">
          <span>{APP_CONFIG.NAME} v{APP_CONFIG.VERSION} &bull; {APP_CONFIG.CURRENT_PHASE}</span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default SettingsModal;
