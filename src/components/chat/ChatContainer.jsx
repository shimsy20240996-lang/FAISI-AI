import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import WelcomeScreen from './WelcomeScreen';
import MessageList from './MessageList';
import ChatComposer from './ChatComposer';
import Button from '../common/Button';

/**
 * ChatContainer Component
 * @param {{
 *   conversation: { id: string, title: string, messages: Array<any> } | null,
 *   isGenerating: boolean,
 *   errorMessage: string | null,
 *   onSendMessage: (text: string) => void,
 *   onStopGeneration?: () => void,
 *   onRegenerate?: (messageId: string) => void,
 *   onSelectSuggestion: (prompt: string) => void,
 *   onRetry: () => void,
 *   useKnowledgeBase?: boolean,
 *   onToggleKnowledgeBase?: () => void,
 *   onOpenDocuments?: () => void,
 *   onNotice: (featureName: string, description: string) => void,
 * }} props
 */
export function ChatContainer({
  conversation,
  isGenerating = false,
  errorMessage = null,
  onSendMessage,
  onStopGeneration,
  onRegenerate,
  onSelectSuggestion,
  onRetry,
  useKnowledgeBase = false,
  onToggleKnowledgeBase,
  onOpenDocuments,
  onNotice,
}) {
  const messages = conversation?.messages || [];
  const isEmpty = messages.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950 dark:bg-neutral-950 light:bg-neutral-50 relative">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-indigo-600/5 dark:bg-indigo-600/5 light:bg-indigo-400/10 blur-[140px] rounded-full" />
      </div>

      {/* Screen Reader Status Live Region */}
      <div role="status" aria-live="polite" className="sr-only">
        {isGenerating
          ? 'FAISI AI response generation started'
          : errorMessage
          ? `Error: ${errorMessage}`
          : 'FAISI AI response generation complete'}
      </div>

      {/* Main Conversation Stream or Welcome Screen */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isEmpty ? (
          <WelcomeScreen onSelectSuggestion={onSelectSuggestion} />
        ) : (
          <MessageList
            messages={messages}
            isGenerating={isGenerating}
            onRegenerate={onRegenerate}
            onNotice={onNotice}
          />
        )}
      </div>

      {/* Error Recovery Banner */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mx-4 mb-2 max-w-3xl sm:mx-auto w-full p-3 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center justify-between gap-3 text-xs text-red-300 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              leftIcon={<RotateCcw className="w-3 h-3" />}
              className="text-xs py-1 px-2.5 min-h-[30px] border-red-800/60 hover:bg-red-900/30 text-red-200"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Bottom Composer */}
      <ChatComposer
        onSendMessage={onSendMessage}
        onStopGeneration={onStopGeneration}
        isGenerating={isGenerating}
        useKnowledgeBase={useKnowledgeBase}
        onToggleKnowledgeBase={onToggleKnowledgeBase}
        onOpenDocuments={onOpenDocuments}
        onNotice={onNotice}
      />
    </div>
  );
}

export default ChatContainer;
