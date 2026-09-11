import React from 'react';
import { Cpu, Sparkles, CheckCircle2, ShieldCheck, Layers } from 'lucide-react';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import Button from '../common/Button';

export function ModelSelectorModal({ isOpen, onClose }) {
  const models = [
    {
      name: 'Google Gemini 2.5 Flash',
      provider: 'Google AI (Official SDK)',
      description: 'High-speed reasoning, coding, writing, and structured analysis. Active backend provider.',
      badge: 'Active Provider',
      badgeVariant: 'success',
      isActive: true,
    },
    {
      name: 'Anthropic Claude 3.7',
      provider: 'Anthropic AI',
      description: 'Deep analytical synthesis and complex multi-step reasoning.',
      badge: 'Future Phase',
      badgeVariant: 'outline',
      isActive: false,
    },
    {
      name: 'Local Models (Ollama)',
      provider: 'On-Device / Private',
      description: 'Locally hosted open-weight models for private offline inference.',
      badge: 'Future Phase',
      badgeVariant: 'outline',
      isActive: false,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Active AI Model & Providers"
      description="NOVA AI multi-model architecture configuration"
      maxWidth="md"
    >
      <div className="space-y-4 pt-2">
        <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/40 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-xs text-indigo-300 leading-relaxed">
            Live AI responses are securely generated on the Node.js backend using <strong>Google Gemini 2.5 Flash</strong> via the official <code>@google/genai</code> SDK.
          </p>
        </div>

        <div className="space-y-2">
          {models.map((model, i) => (
            <div
              key={i}
              className={`p-3.5 rounded-xl border transition-all ${
                model.isActive
                  ? 'border-indigo-500/80 bg-indigo-950/20 dark:bg-indigo-950/20 light:bg-indigo-50/60 shadow-sm'
                  : 'border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200 bg-neutral-950/40 dark:bg-neutral-950/40 light:bg-neutral-50/50 opacity-70'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Cpu className={`w-4 h-4 ${model.isActive ? 'text-indigo-400' : 'text-neutral-500'}`} />
                  <span className="text-sm font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
                    {model.name}
                  </span>
                </div>
                <Badge variant={model.badgeVariant}>
                  {model.isActive && <CheckCircle2 className="w-3 h-3 mr-1" />}
                  {model.badge}
                </Badge>
              </div>
              <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
                {model.description}
              </p>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ModelSelectorModal;
