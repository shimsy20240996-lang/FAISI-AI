import React, { useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import Message from './Message';
import useAutoScroll from '../../hooks/useAutoScroll';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';

/**
 * MessageList Component
 * @param {{
 *   messages: Array<any>,
 *   isGenerating?: boolean,
 *   onRegenerate?: (messageId: string) => void,
 *   onNotice?: (featureName: string, description: string) => void,
 * }} props
 */
export function MessageList({
  messages,
  isGenerating = false,
  onRegenerate,
  onNotice,
}) {
  const { scrollContainerRef, bottomAnchorRef, isAtBottom, scrollToBottom } =
    useAutoScroll([messages, isGenerating]);

  const {
    playbackState,
    activeMessageId,
    play: playSpeech,
  } = useAudioPlayer();

  const handlePlaySpeech = useCallback(
    (messageId, text) => {
      playSpeech(messageId, text);
    },
    [playSpeech]
  );

  return (
    <div className="relative flex-1 overflow-hidden flex flex-col">
      {/* Scrollable Message Container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
        tabIndex={0}
        aria-label="Conversation message history"
      >
        {messages.map((msg) => (
          <Message
            key={msg.id}
            message={msg}
            isGenerating={isGenerating}
            onRegenerate={onRegenerate}
            onPlaySpeech={handlePlaySpeech}
            isPlayingSpeech={activeMessageId === msg.id && playbackState === 'playing'}
            isSpeechLoading={activeMessageId === msg.id && playbackState === 'loading'}
            onNotice={onNotice}
          />
        ))}

        <div ref={bottomAnchorRef} />
      </div>

      {/* Floating Jump to Latest Button */}
      {!isAtBottom && messages.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label="Jump to latest message"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-white text-xs font-medium text-neutral-200 dark:text-neutral-200 light:text-neutral-800 shadow-xl border border-neutral-700/80 dark:border-neutral-700/80 light:border-neutral-300 hover:border-indigo-500 transition-all active:scale-95 cursor-pointer backdrop-blur-md"
          >
            <ArrowDown className="w-3.5 h-3.5 text-indigo-400 animate-bounce" />
            <span>Jump to latest</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default MessageList;
