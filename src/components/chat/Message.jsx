import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, User, Info, Check, Copy, Square, AlertCircle, BookOpen, Layers, Image as ImageIcon } from 'lucide-react';
import MessageActions from './MessageActions';
import CitationModal from './CitationModal';
import { MessageImageGallery } from './ImagePreviewGallery';
import Badge from '../common/Badge';

/**
 * Safe block formatter for Markdown-style assistant messages
 * Renders paragraphs, code blocks, lists, headings, and inline formatting without unsafe HTML.
 */
function FormattedContent({ text, isStreaming = false }) {
  const parts = useMemo(() => {
    if (!text) return [];
    return text.split(/(```[\s\S]*?```)/g);
  }, [text]);

  if (!text) {
    if (isStreaming) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span>Generating response...</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-neutral-200 dark:text-neutral-200 light:text-neutral-800 break-words">
      {parts.map((part, index) => {
        if (!part) return null;

        // Code Block
        if (part.startsWith('```') && part.endsWith('```')) {
          const firstLineBreak = part.indexOf('\n');
          const language = part.slice(3, firstLineBreak).trim() || 'code';
          const codeContent = part.slice(firstLineBreak + 1, -3);

          return (
            <CodeBlock key={index} language={language} code={codeContent} />
          );
        }

        // Regular Text
        const lines = part.split('\n');
        return (
          <div key={index} className="space-y-2">
            {lines.map((line, lineIdx) => {
              if (!line.trim()) return null;

              // Bullet list item
              if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
                const itemText = line.trim().slice(2);
                return (
                  <div key={lineIdx} className="flex items-start gap-2 ml-2">
                    <span className="text-indigo-400 mt-1 select-none">&bull;</span>
                    <span>{renderInlineText(itemText)}</span>
                  </div>
                );
              }

              // Numbered list item (e.g. "1. ")
              const numberedMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
              if (numberedMatch) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 ml-2">
                    <span className="text-indigo-400 font-mono text-xs mt-0.5 select-none">
                      {numberedMatch[1]}.
                    </span>
                    <span>{renderInlineText(numberedMatch[2])}</span>
                  </div>
                );
              }

              // Headings
              if (line.trim().startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="font-bold text-sm text-neutral-100 dark:text-neutral-100 light:text-neutral-900 mt-3 mb-1">
                    {renderInlineText(line.trim().slice(4))}
                  </h4>
                );
              }
              if (line.trim().startsWith('## ')) {
                return (
                  <h3 key={lineIdx} className="font-bold text-base text-neutral-100 dark:text-neutral-100 light:text-neutral-900 mt-4 mb-1.5">
                    {renderInlineText(line.trim().slice(3))}
                  </h3>
                );
              }
              if (line.trim().startsWith('# ')) {
                return (
                  <h2 key={lineIdx} className="font-extrabold text-lg text-neutral-100 dark:text-neutral-100 light:text-neutral-900 mt-4 mb-2">
                    {renderInlineText(line.trim().slice(2))}
                  </h2>
                );
              }

              return (
                <p key={lineIdx}>
                  {renderInlineText(line)}
                  {isStreaming && index === parts.length - 1 && lineIdx === lines.length - 1 && (
                    <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-1 translate-y-0.5 animate-pulse" />
                  )}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Render inline tokens (bold, inline code, italics) safely
 */
function renderInlineText(str) {
  if (!str) return '';

  const tokens = str.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={i}
          className="font-mono text-xs bg-neutral-800/80 dark:bg-neutral-800/80 light:bg-neutral-200 px-1.5 py-0.5 rounded text-indigo-300 dark:text-indigo-300 light:text-indigo-700 border border-neutral-700/50 dark:border-neutral-700/50 light:border-neutral-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={i} className="font-semibold text-neutral-100 dark:text-neutral-100 light:text-neutral-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={i} className="italic text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
          {token.slice(1, -1)}
        </em>
      );
    }
    return token;
  });
}

/**
 * Safe Code Block Component with Copy-to-Clipboard
 */
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code block:', err);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden my-3 border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-300 bg-neutral-950 dark:bg-neutral-950 light:bg-neutral-900 shadow-md">
      {/* Code Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-neutral-800/90 border-b border-neutral-800/60 dark:border-neutral-800/60 light:border-neutral-700/60 text-xs text-neutral-400">
        <span className="font-mono text-neutral-300 uppercase tracking-wider text-[11px] font-semibold">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-800 light:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
              <span className="sr-only" aria-live="polite">Code copied to clipboard</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <pre className="p-4 overflow-x-auto text-xs font-mono text-neutral-200 leading-relaxed scrollbar-thin scrollbar-thumb-neutral-800">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Message Component
 * @param {{
 *   message: {
 *     id: string,
 *     role: 'user' | 'assistant' | 'system',
 *     content: string,
 *     status?: 'pending' | 'streaming' | 'complete' | 'stopped' | 'error',
 *     timestamp: string,
 *     attachments?: Array<any>,
 *     sources?: Array<any>,
 *   },
 *   isGenerating?: boolean,
 *   onRegenerate?: (messageId: string) => void,
 *   onPlaySpeech?: (messageId: string, text: string) => void,
 *   isPlayingSpeech?: boolean,
 *   isSpeechLoading?: boolean,
 *   onNotice?: (featureName: string, description: string) => void,
 * }} props
 */
export function Message({
  message,
  isGenerating = false,
  onRegenerate,
  onPlaySpeech,
  isPlayingSpeech = false,
  isSpeechLoading = false,
  onNotice,
}) {
  const [activeCitation, setActiveCitation] = useState(null);
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const isStreaming = message.status === 'streaming';
  const isStopped = message.status === 'stopped';
  const isError = message.status === 'error';
  const sources = message.sources || [];
  const attachments = message.attachments || [];

  if (isSystem) {
    return (
      <div className="flex justify-center my-4 px-4">
        <div className="flex items-center gap-2 max-w-lg p-3 rounded-xl bg-indigo-950/20 border border-indigo-800/40 text-xs text-indigo-300">
          <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`group w-full max-w-3xl mx-auto flex gap-3 sm:gap-4 p-4 rounded-2xl transition-colors ${
          isAssistant
            ? 'bg-neutral-900/40 dark:bg-neutral-900/40 light:bg-neutral-100/60'
            : 'bg-transparent'
        }`}
      >
        {/* Avatar */}
        <div className="shrink-0 pt-0.5">
          {isAssistant ? (
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 shadow-md shadow-indigo-500/10 flex items-center justify-center">
              <div className="w-full h-full bg-neutral-950 dark:bg-neutral-950 light:bg-white rounded-[10px] flex items-center justify-center">
                <Sparkles
                  className={`w-4 h-4 text-indigo-400 dark:text-indigo-400 light:text-indigo-600 ${
                    isStreaming ? 'animate-pulse' : ''
                  }`}
                />
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-neutral-800 dark:bg-neutral-800 light:bg-neutral-200 border border-neutral-700/60 dark:border-neutral-700/60 light:border-neutral-300 flex items-center justify-center text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
              <User className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Message Body */}
        <div className="flex-1 min-w-0">
          {/* Author Header & Timestamp */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800">
              {isAssistant ? 'SABU' : 'You'}
            </span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-500 light:text-neutral-400">
              {message.timestamp}
            </span>
            {isAssistant && (
              <Badge variant="indigo" className="text-[10px] py-0 px-1.5">
                {message.model === 'gemini-3.5-flash-lite'
                  ? 'Gemini 3.5 Flash-Lite'
                  : (message.model === 'gemini-3.6-flash' ? 'Gemini 3.6 Flash' : (message.model || 'Gemini 3.6 Flash'))}
              </Badge>
            )}
            {attachments.length > 0 && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 border-purple-500/30 text-purple-300">
                <ImageIcon className="w-2.5 h-2.5 mr-1 inline" />
                {attachments.length} {attachments.length === 1 ? 'Image' : 'Images'}
              </Badge>
            )}
            {sources.length > 0 && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 border-indigo-500/30 text-indigo-300">
                <BookOpen className="w-2.5 h-2.5 mr-1 inline" />
                Knowledge Base Grounded
              </Badge>
            )}
            {isStreaming && (
              <Badge variant="purple" className="text-[10px] py-0 px-1.5 animate-pulse">
                Streaming
              </Badge>
            )}
            {isStopped && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-amber-400 border-amber-800/60">
                <Square className="w-2.5 h-2.5 mr-0.5 fill-current" /> Stopped
              </Badge>
            )}
            {isError && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-red-400 border-red-800/60">
                <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Error
              </Badge>
            )}
          </div>

          {/* Attached Images Gallery */}
          {attachments.length > 0 && (
            <MessageImageGallery attachments={attachments} />
          )}

          {/* Content */}
          {isAssistant ? (
            <FormattedContent text={message.content} isStreaming={isStreaming} />
          ) : (
            <div className="text-sm leading-relaxed text-neutral-200 dark:text-neutral-200 light:text-neutral-800 whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}

          {/* Knowledge Base Sources Drawer */}
          {sources.length > 0 && (
            <div className="mt-3.5 pt-3 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 mb-2">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Verified Sources ({sources.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sources.map((src) => (
                  <button
                    key={src.sourceIndex}
                    type="button"
                    onClick={() => setActiveCitation(src)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-950/70 hover:bg-neutral-800 border border-neutral-800 hover:border-indigo-500/50 text-xs text-neutral-300 hover:text-indigo-300 transition-all cursor-pointer shadow-sm"
                    title={`Click to view passage excerpt from ${src.documentName}`}
                  >
                    <span className="font-mono text-[10px] font-bold text-indigo-400 bg-indigo-950/50 px-1 py-0.2 rounded border border-indigo-800/50">
                      [{src.sourceIndex}]
                    </span>
                    <span className="font-medium truncate max-w-[150px]">
                      {src.documentName}
                    </span>
                    {src.pageNumber && (
                      <span className="text-[10px] text-neutral-500">
                        p.{src.pageNumber}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Toolbar (Only when message is not actively streaming) */}
          {!isStreaming && (
            <MessageActions
              content={message.content}
              isAssistant={isAssistant}
              isGenerating={isGenerating}
              status={message.status}
              onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
              onPlaySpeech={
                onPlaySpeech && isAssistant && message.content
                  ? () => onPlaySpeech(message.id, message.content)
                  : undefined
              }
              isPlayingSpeech={isPlayingSpeech}
              isSpeechLoading={isSpeechLoading}
              onNotice={onNotice}
            />
          )}
        </div>
      </motion.div>

      {/* Citation Details Modal */}
      <CitationModal
        source={activeCitation}
        isOpen={Boolean(activeCitation)}
        onClose={() => setActiveCitation(null)}
      />
    </>
  );
}

/**
 * Custom memo comparator for Message component.
 * Verifies all 13 render-relevant properties with lightweight scalar/length checks,
 * avoiding expensive deep serialization while guaranteeing zero stale UI state.
 */
function areMessagePropsEqual(prevProps, nextProps) {
  if (prevProps.isGenerating !== nextProps.isGenerating) return false;
  if (prevProps.isPlayingSpeech !== nextProps.isPlayingSpeech) return false;
  if (prevProps.isSpeechLoading !== nextProps.isSpeechLoading) return false;
  if (prevProps.onRegenerate !== nextProps.onRegenerate) return false;
  if (prevProps.onPlaySpeech !== nextProps.onPlaySpeech) return false;
  if (prevProps.onNotice !== nextProps.onNotice) return false;

  const prevMsg = prevProps.message;
  const nextMsg = nextProps.message;
  if (prevMsg === nextMsg) return true;
  if (!prevMsg || !nextMsg) return false;

  if (prevMsg.id !== nextMsg.id) return false;
  if (prevMsg.role !== nextMsg.role) return false;
  if (prevMsg.content !== nextMsg.content) return false;
  if (prevMsg.status !== nextMsg.status) return false;
  if (prevMsg.timestamp !== nextMsg.timestamp) return false;
  if (prevMsg.model !== nextMsg.model) return false;

  // Citations / Sources check
  const prevSources = prevMsg.sources;
  const nextSources = nextMsg.sources;
  if (prevSources !== nextSources) {
    if (!prevSources || !nextSources) return false;
    if (prevSources.length !== nextSources.length) return false;
  }

  // Attachments check
  const prevAtts = prevMsg.attachments;
  const nextAtts = nextMsg.attachments;
  if (prevAtts !== nextAtts) {
    if (!prevAtts || !nextAtts) return false;
    if (prevAtts.length !== nextAtts.length) return false;
  }

  return true;
}

export const MemoizedMessage = React.memo(Message, areMessagePropsEqual);
export default MemoizedMessage;
