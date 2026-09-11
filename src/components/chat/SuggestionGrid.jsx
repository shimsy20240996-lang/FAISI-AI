import React from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, GraduationCap, PenTool, BarChart3, Code2, Rocket } from 'lucide-react';
import Card from '../common/Card';

export const SUGGESTIONS = [
  {
    id: 'explain',
    category: 'Explain something',
    icon: <Lightbulb className="w-4 h-4 text-amber-400" />,
    title: 'Explain Quantum Computing',
    prompt: 'Explain quantum computing in simple terms with everyday analogies.',
  },
  {
    id: 'learn',
    category: 'Help me learn',
    icon: <GraduationCap className="w-4 h-4 text-emerald-400" />,
    title: 'Python Roadmap for Beginners',
    prompt: 'Create a structured 4-week roadmap to learn Python programming from scratch.',
  },
  {
    id: 'write',
    category: 'Write something',
    icon: <PenTool className="w-4 h-4 text-indigo-400" />,
    title: 'Professional Follow-up Email',
    prompt: 'Draft a polite and concise follow-up email after a job interview.',
  },
  {
    id: 'analyze',
    category: 'Analyze information',
    icon: <BarChart3 className="w-4 h-4 text-cyan-400" />,
    title: 'Remote vs Hybrid Work Analysis',
    prompt: 'Compare the productivity, psychological, and operational tradeoffs of remote vs hybrid work.',
  },
  {
    id: 'code',
    category: 'Help with code',
    icon: <Code2 className="w-4 h-4 text-purple-400" />,
    title: 'Async/Await vs Promises',
    prompt: 'Explain the difference between JavaScript Promises and async/await with clean code examples.',
  },
  {
    id: 'brainstorm',
    category: 'Brainstorm ideas',
    icon: <Rocket className="w-4 h-4 text-pink-400" />,
    title: 'Eco-Tech Startup Concepts',
    prompt: 'Brainstorm 5 innovative startup concepts combining AI and environmental sustainability.',
  },
];

/**
 * SuggestionGrid Component
 * @param {{ onSelectSuggestion: (prompt: string) => void }} props
 */
export function SuggestionGrid({ onSelectSuggestion }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
      {SUGGESTIONS.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
        >
          <Card
            hoverable
            onClick={() => onSelectSuggestion(item.prompt)}
            className="group flex flex-col justify-between h-full p-4 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all text-left"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-neutral-800/80 dark:bg-neutral-800/80 light:bg-neutral-100 group-hover:bg-indigo-950/40 transition-colors">
                  {item.icon}
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 light:text-neutral-500">
                  {item.category}
                </span>
              </div>
              <h4 className="text-sm font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800 group-hover:text-indigo-400 transition-colors">
                {item.title}
              </h4>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-400 light:text-neutral-500 mt-2 line-clamp-2 leading-relaxed">
              "{item.prompt}"
            </p>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

export default SuggestionGrid;
