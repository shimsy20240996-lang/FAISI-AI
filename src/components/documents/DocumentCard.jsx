import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Eye,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Database,
  RefreshCw,
  Folder,
  Tag,
  MoreVertical,
  Check,
  Plus,
  X,
  Layers,
} from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DocumentCard({
  document,
  collections = [],
  onPreview,
  onAnalyze,
  onDelete,
  onIndex,
  isIndexing = false,
  onFilterByCollection,
  onFilterByTag,
  onAssignCollection,
  onUpdateTags,
}) {
  const {
    id,
    originalName,
    extension,
    size,
    status,
    indexingStatus = 'unindexed',
    chunkCount = 0,
    extractedTextLength,
    collectionId,
    tags = [],
    createdAt,
  } = document;

  const [isOrganizeOpen, setIsOrganizeOpen] = useState(false);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState('');
  const [isTagsOverflowOpen, setIsTagsOverflowOpen] = useState(false);

  const organizeRef = useRef(null);
  const tagEditorRef = useRef(null);
  const tagInputRef = useRef(null);

  // Find assigned collection object
  const currentCollection = collections.find(
    (c) => (c.id || c._id?.toString()) === (collectionId?.toString() || collectionId)
  );

  // Click outside to close organize popover
  useEffect(() => {
    if (!isOrganizeOpen) return;
    const handleClickOutside = (e) => {
      if (organizeRef.current && !organizeRef.current.contains(e.target)) {
        setIsOrganizeOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOrganizeOpen]);

  // Click outside to close tag editor popover
  useEffect(() => {
    if (!isTagEditorOpen) return;
    const handleClickOutside = (e) => {
      if (tagEditorRef.current && !tagEditorRef.current.contains(e.target)) {
        setIsTagEditorOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isTagEditorOpen]);

  const getFormatBadge = (ext) => {
    switch (ext) {
      case 'pdf':
        return {
          icon: <FileText className="w-5 h-5 text-red-400" />,
          bg: 'bg-red-500/10 text-red-400 border-red-500/20',
          label: 'PDF',
        };
      case 'docx':
        return {
          icon: <FileText className="w-5 h-5 text-blue-400" />,
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          label: 'DOCX',
        };
      case 'csv':
        return {
          icon: <FileSpreadsheet className="w-5 h-5 text-emerald-400" />,
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          label: 'CSV',
        };
      case 'txt':
      default:
        return {
          icon: <FileText className="w-5 h-5 text-slate-300" />,
          bg: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
          label: 'TXT',
        };
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'ready':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Ready
          </span>
        );
      case 'processing':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 animate-pulse">
            <Clock className="w-3 h-3 animate-spin" /> Processing
          </span>
        );
      case 'failed':
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        );
    }
  };

  const getIndexingBadge = () => {
    if (indexingStatus === 'pending') {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-medium text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/30 animate-pulse"
          title="Preparing document chunks and embeddings for Knowledge Base"
        >
          <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400" /> Preparing Knowledge Base...
        </span>
      );
    }
    if (isIndexing || indexingStatus === 'processing' || indexingStatus === 'indexing') {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-medium text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/30 animate-pulse"
          title="Generating Gemini embeddings and storing vector chunks"
        >
          <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400" /> Indexing...
        </span>
      );
    }
    if (indexingStatus === 'indexed') {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-medium text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30"
          title={`✓ Ready for Knowledge Base (${chunkCount || 0} semantic vector chunks)`}
        >
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
          <span className="hidden sm:inline">✓ Ready for Knowledge Base</span>
          <span className="sm:hidden">✓ Ready</span>
          {chunkCount > 0 && <span className="text-[9px] opacity-75">({chunkCount})</span>}
        </span>
      );
    }
    if (indexingStatus === 'failed') {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20"
          title={document.indexingError || 'Indexing failed. Click Retry to re-index.'}
        >
          <AlertCircle className="w-2.5 h-2.5" /> Indexing failed
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
        <Database className="w-2.5 h-2.5 text-slate-400" /> Not Indexed
      </span>
    );
  };

  const getIntelligenceBadge = () => {
    if (document.intelligence?.status === 'ready' && document.intelligence?.summary) {
      return (
        <span
          className="flex items-center gap-1 text-[10px] font-medium text-cyan-300 bg-cyan-500/15 px-2 py-0.5 rounded-md border border-cyan-500/30"
          title="Persistent AI Document Intelligence is ready"
        >
          <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
          <span>Intelligence</span>
        </span>
      );
    }
    return null;
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) return;

    if (tags.length >= 10) {
      setTagError('Max 10 tags allowed per document.');
      return;
    }

    if (trimmed.length > 30) {
      setTagError('Tag cannot exceed 30 characters.');
      return;
    }

    if (!/^[a-z0-9_-]+$/.test(trimmed)) {
      setTagError('Use letters, numbers, hyphens, or underscores only.');
      return;
    }

    if (tags.includes(trimmed)) {
      setTagError('Tag already exists on this document.');
      return;
    }

    const updatedTags = [...tags, trimmed];
    setTagError('');
    setTagInput('');
    if (onUpdateTags) {
      onUpdateTags(document, updatedTags);
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    const updatedTags = tags.filter((t) => t !== tagToRemove);
    if (onUpdateTags) {
      onUpdateTags(document, updatedTags);
    }
  };

  const badge = getFormatBadge(extension);

  return (
    <div className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all duration-200 shadow-lg shadow-black/20 text-neutral-100">
      <div>
        {/* Top bar: Format badge & status badges */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl border ${badge.bg}`}>{badge.icon}</div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${badge.bg}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {getIntelligenceBadge()}
            {getIndexingBadge()}
            {getStatusBadge(status)}
          </div>
        </div>

        {/* Collection Badge & Tag bar */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {currentCollection ? (
            <button
              type="button"
              onClick={() => onFilterByCollection && onFilterByCollection(currentCollection.id)}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer hover:opacity-90 max-w-[180px] truncate"
              style={{
                backgroundColor: `${currentCollection.color}15`,
                borderColor: `${currentCollection.color}40`,
                color: currentCollection.color,
              }}
              title={`Filtered to collection: ${currentCollection.name}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: currentCollection.color }} />
              <span className="truncate">{currentCollection.name}</span>
            </button>
          ) : (
            <span className="text-[10px] text-white/30 font-medium px-1.5 py-0.5 rounded bg-white/[0.02] border border-white/5">
              Uncategorized
            </span>
          )}

          {/* Tags preview */}
          {tags.slice(0, 3).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onFilterByTag && onFilterByTag(t)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/90 border border-white/10 transition-colors cursor-pointer"
              title={`Filter by tag: #${t}`}
            >
              <Tag className="w-2.5 h-2.5 text-white/40" />
              <span>{t}</span>
            </button>
          ))}

          {tags.length > 3 && (
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setIsTagsOverflowOpen(!isTagsOverflowOpen)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold px-1 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 cursor-pointer"
              >
                +{tags.length - 3}
              </button>
              {isTagsOverflowOpen && (
                <div className="absolute left-0 bottom-full mb-1 z-30 w-44 p-2 bg-neutral-900 border border-white/10 rounded-xl shadow-xl space-y-1">
                  <div className="text-[10px] font-semibold text-white/40 pb-1 border-b border-white/5">
                    All Tags ({tags.length})
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setIsTagsOverflowOpen(false);
                          if (onFilterByTag) onFilterByTag(t);
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/70 hover:text-white border border-white/10 cursor-pointer"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* File name & metadata */}
        <h3
          className="text-sm font-medium text-white/90 truncate group-hover:text-cyan-300 transition-colors"
          title={originalName}
        >
          {originalName}
        </h3>

        <div className="flex items-center gap-3 text-xs text-white/40 mt-1.5">
          <span>{formatBytes(size)}</span>
          <span>•</span>
          <span>{formatDate(createdAt)}</span>
          {extractedTextLength > 0 && (
            <>
              <span>•</span>
              <span title="Extracted character count">{(extractedTextLength / 1000).toFixed(1)}k chars</span>
            </>
          )}
        </div>
      </div>

      {/* Action buttons toolbar */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
        <button
          type="button"
          onClick={() => onAnalyze(document)}
          disabled={status !== 'ready'}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all min-h-[44px] sm:min-h-[36px] ${
            status === 'ready'
              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/30 hover:shadow-md hover:shadow-cyan-500/10 cursor-pointer'
              : 'bg-white/5 text-white/25 border border-white/5 cursor-not-allowed'
          }`}
          title="Analyze document with Gemini AI"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Analyze</span>
        </button>

        {onIndex && status === 'ready' && (
          <button
            type="button"
            onClick={() => onIndex(document)}
            disabled={
              isIndexing ||
              indexingStatus === 'pending' ||
              indexingStatus === 'processing' ||
              indexingStatus === 'indexing'
            }
            className={`flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium border transition-all min-h-[44px] sm:min-h-[36px] ${
              indexingStatus === 'failed'
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30 cursor-pointer'
                : indexingStatus === 'indexed'
                ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30 cursor-pointer'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30 cursor-pointer'
            }`}
            title={
              indexingStatus === 'failed'
                ? 'Retry indexing into Knowledge Base'
                : indexingStatus === 'indexed'
                ? 'Re-index vectors for RAG'
                : 'Index into Knowledge Base'
            }
          >
            {isIndexing ||
            indexingStatus === 'pending' ||
            indexingStatus === 'processing' ||
            indexingStatus === 'indexing' ? (
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            ) : indexingStatus === 'failed' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </>
            ) : indexingStatus === 'unindexed' ? (
              <>
                <Database className="w-3.5 h-3.5" />
                <span>Index</span>
              </>
            ) : (
              <Database className="w-4 h-4" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => onPreview(document)}
          className="flex items-center justify-center p-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all cursor-pointer min-h-[44px] sm:min-h-[36px]"
          title="Preview extracted content"
        >
          <Eye className="w-4 h-4" />
        </button>

        {/* Organize / Move Dropdown Menu */}
        <div className="relative" ref={organizeRef}>
          <button
            type="button"
            onClick={() => setIsOrganizeOpen(!isOrganizeOpen)}
            aria-label="Move or tag document"
            aria-expanded={isOrganizeOpen}
            className="flex items-center justify-center p-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all cursor-pointer min-h-[44px] sm:min-h-[36px]"
            title="Move to collection or manage tags"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isOrganizeOpen && (
            <div
              role="menu"
              className="absolute right-0 bottom-full mb-2 z-40 w-56 p-2 bg-neutral-900/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl space-y-1 animate-fadeIn text-xs"
            >
              <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-2 py-1 flex items-center gap-1.5">
                <Folder className="w-3 h-3 text-indigo-400" />
                <span>Move to Collection</span>
              </div>

              {/* Collections list */}
              <div className="max-h-40 overflow-y-auto space-y-0.5 pr-0.5">
                {collections.map((col) => {
                  const isAssigned =
                    (col.id || col._id?.toString()) === (collectionId?.toString() || collectionId);
                  return (
                    <button
                      key={col.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsOrganizeOpen(false);
                        if (onAssignCollection) onAssignCollection(document, col.id);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                        isAssigned
                          ? 'bg-indigo-600/20 text-indigo-300 font-semibold'
                          : 'hover:bg-white/5 text-white/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: col.color || '#6366f1' }}
                        />
                        <span className="truncate">{col.name}</span>
                      </div>
                      {isAssigned && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}

                {/* Remove from collection option */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOrganizeOpen(false);
                    if (onAssignCollection) onAssignCollection(document, null);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                    !collectionId
                      ? 'bg-white/10 text-white font-semibold'
                      : 'hover:bg-white/5 text-white/50 hover:text-white/80'
                  }`}
                >
                  <span>Uncategorized</span>
                  {!collectionId && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                </button>
              </div>

              <div className="border-t border-white/10 pt-1 mt-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOrganizeOpen(false);
                    setIsTagEditorOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-cyan-300 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Edit Tags ({tags.length})</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tag Editor Popover */}
        {isTagEditorOpen && (
          <div
            ref={tagEditorRef}
            className="absolute right-0 bottom-full mb-2 z-40 w-72 p-3.5 bg-neutral-900/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl space-y-2.5 animate-fadeIn text-xs"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>Document Tags</span>
              </div>
              <button
                type="button"
                onClick={() => setIsTagEditorOpen(false)}
                className="p-1 rounded text-white/40 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {tagError && (
              <div className="text-[11px] text-red-400 bg-red-500/10 p-1.5 rounded-lg border border-red-500/20">
                {tagError}
              </div>
            )}

            {/* Current Tags List */}
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-0.5">
              {tags.length === 0 ? (
                <span className="text-[11px] text-white/40 italic">No tags added yet.</span>
              ) : (
                tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/10 text-white text-[11px] border border-white/10"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      aria-label={`Remove tag ${t}`}
                      className="text-white/40 hover:text-red-400 cursor-pointer p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add Tag Form */}
            {tags.length < 10 && (
              <form onSubmit={handleAddTag} className="flex items-center gap-1.5 pt-1">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="new-tag (enter to add)"
                  maxLength={30}
                  className="flex-1 px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={!tagInput.trim()}
                  className="px-2.5 py-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onDelete(document)}
          className="flex items-center justify-center p-2 rounded-xl text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer min-h-[44px] sm:min-h-[36px]"
          title="Delete document"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
