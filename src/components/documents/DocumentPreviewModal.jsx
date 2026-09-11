import React, { useState, useEffect } from 'react';
import { X, Copy, Check, FileText, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react';
import { apiGetDocumentContent } from '../../services/api';

export default function DocumentPreviewModal({ document, isOpen, onClose }) {
  const [content, setContent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'table'

  useEffect(() => {
    if (!isOpen || !document) return;

    let isMounted = true;
    setIsLoading(true);
    setError('');
    setContent(null);

    apiGetDocumentContent(document.id)
      .then((data) => {
        if (isMounted) {
          setContent(data);
          if (data.extension === 'csv' && data.csvMetadata?.headers?.length > 0) {
            setActiveTab('table');
          } else {
            setActiveTab('text');
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

  const handleCopy = () => {
    if (!content?.extractedText) return;
    navigator.clipboard.writeText(content.extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCsv = document.extension === 'csv';
  const csvMeta = content?.csvMetadata;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-neutral-900 border border-white/15 shadow-2xl shadow-black/80 overflow-hidden"
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
            {content?.extractedText && (
              <button
                type="button"
                onClick={handleCopy}
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

        {/* CSV Tabs */}
        {isCsv && csvMeta?.headers?.length > 0 && (
          <div className="flex items-center gap-2 px-5 pt-3 border-b border-white/5 bg-white/[0.01]">
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
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`pb-2.5 px-2 text-xs font-medium border-b-2 transition-all ${
                activeTab === 'text'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              Raw Extracted Summary
            </button>
          </div>
        )}

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
