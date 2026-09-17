import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, BookOpen, Code, Compass, Zap } from 'lucide-react';
import SuggestionGrid from './SuggestionGrid';
import Badge from '../common/Badge';
import { APP_CONFIG } from '../../utils/constants';

/**
 * WelcomeScreen Component (Empty Conversation State)
 * @param {{ onSelectSuggestion: (prompt: string) => void }} props
 */
export function WelcomeScreen({ onSelectSuggestion }) {
  const capabilities = [
    { label: 'Deep Learning', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { label: 'Code & Architecture', icon: <Code className="w-3.5 h-3.5" /> },
    { label: 'Synthesis & Research', icon: <Compass className="w-3.5 h-3.5" /> },
    { label: 'Creative Ideation', icon: <Zap className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 text-center max-w-4xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col items-center mb-8"
      >
        {/* SABU Spark Mark */}
        <div className="relative mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 shadow-xl shadow-indigo-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-neutral-950 dark:bg-neutral-950 light:bg-white rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-indigo-400 dark:text-indigo-400 light:text-indigo-600 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Headline */}
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-neutral-100 via-neutral-200 to-neutral-400 dark:from-neutral-100 dark:via-neutral-200 dark:to-neutral-400 light:from-neutral-900 light:via-neutral-800 light:to-neutral-600 bg-clip-text text-transparent mb-2">
          How can SABU help you today?
        </h2>

        {/* Inclusive Subtitle */}
        <p className="text-xs sm:text-sm text-neutral-400 dark:text-neutral-400 light:text-neutral-600 max-w-md mb-4 leading-relaxed">
          SABU AI is designed to assist you with learning, writing, coding, analysis, and everyday inquiries.
        </p>

        {/* Capability Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          {capabilities.map((cap, i) => (
            <Badge key={i} variant="outline" className="gap-1.5 py-1">
              {cap.icon}
              {cap.label}
            </Badge>
          ))}
        </div>
      </motion.div>

      {/* Suggestion Prompts */}
      <SuggestionGrid onSelectSuggestion={onSelectSuggestion} />
    </div>
  );
}

export default WelcomeScreen;
