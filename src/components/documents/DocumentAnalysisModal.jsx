import React, { useState, useEffect } from 'react';
import { Sparkles, X, Copy, Check, Send, AlertCircle, Loader2, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';
import { apiAnalyzeDocument } from '../../services/api';

const PROMPT_PRESETS = [
  {
    label: '📋 Comprehensive Summary',
    instruction: 'Please provide a clear, comprehensive summary of this document, covering the main themes, key conclusions, and practical takeaways.',
  },
  {
    label: '🔑 Key Points & Action Items',
    instruction: 'Extract the essential key points, critical numbers/data, and concrete action items from this document as structured bullet points.',
  },
  {
    label: '💡 Explain in Simple Terms',
    instruction: 'Explain the core concepts and findings of this document in clear, simple terms suitable for someone without domain background.',
  },
  {
    label: '📊 Data & Pattern Analysis',
    instruction: 'Analyze the underlying data, trends, structure, and potential anomalies present in this document.',
  },
];

export default function DocumentAnalysisModal({ document, isOpen, onClose }) {
  const [instruction, setInstruction] = useState(PROMPT_PRESETS[0].instruction);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !document) return;
    setInstruction(PROMPT_PRESETS[0].instruction);
    setError('');
    setCopied(false);
    if (document.intelligence?.status === 'ready' && document.intelligence?.summary) {
      setAnalysisResult({
        role: 'assistant',
        content: document.intelligence.summary,
        model: document.intelligence.model || 'gemini-3.6-flash',
        isCached: true,
      });
    } else {
      setAnalysisResult(null);
    }
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const maxChars = 1000;
  const remainingChars = maxChars - instruction.length;

  const handleSelectPreset = (presetInstruction) => {
    setInstruction(presetInstruction);
    if (
      presetInstruction === PROMPT_PRESETS[0].instruction &&
      document.intelligence?.status === 'ready' &&
      document.intelligence?.summary
    ) {
      setAnalysisResult({
        role: 'assistant',
        content: document.intelligence.summary,
        model: document.intelligence.model || 'gemini-3.6-flash',
        isCached: true,
      });
    }
  };

  const handleRunAnalysis = async () => {
    if (!instruction.trim() || isAnalyzing) return;

    setError('');
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const response = await apiAnalyzeDocument(document.id, instruction.trim());
      setAnalysisResult(response.analysis);
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopy = () => {
    if (!analysisResult?.content) return;
    navigator.clipboard.writeText(analysisResult.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-neutral-900 border border-white/15 shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white truncate">
                  AI Document Analysis
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Gemini 3.6 Flash
                </span>
              </div>
              <p className="text-xs text-white/50 truncate mt-0.5" title={document.originalName}>
                Target: <span className="text-white/80 font-medium">{document.originalName}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-medium text-white/70 mb-2">
              Select Quick Analysis Preset:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROMPT_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(preset.instruction)}
                  disabled={isAnalyzing}
                  className={`p-2.5 text-left rounded-xl text-xs transition-all border ${
                    instruction === preset.instruction
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 font-medium shadow-sm shadow-cyan-500/10'
                      : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/10 text-white/70 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Instruction Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-white/70">
                Custom Instruction / Prompt:
              </label>
              <span className={`text-[11px] font-mono ${remainingChars < 50 ? 'text-amber-400' : 'text-white/40'}`}>
                {instruction.length}/{maxChars}
              </span>
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value.slice(0, maxChars))}
              placeholder="e.g. What are the key risk factors mentioned in section 3?"
              rows={3}
              disabled={isAnalyzing}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400 transition-colors resize-none"
            />
          </div>

          {/* Action button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || !instruction.trim()}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isAnalyzing || !instruction.trim()
                  ? 'bg-white/10 text-white/40 cursor-not-allowed border border-white/5'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 font-semibold'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Document with Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Run AI Analysis</span>
                </>
              )}
            </button>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Analysis Output Result */}
          {analysisResult && (
            <div className="space-y-3 pt-3 border-t border-white/10 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Gemini 3.6 Flash Insights:</span>
                  {analysisResult.isCached && (
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      Persistent Intelligence
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="rounded-xl bg-black/50 border border-white/15 p-4 text-xs text-white/90 whitespace-pre-wrap leading-relaxed max-h-[40vh] overflow-y-auto select-text font-sans">
                {analysisResult.content}
              </div>
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
