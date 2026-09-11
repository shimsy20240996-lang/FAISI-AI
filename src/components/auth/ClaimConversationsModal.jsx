import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Cloud, HardDrive, Sparkles, ArrowRight } from 'lucide-react';
import Button from '../common/Button';

/**
 * Accessible modal prompting newly authenticated users to claim or keep anonymous browser conversations.
 * @param {{
 *   isOpen: boolean,
 *   unclaimedCount: number,
 *   onClaim: () => Promise<void>,
 *   onDismiss: () => void,
 * }} props
 */
export function ClaimConversationsModal({
  isOpen,
  unclaimedCount = 1,
  onClaim,
  onDismiss,
}) {
  const [isClaiming, setIsClaiming] = useState(false);

  if (!isOpen) return null;

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      await onClaim();
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-md bg-neutral-950 dark:bg-neutral-950 light:bg-white border border-neutral-800 dark:border-neutral-800 light:border-neutral-200 rounded-3xl shadow-2xl p-6 relative text-center"
      >
        {/* Header Icon */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 mx-auto mb-4 shadow-lg shadow-indigo-500/25 flex items-center justify-center">
          <div className="w-full h-full bg-neutral-950 dark:bg-neutral-950 light:bg-white rounded-[14px] flex items-center justify-center">
            <Cloud className="w-6 h-6 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
          </div>
        </div>

        <h2
          id="claim-modal-title"
          className="text-lg font-extrabold text-neutral-100 dark:text-neutral-100 light:text-neutral-900 tracking-tight"
        >
          We found {unclaimedCount} conversation{unclaimedCount > 1 ? 's' : ''} on this browser
        </h2>

        <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600 mt-2 leading-relaxed">
          Move your previous conversations to your authenticated account so they stay synchronized across all your devices, or keep them locally on this device.
        </p>

        {/* Feature Cards Comparison */}
        <div className="grid grid-cols-2 gap-3 my-5 text-left">
          <div className="p-3 rounded-xl bg-neutral-900/80 dark:bg-neutral-900/80 light:bg-neutral-50 border border-neutral-800 dark:border-neutral-800 light:border-neutral-200">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 dark:text-indigo-400 light:text-indigo-600 mb-1">
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud Sync</span>
            </div>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
              Access everywhere on any device with your account.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-neutral-900/80 dark:bg-neutral-900/80 light:bg-neutral-50 border border-neutral-800 dark:border-neutral-800 light:border-neutral-200">
            <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-300 dark:text-neutral-300 light:text-neutral-700 mb-1">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Local Only</span>
            </div>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
              Keep conversations strictly isolated on this browser.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <Button
            variant="primary"
            size="md"
            className="w-full justify-center"
            onClick={handleClaim}
            isLoading={isClaiming}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Move conversations to my account
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-center"
            onClick={onDismiss}
            disabled={isClaiming}
          >
            Keep them on this device
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default ClaimConversationsModal;
