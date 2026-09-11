import React, { useState } from 'react';
import { Copy, Check, RotateCw, ThumbsUp, ThumbsDown, Volume2, VolumeX, Pause, Play, Loader2 } from 'lucide-react';
import IconButton from '../common/IconButton';

/**
 * MessageActions Component
 * @param {{
 *   content: string,
 *   isAssistant?: boolean,
 *   isGenerating?: boolean,
 *   status?: string,
 *   onRegenerate?: () => void,
 *   onPlaySpeech?: () => void,
 *   isPlayingSpeech?: boolean,
 *   isSpeechLoading?: boolean,
 *   onNotice?: (featureName: string, description: string) => void,
 * }} props
 */
export function MessageActions({
  content,
  isAssistant = false,
  isGenerating = false,
  status = 'complete',
  onRegenerate,
  onPlaySpeech,
  isPlayingSpeech = false,
  isSpeechLoading = false,
  onNotice,
}) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const handleFeedback = (type) => {
    if (onNotice) {
      onNotice(
        'Response Feedback',
        'Response quality metrics and feedback controls will be connected in future iterations.'
      );
    }
  };

  const getSpeechIcon = () => {
    if (isSpeechLoading) {
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />;
    }
    if (isPlayingSpeech) {
      return <Pause className="w-3.5 h-3.5 text-indigo-400" />;
    }
    return <Volume2 className="w-3.5 h-3.5" />;
  };

  return (
    <div className="flex items-center gap-1 mt-2.5 opacity-100 sm:opacity-75 sm:group-hover:opacity-100 transition-opacity flex-wrap">
      {/* Copy Button */}
      <IconButton
        icon={
          isCopied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )
        }
        label={isCopied ? 'Copied response to clipboard' : 'Copy response'}
        tooltip={isCopied ? 'Copied!' : 'Copy'}
        size="sm"
        onClick={handleCopy}
      />

      {isAssistant && (
        <>
          {/* Read Aloud Button (Gemini TTS) */}
          {onPlaySpeech && (
            <IconButton
              icon={getSpeechIcon()}
              label={isPlayingSpeech ? 'Pause speech playback' : 'Read aloud with Gemini voice'}
              tooltip={isPlayingSpeech ? 'Pause' : 'Read aloud'}
              size="sm"
              disabled={isGenerating || isSpeechLoading}
              isActive={isPlayingSpeech}
              aria-pressed={isPlayingSpeech}
              onClick={onPlaySpeech}
            />
          )}

          {/* Active In-Place Regenerate Button */}
          {onRegenerate && (
            <IconButton
              icon={<RotateCw className="w-3.5 h-3.5" />}
              label="Regenerate response"
              tooltip="Regenerate"
              size="sm"
              disabled={isGenerating}
              onClick={onRegenerate}
            />
          )}

          {/* Feedback Buttons */}
          <IconButton
            icon={<ThumbsUp className="w-3.5 h-3.5" />}
            label="Helpful response"
            tooltip="Helpful"
            size="sm"
            onClick={() => handleFeedback('up')}
          />
          <IconButton
            icon={<ThumbsDown className="w-3.5 h-3.5" />}
            label="Unhelpful response"
            tooltip="Unhelpful"
            size="sm"
            onClick={() => handleFeedback('down')}
          />
        </>
      )}
    </div>
  );
}

export default MessageActions;

