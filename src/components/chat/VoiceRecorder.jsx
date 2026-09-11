import React from 'react';
import { Mic, Square, X, Check, Loader2 } from 'lucide-react';

/**
 * VoiceRecorder Component
 * @param {{
 *   isRecording: boolean,
 *   isProcessing: boolean,
 *   duration: number,
 *   maxDuration?: number,
 *   onCancel: () => void,
 *   onStop: () => void,
 * }} props
 */
export function VoiceRecorder({
  isRecording,
  isProcessing,
  duration,
  maxDuration = 60,
  onCancel,
  onStop,
}) {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      role="region"
      aria-label="Voice input recorder"
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-neutral-950/90 border border-indigo-500/40 text-xs shadow-lg shadow-black/40 animate-fadeIn"
    >
      {/* Left: Live status & timer */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
          <Mic className="w-4 h-4 animate-pulse" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-100">
              {isProcessing ? 'Transcribing with Gemini...' : 'Listening...'}
            </span>
            <span className="font-mono text-neutral-400 text-[11px]">
              {formatTime(duration)} / {formatTime(maxDuration)}
            </span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-0.5">
            {isProcessing ? 'Converting speech to text' : 'Speak clearly into your microphone'}
          </p>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          aria-label="Cancel recording"
          className="p-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 border border-neutral-700/50 transition-colors cursor-pointer"
          title="Cancel recording"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onStop}
          disabled={isProcessing}
          aria-label="Done recording"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          title="Finish recording and transcribe"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Transcribing...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default VoiceRecorder;
