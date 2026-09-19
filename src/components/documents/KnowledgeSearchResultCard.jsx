import React from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  File,
  Sparkles,
  ArrowRight,
  BookOpen,
  Layers,
} from 'lucide-react';

/**
 * Returns an appropriate icon based on the document extension or filename.
 */
function getDocumentIcon(docName = '') {
  const ext = docName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf':
      return <FileText className="w-4 h-4 text-red-400" />;
    case 'docx':
    case 'doc':
      return <FileText className="w-4 h-4 text-blue-400" />;
    case 'csv':
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    case 'json':
    case 'js':
    case 'ts':
      return <FileCode className="w-4 h-4 text-amber-400" />;
    case 'txt':
    case 'md':
      return <FileText className="w-4 h-4 text-cyan-400" />;
    default:
      return <File className="w-4 h-4 text-purple-400" />;
  }
}

/**
 * KnowledgeSearchResultCard Component
 * Displays an individual matching text passage with similarity score and Ask FAISI action.
 *
 * @param {{
 *   source: {
 *     sourceIndex?: number,
 *     documentId: string,
 *     documentName: string,
 *     pageNumber: number | null,
 *     sectionTitle: string | null,
 *     snippet: string,
 *     score: number,
 *     chunkId?: string
 *   },
 *   onAskFaisi: (source: Object) => void
 * }} props
 */
export default function KnowledgeSearchResultCard({ source, onAskFaisi }) {
  if (!source) return null;

  const matchPercent = Math.min(Math.max(Math.round((source.score || 0) * 100), 0), 100);

  // Dynamic relevance badge styling based on similarity score
  let badgeColor = 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
  let badgeGlow = 'from-cyan-500/10 to-blue-500/10';

  if (matchPercent >= 85) {
    badgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    badgeGlow = 'from-emerald-500/10 to-cyan-500/10';
  } else if (matchPercent < 70) {
    badgeColor = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    badgeGlow = 'from-indigo-500/10 to-purple-500/10';
  }

  const handleAsk = (e) => {
    e.stopPropagation();
    if (onAskFaisi) {
      onAskFaisi(source);
    }
  };

  return (
    <article
      className="group relative flex flex-col justify-between p-4 md:p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-cyan-500/30 transition-all duration-200 shadow-lg shadow-black/20 hover:shadow-cyan-950/20"
      aria-labelledby={`search-result-${source.chunkId || source.sourceIndex || Math.random().toString(36).substring(7)}`}
    >
      {/* Background subtle gradient glow on hover */}
      <div
        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${badgeGlow} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`}
      />

      <div className="relative z-10 flex flex-col gap-3">
        {/* Card Header: Document Info & Match Score Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 shrink-0 flex items-center justify-center">
              {getDocumentIcon(source.documentName)}
            </div>
            <div className="min-w-0 flex-1">
              <h4
                id={`search-result-${source.chunkId || source.sourceIndex || 'doc'}`}
                className="text-xs md:text-sm font-semibold text-white truncate group-hover:text-cyan-200 transition-colors"
                title={source.documentName}
              >
                {source.documentName || 'Document'}
              </h4>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {source.pageNumber != null && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10">
                    Page {source.pageNumber}
                  </span>
                )}
                {source.sectionTitle && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10 truncate max-w-[160px]" title={source.sectionTitle}>
                    {source.sectionTitle}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Relevance Badge */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 ${badgeColor}`}
            title={`Similarity score: ${source.score}`}
          >
            <Sparkles className="w-3 h-3" />
            <span>{matchPercent}% match</span>
          </div>
        </div>

        {/* Card Body: Relevant Text Passage / Snippet */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-white/80 leading-relaxed font-normal select-text">
          <p className="line-clamp-4 italic text-white/85">
            "{source.snippet || 'No excerpt available.'}"
          </p>
        </div>
      </div>

      {/* Card Footer: Action Bar */}
      <div className="relative z-10 flex items-center justify-end gap-2 pt-3 mt-1 border-t border-white/5">
        <button
          type="button"
          onClick={handleAsk}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:via-blue-500/30 hover:to-indigo-500/30 text-cyan-200 hover:text-white border border-cyan-500/30 hover:border-cyan-400/50 transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none group/btn shadow-sm"
          title={`Ask FAISI about this passage in ${source.documentName}`}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 group-hover/btn:text-cyan-300 transition-colors" />
          <span>Ask FAISI</span>
          <ArrowRight className="w-3.5 h-3.5 text-cyan-400 group-hover/btn:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </article>
  );
}
