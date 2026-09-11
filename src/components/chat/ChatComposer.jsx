import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, Mic, BookOpen, AlertCircle } from 'lucide-react';
import IconButton from '../common/IconButton';
import Badge from '../common/Badge';
import useAutoResize from '../../hooks/useAutoResize';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { VoiceRecorder } from './VoiceRecorder';
import { ImageComposerPreviews } from './ImagePreviewGallery';
import { apiUploadImages, apiTranscribeAudio } from '../../services/api';

/**
 * ChatComposer Component
 * @param {{
 *   onSendMessage: (text: string, attachments?: Array<any>) => void,
 *   onStopGeneration?: () => void,
 *   isGenerating?: boolean,
 *   useKnowledgeBase?: boolean,
 *   onToggleKnowledgeBase?: () => void,
 *   onOpenDocuments?: () => void,
 *   onNotice?: (featureName: string, description: string) => void,
 * }} props
 */
export function ChatComposer({
  onSendMessage,
  onStopGeneration,
  isGenerating = false,
  useKnowledgeBase = false,
  onToggleKnowledgeBase,
  onOpenDocuments,
  onNotice,
}) {
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerError, setComposerError] = useState('');

  const textareaRef = useAutoResize(input, 160);
  const fileInputRef = useRef(null);

  // Voice recording hook
  const handleRecordComplete = async (audioBlob) => {
    setIsTranscribing(true);
    setComposerError('');
    try {
      const res = await apiTranscribeAudio(audioBlob);
      if (res?.text) {
        setInput((prev) => (prev ? `${prev.trim()} ${res.text.trim()}` : res.text.trim()));
      }
    } catch (err) {
      setComposerError(`Voice transcription failed: ${err.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const {
    isRecording,
    duration,
    error: recordError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder({
    maxDurationSeconds: 60,
    onRecordComplete: handleRecordComplete,
  });

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      pendingImages.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      });
    };
  }, [pendingImages]);

  const handleFilesSelected = (files) => {
    setComposerError('');
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const validImages = [];

    for (const file of fileList) {
      if (pendingImages.length + validImages.length >= 3) {
        setComposerError('You can attach a maximum of 3 images per message.');
        break;
      }

      // Reject SVG
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        setComposerError('SVG images are not supported for security reasons. Please select JPEG, PNG, WebP, or GIF.');
        continue;
      }

      // Reject non-image
      if (!file.type.startsWith('image/')) {
        setComposerError('Only image files (JPEG, PNG, WebP, GIF) are supported.');
        continue;
      }

      // Reject oversized (>5MB)
      if (file.size > 5 * 1024 * 1024) {
        setComposerError(`Image "${file.name}" exceeds maximum allowed size of 5 MB.`);
        continue;
      }

      validImages.push({
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        size: file.size,
      });
    }

    if (validImages.length > 0) {
      setPendingImages((prev) => [...prev, ...validImages]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index) => {
    setPendingImages((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isGenerating || isUploadingImages) return;

    const trimmed = input.trim();
    if (!trimmed && pendingImages.length === 0) return;

    let uploadedAttachments = [];

    if (pendingImages.length > 0) {
      setIsUploadingImages(true);
      setComposerError('');
      try {
        const rawFiles = pendingImages.map((img) => img.file).filter(Boolean);
        if (rawFiles.length > 0) {
          const uploadRes = await apiUploadImages(rawFiles);
          uploadedAttachments = uploadRes.attachments || [];
        }
      } catch (err) {
        setComposerError(`Failed to upload images: ${err.message}`);
        setIsUploadingImages(false);
        return;
      } finally {
        setIsUploadingImages(false);
      }
    }

    onSendMessage(trimmed, uploadedAttachments.length > 0 ? uploadedAttachments : undefined);

    // Reset state
    setInput('');
    pendingImages.forEach((img) => {
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    });
    setPendingImages([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && !isUploadingImages) {
        handleSubmit();
      }
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 sm:pb-6">
      {/* Hidden file input for images */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFilesSelected(e.target.files)}
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
      />

      {/* Error notification banner */}
      {(composerError || recordError) && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-2 flex items-center justify-between gap-2 p-2.5 px-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{composerError || recordError}</span>
          </div>
          <button
            type="button"
            onClick={() => setComposerError('')}
            className="text-neutral-400 hover:text-white text-xs p-1"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Composer Box */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.files) {
            handleFilesSelected(e.dataTransfer.files);
          }
        }}
        className="relative rounded-2xl border border-neutral-800 dark:border-neutral-800 light:border-neutral-300 bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-white shadow-xl backdrop-blur-md transition-all focus-within:border-indigo-500/80 focus-within:ring-2 focus-within:ring-indigo-500/20"
      >
        {/* Pending Image Previews */}
        <ImageComposerPreviews
          attachments={pendingImages}
          onRemove={handleRemoveImage}
          isUploading={isUploadingImages}
        />

        {/* Live Voice Recorder or Text Area */}
        {isRecording || isTranscribing ? (
          <div className="p-3">
            <VoiceRecorder
              isRecording={isRecording}
              isProcessing={isTranscribing}
              duration={duration}
              maxDuration={60}
              onCancel={cancelRecording}
              onStop={stopRecording}
            />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isUploadingImages}
            placeholder={
              isGenerating
                ? pendingImages.length > 0
                  ? 'Draft question about attached image(s)...'
                  : 'Draft your next prompt while NOVA responds...'
                : pendingImages.length > 0
                ? 'Ask about the attached image(s)...'
                : 'Ask NOVA anything...'
            }
            rows={1}
            aria-label="Message input"
            className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-neutral-100 dark:text-neutral-100 light:text-neutral-900 placeholder:text-neutral-500 dark:placeholder:text-neutral-500 light:placeholder:text-neutral-400 resize-none outline-none max-h-[160px] leading-relaxed disabled:opacity-60"
          />
        )}

        {/* Toolbar Controls */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          {/* Left Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <IconButton
              icon={<Paperclip className="w-4 h-4" />}
              label="Attach image"
              tooltip="Attach image (JPEG, PNG, WebP, GIF)"
              size="sm"
              disabled={isGenerating || isRecording || pendingImages.length >= 3}
              onClick={() => fileInputRef.current?.click()}
            />
            <IconButton
              icon={<Mic className="w-4 h-4" />}
              label="Voice input"
              tooltip="Voice input"
              size="sm"
              disabled={isGenerating || isRecording}
              onClick={startRecording}
            />

            {/* Knowledge Base Mode Toggle */}
            <button
              type="button"
              onClick={onToggleKnowledgeBase}
              disabled={isGenerating || isRecording}
              aria-pressed={useKnowledgeBase}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-all cursor-pointer select-none min-h-[44px] sm:min-h-[32px] focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none ${
                useKnowledgeBase
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/50 shadow-sm shadow-indigo-500/10'
                  : 'bg-neutral-800/40 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 border border-neutral-700/40'
              }`}
              title={
                useKnowledgeBase
                  ? 'Knowledge Base Mode is ON — Grounding answers strictly in your uploaded documents'
                  : 'Knowledge Base Mode is OFF — Click to enable document-grounded answers'
              }
            >
              <BookOpen className={`w-3.5 h-3.5 ${useKnowledgeBase ? 'text-indigo-400' : 'text-neutral-400'}`} />
              <span className="hidden sm:inline">Knowledge Base:</span>
              <span className="sm:hidden">KB:</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${useKnowledgeBase ? 'text-indigo-300' : 'text-neutral-500'}`}>
                {useKnowledgeBase ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Right Submit / Stop Controls */}
          <div className="flex items-center gap-2">
            {!isGenerating ? (
              <>
                <span className="hidden sm:inline-block text-[11px] text-neutral-500 dark:text-neutral-500 light:text-neutral-400 select-none">
                  <kbd className="font-mono text-[10px] bg-neutral-800 dark:bg-neutral-800 light:bg-neutral-200 px-1.5 py-0.5 rounded border border-neutral-700 dark:border-neutral-700 light:border-neutral-300">
                    Enter
                  </kbd>{' '}
                  to send
                </span>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim() && pendingImages.length === 0}
                  aria-label="Send message"
                  className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] w-11 h-11 sm:w-8 sm:h-8 rounded-xl transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none ${
                    input.trim() || pendingImages.length > 0
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 cursor-pointer active:scale-95'
                      : 'bg-neutral-800/60 dark:bg-neutral-800/60 light:bg-neutral-200 text-neutral-500 dark:text-neutral-500 light:text-neutral-400 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
              </>
            ) : (
              /* Stop Generation Button */
              <button
                type="button"
                onClick={onStopGeneration}
                aria-label="Stop generating response"
                className="flex items-center gap-1.5 px-3.5 py-2 sm:py-1 sm:px-3 rounded-xl min-h-[44px] sm:min-h-[32px] bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-medium transition-all active:scale-95 cursor-pointer shadow-md shadow-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500/80 focus-visible:outline-none"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop generating</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Screen Reader & Accessibility Note */}
      <div className="mt-2 text-center text-[11px] text-neutral-500 dark:text-neutral-500 light:text-neutral-400">
        NOVA AI &bull; Gemini 2.5 Flash Multimodal &bull; Speech & Knowledge Base Engine
      </div>
    </div>
  );
}

export default ChatComposer;

