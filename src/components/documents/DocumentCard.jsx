import React from 'react';
import {
  FileText,
  Sparkles,
  Eye,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Table,
  FileSpreadsheet,
  Database,
  RefreshCw,
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
  onPreview,
  onAnalyze,
  onDelete,
  onIndex,
  isIndexing = false,
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
    createdAt,
  } = document;

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
    if (isIndexing || indexingStatus === 'indexing') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/30 animate-pulse">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Indexing...
        </span>
      );
    }
    if (indexingStatus === 'indexed') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-md border border-indigo-500/30" title={`${chunkCount} semantic vector chunks`}>
          <Layers className="w-2.5 h-2.5 text-indigo-400" /> {chunkCount} Chunks
        </span>
      );
    }
    if (indexingStatus === 'failed') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
          <AlertCircle className="w-2.5 h-2.5" /> Unindexed
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
        <Database className="w-2.5 h-2.5 text-slate-400" /> Not Indexed
      </span>
    );
  };

  const badge = getFormatBadge(extension);

  return (
    <div className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all duration-200 shadow-lg shadow-black/20">
      <div>
        {/* Top bar: Format badge & status */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl border ${badge.bg}`}>
              {badge.icon}
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${badge.bg}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {getIndexingBadge()}
            {getStatusBadge(status)}
          </div>
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
              <span title="Extracted character count">
                {(extractedTextLength / 1000).toFixed(1)}k chars
              </span>
            </>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
        <button
          type="button"
          onClick={() => onAnalyze(document)}
          disabled={status !== 'ready'}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
            status === 'ready'
              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/30 hover:shadow-md hover:shadow-cyan-500/10'
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
            disabled={isIndexing || indexingStatus === 'indexing'}
            className={`flex items-center justify-center p-2 rounded-xl text-xs font-medium border transition-all ${
              indexingStatus === 'indexed'
                ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            }`}
            title={indexingStatus === 'indexed' ? 'Re-index vectors for RAG' : 'Index vectors for RAG'}
          >
            {isIndexing || indexingStatus === 'indexing' ? (
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            ) : (
              <Database className="w-4 h-4" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => onPreview(document)}
          className="flex items-center justify-center p-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all"
          title="Preview extracted content"
        >
          <Eye className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => onDelete(document)}
          className="flex items-center justify-center p-2 rounded-xl text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
          title="Delete document"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
