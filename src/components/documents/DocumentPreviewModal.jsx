import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  FileText,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  Tag,
  CheckCircle2,
  Calendar,
  Cpu,
} from 'lucide-react';
import {
  apiGetDocumentContent,
  apiGetDocumentIntelligence,
  apiGenerateDocumentIntelligence,
} from '../../services/api';

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DocumentPreviewModal({ document, isOpen, onClose }) {
  const [content, setContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [activeTab, setActiveTab] = useState('intelligence'); // 'intelligence' | 'text' | 'table'

  // Intelligence State (Phase 4B)
  const [intelligence, setIntelligence] = useState(null);
  const [isIntelligenceLoading, setIsIntelligenceLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState('');

  useEffect(() => {
    if (!isOpen || !document) return;

    let isMounted = true;
    setIsLoading(true);
    setError('');
    setContent(null);
    setIntelligence(document.intelligence || null);
    setIntelligenceError('');

    // Fetch both extracted content and persistent intelligence concurrently
    Promise.all([
      apiGetDocumentContent(document.id),
      apiGetDocumentIntelligence(document.id).catch(() => null),
    ])
      .then(([contentData, intelData]) => {
        if (isMounted) {
          setContent(contentData);
          if (intelData && intelData.intelligence) {
            setIntelligence(intelData.intelligence);
          }

          if (intelData?.intelligence?.status === 'ready') {
            setActiveTab('intelligence');
          } else if (contentData.extension === 'csv' && contentData.csvMetadata?.headers?.length > 0) {
            setActiveTab('table');
          } else {
            setActiveTab('intelligence');
          }
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load document content');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const handleCopyText = () => {
    if (!content?.extractedText) return;
    navigator.clipboard.writeText(content.extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySummary = () => {
    if (!intelligence?.summary) return;
    const fullText = `Executive Summary:\n${intelligence.summary}\n\nKey Topics:\n${(intelligence.keyTopics || []).map((t) => `- ${t}`).join('\n')}\n\nKey Facts:\n${(intelligence.keyFacts || []).map((f) => `- ${f}`).join('\n')}`;
    navigator.clipboard.writeText(fullText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleGenerateIntelligence = async (force = false) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setIntelligenceError('');

    try {
      const response = await apiGenerateDocumentIntelligence(document.id, { force });
      if (response && response.intelligence) {
        setIntelligence(response.intelligence);
      }
    } catch (err) {
      setIntelligenceError(err.message || 'Failed to generate document intelligence. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const isCsv = document.extension === 'csv';
  const csvMeta = content?.csvMetadata;
  const hasReadyIntelligence = intelligence?.status === 'ready' && Boolean(intelligence?.summary);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-neutral-900 border border-white/15 shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              {isCsv ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate" title={document.originalName}>
                {document.originalName}
              </h3>
              <p className="text-xs text-white/50 flex items-center gap-2 mt-0.5">
                <span className="uppercase font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                  {document.extension}
                </span>
                <span>•</span>
                <span>{(document.size / 1024).toFixed(1)} KB</span>
                {content?.pageCount && (
                  <>
                    <span>•</span>
                    <span>{content.pageCount} pages</span>
                  </>
                )}
                {content?.extractedTextLength > 0 && (
                  <>
                    <span>•</span>
                    <span>{content.extractedTextLength.toLocaleString()} extracted chars</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'intelligence' && hasReadyIntelligence && (
              <button
                type="button"
                onClick={handleCopySummary}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-all"
                title="Copy intelligence summary to clipboard"
              >
                {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSummary ? 'Copied' : 'Copy Intelligence'}</span>
              </button>
            )}
            {activeTab === 'text' && content?.extractedText && (
              <button
                type="button"
                onClick={handleCopyText}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-all"
                title="Copy extracted text to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-white/5 bg-white/[0.01]">
          <button
            type="button"
            onClick={() => setActiveTab('intelligence')}
            className={`flex items-center gap-1.5 pb-2.5 px-2 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'intelligence'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Document Intelligence</span>
            {hasReadyIntelligence && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            )}
          </button>

          {isCsv && csvMeta?.headers?.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`pb-2.5 px-2 text-xs font-medium border-b-2 transition-all ${
                activeTab === 'table'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              Table Preview ({csvMeta.rowCount} rows, {csvMeta.columnCount} cols)
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`pb-2.5 px-2 text-xs font-medium border-b-2 transition-all ${
              activeTab === 'text'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            Raw Extracted Text
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-5 text-sm">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/50 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
              <p className="text-xs">Loading extracted document content...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          ) : activeTab === 'intelligence' ? (
            /* Intelligence Tab Content (Phase 4B) */
            <div className="space-y-5">
              {intelligenceError && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{intelligenceError}</span>
                </div>
              )}

              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/60 gap-3">
                  <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 animate-pulse">
                    <Sparkles className="w-8 h-8 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-white">Analyzing Document with Gemini AI...</p>
                    <p className="text-[11px] text-white/40 mt-1">Generating Executive Summary, Key Topics, and Key Facts</p>
                  </div>
                </div>
              ) : hasReadyIntelligence ? (
                <div className="space-y-4">
                  {/* Executive Summary Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Executive Summary</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleGenerateIntelligence(true)}
                        disabled={isGenerating}
                        className="flex items-center gap-1 text-[11px] font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 rounded-lg border border-cyan-500/30 transition-all"
                        title="Re-analyze document and update persisted intelligence"
                      >
                        <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                        <span>Regenerate</span>
                      </button>
                    </div>
                    <div className="rounded-xl bg-black/40 border border-white/10 p-4 text-xs text-white/90 whitespace-pre-wrap leading-relaxed select-text font-sans">
                      {intelligence.summary}
                    </div>
                  </div>

                  {/* Key Topics Section */}
                  {Array.isArray(intelligence.keyTopics) && intelligence.keyTopics.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Key Topics & Themes</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {intelligence.keyTopics.map((topic, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 shadow-sm"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Facts Section */}
                  {Array.isArray(intelligence.keyFacts) && intelligence.keyFacts.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Key Facts & Conclusions</span>
                      </label>
                      <div className="rounded-xl bg-black/40 border border-white/10 p-3.5 space-y-2">
                        {intelligence.keyFacts.map((fact, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs text-white/80 select-text">
                            <span className="text-emerald-400 font-bold shrink-0 mt-0.5">•</span>
                            <span className="leading-relaxed">{fact}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata Footer */}
                  <div className="flex items-center justify-between pt-2 text-[11px] text-white/40 border-t border-white/5">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-cyan-400" />
                      Model: <strong className="text-white/70 font-medium">{intelligence.model || 'Gemini 3.6 Flash'}</strong>
                    </span>
                    {intelligence.generatedAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Generated: {formatDate(intelligence.generatedAt)}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* Unanalyzed / Idle State */
                <div className="flex flex-col items-center justify-center py-14 px-4 text-center rounded-2xl bg-white/[0.02] border border-white/10 border-dashed space-y-4">
                  <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <h4 className="text-sm font-semibold text-white">No Intelligence Generated Yet</h4>
                    <p className="text-xs text-white/50 leading-relaxed">
                      Generate persistent AI insights for this document including an Executive Summary, Key Topics, and Key Facts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateIntelligence(false)}
                    disabled={isGenerating || document.status !== 'ready'}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Document Intelligence</span>
                  </button>
                </div>
              )}
            </div>
          ) : isCsv && activeTab === 'table' && csvMeta?.headers?.length > 0 ? (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10 text-white/80 font-semibold">
                      <th className="p-2.5 text-white/40 border-r border-white/5 w-10 text-center">#</th>
                      {csvMeta.headers.map((h, i) => (
                        <th key={i} className="p-2.5 border-r border-white/5 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/70 font-mono">
                    {csvMeta.previewRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-white/[0.02]">
                        <td className="p-2.5 text-white/30 border-r border-white/5 text-center">{rIdx + 1}</td>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-2.5 border-r border-white/5 whitespace-nowrap">
                            {cell || <span className="text-white/20 italic">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-white/40 text-center">
                Showing top {csvMeta.previewRows.length} preview rows of {csvMeta.rowCount} total records.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-black/40 border border-white/10 p-4 font-mono text-xs text-white/80 whitespace-pre-wrap break-words leading-relaxed max-h-[50vh] overflow-y-auto select-text">
              {content?.extractedText || 'No text extracted from this document.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

