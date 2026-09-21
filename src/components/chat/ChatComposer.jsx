import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Square,
  Paperclip,
  Mic,
  BookOpen,
  AlertCircle,
  Layers,
  ChevronDown,
  Check,
  X,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
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
 *   userDocuments?: Array<any>,
 *   selectedDocumentIds?: Array<string>,
 *   onSelectDocument?: (docId: string) => void,
 *   onSelectAllDocuments?: () => void,
 *   onClearDocumentSelection?: () => void,
 *   onRefreshDocuments?: () => void,
 *   collections?: Array<any>,
 *   selectedCollectionId?: string | null,
 *   onSelectCollection?: (collectionId: string | null) => void,
 *   onClearCollection?: () => void,
 *   onRefreshCollections?: () => void,
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
  userDocuments = [],
  selectedDocumentIds = [],
  onSelectDocument,
  onSelectAllDocuments,
  onClearDocumentSelection,
  onRefreshDocuments,
  collections = [],
  selectedCollectionId = null,
  onSelectCollection,
  onClearCollection,
  onRefreshCollections,
  onNotice,
  composerPrefill = '',
  onClearComposerPrefill,
}) {
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState('all'); // 'all' | 'collections' | 'documents'

  const textareaRef = useAutoResize(input, 160);
  const fileInputRef = useRef(null);
  const selectorRef = useRef(null);

  // Handle external prefill from "Ask FAISI" (Phase 3)
  useEffect(() => {
    if (composerPrefill && composerPrefill.trim()) {
      setInput(composerPrefill.trim());
      if (onClearComposerPrefill) {
        onClearComposerPrefill();
      }
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [composerPrefill, onClearComposerPrefill]);

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

  // Click outside and Escape key handling for Document Selector popover
  useEffect(() => {
    if (!isSelectorOpen) return;

    const handleClickOutside = (e) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target)) {
        setIsSelectorOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSelectorOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSelectorOpen]);

  const handleToggleSelector = () => {
    const next = !isSelectorOpen;
    setIsSelectorOpen(next);
    if (next) {
      if (typeof onRefreshDocuments === 'function') onRefreshDocuments();
      if (typeof onRefreshCollections === 'function') onRefreshCollections();
    }
  };

  const getDocIcon = (ext) => {
    switch (ext?.toLowerCase()) {
      case 'pdf':
        return <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      case 'docx':
        return <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'csv':
        return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'txt':
      default:
        return <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />;
    }
  };

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
                  : 'Draft your next prompt while FAISI responds...'
                : pendingImages.length > 0
                ? 'Ask about the attached image(s)...'
                : 'Ask FAISI anything...'
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

            {/* Smart Document Selector (Phase 5 Collections + Document Selection) */}
            {useKnowledgeBase && (
              <div className="relative" ref={selectorRef}>
                <button
                  type="button"
                  onClick={handleToggleSelector}
                  disabled={isGenerating || isRecording}
                  aria-haspopup="dialog"
                  aria-expanded={isSelectorOpen}
                  aria-label="Filter Knowledge Base documents or collections"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-medium transition-all cursor-pointer select-none min-h-[44px] sm:min-h-[32px] focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none ${
                    selectedCollectionId || selectedDocumentIds.length > 0
                      ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/60 shadow-sm shadow-indigo-500/10'
                      : 'bg-neutral-800/60 text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 border border-neutral-700/50'
                  }`}
                  title={
                    selectedCollectionId
                      ? `Knowledge Base scoped to collection: ${
                          collections.find((c) => (c.id || c._id?.toString()) === selectedCollectionId)?.name || 'Collection'
                        }`
                      : selectedDocumentIds.length > 0
                      ? `Knowledge Base filtered to ${selectedDocumentIds.length} document${selectedDocumentIds.length > 1 ? 's' : ''}`
                      : 'Searching all Knowledge Base documents'
                  }
                >
                  {selectedCollectionId ? (
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  ) : (
                    <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  )}
                  <span className="font-medium truncate max-w-[110px] sm:max-w-[140px]">
                    {selectedCollectionId
                      ? collections.find((c) => (c.id || c._id?.toString()) === selectedCollectionId)?.name || 'Collection'
                      : selectedDocumentIds.length === 0
                      ? 'All Documents'
                      : selectedDocumentIds.length === 1
                      ? '1 Selected'
                      : `${selectedDocumentIds.length} Selected`}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${
                      isSelectorOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Popover Dropdown */}
                {isSelectorOpen && (
                  <div
                    role="dialog"
                    aria-label="Filter Knowledge Base documents and collections"
                    className="absolute bottom-full mb-2 left-0 z-40 w-72 sm:w-84 max-h-[420px] bg-neutral-900/95 dark:bg-neutral-900/95 light:bg-neutral-50/95 backdrop-blur-md border border-neutral-800 dark:border-neutral-800 light:border-neutral-300 rounded-2xl shadow-2xl p-3 flex flex-col text-xs text-neutral-200"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200 mb-2">
                      <div className="flex items-center gap-1.5 font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Filter Knowledge Base</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSelectorOpen(false)}
                        aria-label="Close document filter"
                        className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 dark:hover:bg-neutral-800 light:hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 3 Scope Modes Switcher */}
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-neutral-950/60 dark:bg-neutral-950/60 light:bg-neutral-200/60 rounded-xl mb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectorTab('all');
                          if (onClearDocumentSelection) onClearDocumentSelection();
                          if (onClearCollection) onClearCollection();
                        }}
                        className={`py-1 px-1.5 text-center text-[11px] font-medium rounded-lg transition-all cursor-pointer truncate ${
                          selectorTab === 'all' && !selectedCollectionId && selectedDocumentIds.length === 0
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        All Docs
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectorTab('collections')}
                        className={`py-1 px-1.5 text-center text-[11px] font-medium rounded-lg transition-all cursor-pointer truncate ${
                          selectorTab === 'collections' || selectedCollectionId
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        Collections
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectorTab('documents')}
                        className={`py-1 px-1.5 text-center text-[11px] font-medium rounded-lg transition-all cursor-pointer truncate ${
                          selectorTab === 'documents' || (selectedDocumentIds.length > 0 && !selectedCollectionId)
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        Documents
                      </button>
                    </div>

                    {/* Content View Based on Tab */}
                    {selectorTab === 'all' || (selectorTab !== 'collections' && selectorTab !== 'documents') ? (
                      /* All Documents Overview Row */
                      <div className="space-y-2 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onClearDocumentSelection) onClearDocumentSelection();
                            if (onClearCollection) onClearCollection();
                            setIsSelectorOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer select-none ${
                            !selectedCollectionId && selectedDocumentIds.length === 0
                              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                              : 'hover:bg-neutral-800/60 dark:hover:bg-neutral-800/60 light:hover:bg-neutral-100 text-neutral-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                !selectedCollectionId && selectedDocumentIds.length === 0
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'border-neutral-600 dark:border-neutral-600 light:border-neutral-400 bg-transparent'
                              }`}
                            >
                              {!selectedCollectionId && selectedDocumentIds.length === 0 && (
                                <Check className="w-3 h-3 stroke-[3]" />
                              )}
                            </div>
                            <div>
                              <span className="font-semibold text-xs block">Search Entire Knowledge Base</span>
                              <span className="text-[10px] text-neutral-400">
                                Query all ready indexed documents globally
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-neutral-500 font-mono shrink-0 ml-2">
                            {userDocuments.filter((d) => d.indexingStatus === 'indexed').length} ready
                          </span>
                        </button>
                      </div>
                    ) : selectorTab === 'collections' ? (
                      /* Collections Mode View */
                      <div className="flex-1 overflow-y-auto space-y-1 max-h-[220px] pr-0.5 scrollbar-thin scrollbar-thumb-neutral-800">
                        {collections.length === 0 ? (
                          <div className="text-center py-5 px-2 text-neutral-500">
                            <p className="text-xs mb-2">No collections created yet.</p>
                            {onOpenDocuments && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsSelectorOpen(false);
                                  onOpenDocuments();
                                }}
                                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 cursor-pointer"
                              >
                                <FolderOpen className="w-3 h-3" />
                                <span>Create Collection in Hub</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          collections.map((col) => {
                            const colId = col.id || col._id?.toString();
                            const isSelected = selectedCollectionId === colId;

                            return (
                              <button
                                key={colId}
                                type="button"
                                onClick={() => {
                                  if (onSelectCollection) {
                                    onSelectCollection(isSelected ? null : colId);
                                  }
                                }}
                                className={`w-full flex items-center justify-between p-2 rounded-xl transition-all select-none text-left cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-950/50 border border-indigo-500/40 text-white shadow-sm'
                                    : 'hover:bg-neutral-800/50 dark:hover:bg-neutral-800/50 light:hover:bg-neutral-100 text-neutral-300 border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                  <div
                                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                                      isSelected
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'border-neutral-600 dark:border-neutral-600 light:border-neutral-400 bg-transparent'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                    style={{ backgroundColor: col.color || '#6366f1' }}
                                  />
                                  <span className="font-medium text-xs truncate max-w-[140px]" title={col.name}>
                                    {col.name}
                                  </span>
                                </div>
                                <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                                  {col.documentCount || 0} docs
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      /* Individual Documents List View */
                      <div className="flex-1 overflow-y-auto space-y-1 max-h-[220px] pr-0.5 scrollbar-thin scrollbar-thumb-neutral-800">
                        {userDocuments.length === 0 ? (
                          <div className="text-center py-5 px-2 text-neutral-500">
                            <p className="text-xs mb-2">No documents uploaded yet.</p>
                            {onOpenDocuments && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsSelectorOpen(false);
                                  onOpenDocuments();
                                }}
                                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 cursor-pointer"
                              >
                                <FolderOpen className="w-3 h-3" />
                                <span>Open Document Hub</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          userDocuments.map((doc) => {
                            const docId = doc.id || doc._id?.toString();
                            const isIndexed = doc.indexingStatus === 'indexed';
                            const isSelected = selectedDocumentIds.includes(docId);
                            const isProcessing =
                              doc.indexingStatus === 'pending' ||
                              doc.indexingStatus === 'processing' ||
                              doc.status === 'processing';
                            const isFailed = doc.indexingStatus === 'failed';

                            return (
                              <div
                                key={docId}
                                onClick={() => {
                                  if (isIndexed && onSelectDocument) {
                                    onSelectDocument(docId);
                                  }
                                }}
                                role="checkbox"
                                aria-checked={isSelected}
                                aria-disabled={!isIndexed}
                                tabIndex={isIndexed ? 0 : -1}
                                onKeyDown={(e) => {
                                  if (isIndexed && (e.key === ' ' || e.key === 'Enter')) {
                                    e.preventDefault();
                                    if (onSelectDocument) onSelectDocument(docId);
                                  }
                                }}
                                className={`flex items-center justify-between p-2 rounded-xl transition-all select-none ${
                                  isIndexed
                                    ? isSelected
                                      ? 'bg-indigo-950/40 border border-indigo-500/30 text-neutral-200 cursor-pointer'
                                      : 'hover:bg-neutral-800/50 dark:hover:bg-neutral-800/50 light:hover:bg-neutral-100 text-neutral-300 border border-transparent cursor-pointer'
                                    : 'opacity-50 cursor-not-allowed border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                  <div
                                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                                      isSelected && isIndexed
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'border-neutral-600 dark:border-neutral-600 light:border-neutral-400 bg-transparent'
                                    }`}
                                  >
                                    {isSelected && isIndexed && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  {getDocIcon(doc.extension)}
                                  <span
                                    className="font-medium text-xs truncate max-w-[130px] sm:max-w-[150px]"
                                    title={doc.originalName}
                                  >
                                    {doc.originalName}
                                  </span>
                                </div>

                                {/* Status Badge */}
                                <div className="shrink-0">
                                  {isIndexed ? (
                                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                      <CheckCircle2 className="w-2.5 h-2.5" />
                                      <span>Ready</span>
                                      {doc.chunkCount > 0 && <span className="opacity-75">({doc.chunkCount})</span>}
                                    </span>
                                  ) : isProcessing ? (
                                    <span className="text-[10px] text-cyan-400 font-medium flex items-center gap-1 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 animate-pulse">
                                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                      <span>Indexing</span>
                                    </span>
                                  ) : isFailed ? (
                                    <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                      <AlertCircle className="w-2.5 h-2.5" />
                                      <span>Failed</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-neutral-500 font-medium px-1.5 py-0.5 rounded border border-neutral-800">
                                      Unindexed
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Actions Footer */}
                    {selectorTab === 'documents' && userDocuments.length > 0 && (
                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectAllDocuments) onSelectAllDocuments();
                          }}
                          disabled={userDocuments.filter((d) => d.indexingStatus === 'indexed').length === 0}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Select All ({userDocuments.filter((d) => d.indexingStatus === 'indexed').length})
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (onClearDocumentSelection) onClearDocumentSelection();
                          }}
                          disabled={selectedDocumentIds.length === 0}
                          className="text-[11px] text-neutral-400 hover:text-neutral-200 hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Clear Selection
                        </button>
                      </div>
                    )}

                    {selectorTab === 'collections' && (
                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
                        {onOpenDocuments && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsSelectorOpen(false);
                              onOpenDocuments();
                            }}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium hover:underline cursor-pointer"
                          >
                            + Manage Collections
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (onClearCollection) onClearCollection();
                          }}
                          disabled={!selectedCollectionId}
                          className="text-[11px] text-neutral-400 hover:text-neutral-200 hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                        >
                          Clear Collection
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Persistent Compact Collection Badge (Phase 5) */}
            {useKnowledgeBase && selectedCollectionId && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-xs text-indigo-200 animate-fadeIn"
                role="status"
                aria-label={`Current Collection: ${
                  collections.find((c) => (c.id || c._id?.toString()) === selectedCollectionId)?.name || 'Collection'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                  style={{
                    backgroundColor:
                      collections.find((c) => (c.id || c._id?.toString()) === selectedCollectionId)?.color || '#6366f1',
                  }}
                />
                <span className="font-medium text-[11px] truncate max-w-[140px] sm:max-w-[180px]">
                  Collection:{' '}
                  {collections.find((c) => (c.id || c._id?.toString()) === selectedCollectionId)?.name || 'Collection'} &bull;{' '}
                  {collections.find((c) => (c.id || c._id?.toString()) === selectedCollectionId)?.documentCount || 0} docs
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (onClearCollection) onClearCollection();
                  }}
                  aria-label="Clear collection filter"
                  className="p-0.5 hover:bg-indigo-900/80 rounded text-indigo-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
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
        FAISI AI &bull; Your AI. Your Way.
      </div>
    </div>
  );
}

export default ChatComposer;

