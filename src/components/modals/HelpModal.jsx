import React from 'react';
import { Keyboard, MapPin, Sparkles, CheckCircle2, Clock } from 'lucide-react';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import Button from '../common/Button';

export function HelpModal({ isOpen, onClose }) {
  const shortcuts = [
    { key: 'Enter', action: 'Send message' },
    { key: 'Shift + Enter', action: 'New line in composer' },
    { key: 'Ctrl + N', action: 'New exploration chat' },
    { key: 'Esc', action: 'Close dialogs / Mobile sidebar' },
  ];

  const roadmap = [
    { phase: 'Core Engine', name: 'Gemini 3.6 Flash, Streaming, RAG & Voice', status: 'Completed', current: false },
    { phase: 'Security & Auth', name: 'JWT Sessions, Cloud Sync & Security Hardening', status: 'Completed', current: false },
    { phase: 'Reliability & Speed', name: 'Production Optimization & Resilience', status: 'Completed', current: false },
    { phase: 'Phase 10.5', name: 'Production UX Polish & Accessibility (WCAG 2.2)', status: 'Active (Current)', current: true },
    { phase: 'Future', name: 'Multi-Model Inference & Advanced Analytics', status: 'Upcoming', current: false },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Help & Project Roadmap"
      description="Keyboard shortcuts and development timeline for FAISI AI"
      maxWidth="lg"
    >
      <div className="space-y-6 pt-2">
        {/* Brand & Dedication */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/40 to-purple-950/40 border border-indigo-500/20 text-center space-y-1">
          <div className="text-xs font-bold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
            FAISI AI &bull; Your AI. Your Way.
          </div>
          <div className="text-[11px] text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
            Inspired by Failul Rahman &amp; Sithy Siyama.
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Keyboard className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
              Keyboard Shortcuts
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {shortcuts.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 dark:bg-neutral-950/60 light:bg-neutral-100 border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200"
              >
                <span className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
                  {item.action}
                </span>
                <kbd className="px-2 py-0.5 text-xs font-mono rounded bg-neutral-800 dark:bg-neutral-800 light:bg-white border border-neutral-700 dark:border-neutral-700 light:border-neutral-300 text-neutral-200 dark:text-neutral-200 light:text-neutral-800 shadow-sm">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Development Roadmap */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
              Phase Roadmap
            </h3>
          </div>
          <div className="space-y-2">
            {roadmap.map((item, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  item.current
                    ? 'border-indigo-500/80 bg-indigo-950/20 text-neutral-100'
                    : 'border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200 bg-neutral-950/40 dark:bg-neutral-950/40 light:bg-neutral-50/50 text-neutral-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.status === 'Completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : item.current ? (
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-neutral-500" />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
                      {item.phase}: {item.name}
                    </div>
                  </div>
                </div>
                <Badge
                  variant={
                    item.status === 'Completed'
                      ? 'success'
                      : item.current
                      ? 'indigo'
                      : 'outline'
                  }
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default HelpModal;
