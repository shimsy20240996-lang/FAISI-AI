import React from 'react';
import { Sparkles, Calendar } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';

export function FeatureNoticeModal({
  isOpen,
  onClose,
  title = 'Feature In Progress',
  description = 'This feature is scheduled for an upcoming development phase.',
  phase = 'Phase 2',
  featureName = 'Upcoming Capability',
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={`NOVA AI Development Roadmap Notice`}
      maxWidth="sm"
    >
      <div className="space-y-4 pt-2">
        <div className="flex flex-col items-center text-center p-4 rounded-xl bg-neutral-950/60 dark:bg-neutral-950/60 light:bg-neutral-50 border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
          <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center mb-3">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <Badge variant="indigo" className="mb-2">
            {phase}
          </Badge>
          <h4 className="text-sm font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800 mb-1">
            {featureName}
          </h4>
          <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" size="sm" onClick={onClose} className="w-full">
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default FeatureNoticeModal;
