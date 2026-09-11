import React, { useState, useEffect } from 'react';
import { X, ZoomIn, Image as ImageIcon, Download } from 'lucide-react';
import { getMediaUrl } from '../../services/api';

/**
 * Format bytes into human readable string
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * ImageComposerPreviews: renders thumbnail chips in composer before sending
 * @param {{
 *   attachments: Array<{ file?: File, previewUrl: string, name: string, size?: number }>,
 *   onRemove: (index: number) => void,
 *   isUploading?: boolean,
 * }} props
 */
export function ImageComposerPreviews({ attachments = [], onRemove, isUploading = false }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 flex-wrap animate-fadeIn">
      {attachments.map((att, idx) => (
        <div
          key={idx}
          className="group relative flex items-center gap-2 p-1.5 pr-2 rounded-xl bg-neutral-800/80 border border-neutral-700/60 shadow-sm text-xs text-neutral-200"
        >
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700/50 shrink-0">
            <img
              src={att.previewUrl}
              alt={att.name || 'Attachment preview'}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex flex-col min-w-0 max-w-[120px]">
            <span className="truncate text-[11px] font-medium text-neutral-200">
              {att.name}
            </span>
            {att.size && (
              <span className="text-[10px] text-neutral-400 font-mono">
                {formatBytes(att.size)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onRemove(idx)}
            disabled={isUploading}
            aria-label={`Remove ${att.name}`}
            className="p-1 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-700/50 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * MessageImageGallery: renders attached image thumbnails inside message bubble with Lightbox
 * @param {{
 *   attachments: Array<{ id: string, name: string, storageReference: string, mimeType: string, size?: number, width?: number, height?: number }>,
 * }} props
 */
export function MessageImageGallery({ attachments = [] }) {
  const [activeLightbox, setActiveLightbox] = useState(null);

  const images = attachments.filter(
    (att) => att.type === 'image' || att.mimeType?.startsWith('image/')
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveLightbox(null);
      }
    };
    if (activeLightbox) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeLightbox]);

  if (!images || images.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2.5 mt-2.5 mb-2">
        {images.map((img, idx) => {
          const srcUrl = img.storageReference
            ? getMediaUrl(img.storageReference)
            : img.previewUrl || '';

          return (
            <div
              key={img.id || idx}
              onClick={() => setActiveLightbox(img)}
              className="group relative w-36 h-28 sm:w-44 sm:h-32 rounded-xl overflow-hidden bg-neutral-950/80 border border-neutral-800 hover:border-indigo-500/60 shadow-md cursor-pointer transition-all duration-200 hover:scale-[1.02]"
              role="button"
              tabIndex={0}
              aria-label={`View image ${img.name}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveLightbox(img);
                }
              }}
            >
              <img
                src={srcUrl}
                alt={img.name || 'Message image attachment'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <ZoomIn className="w-5 h-5 drop-shadow-md" />
              </div>

              {/* Bottom filename badge */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 px-2">
                <p className="text-[10px] text-white/90 truncate font-medium">
                  {img.name}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Accessible Lightbox Modal */}
      {activeLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn"
          onClick={() => setActiveLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="w-full flex items-center justify-between p-3 bg-neutral-900/90 rounded-t-2xl border border-neutral-800 text-xs text-neutral-300">
              <div className="flex items-center gap-2 truncate">
                <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-semibold text-white truncate">{activeLightbox.name}</span>
                {activeLightbox.width && activeLightbox.height && (
                  <span className="text-neutral-500 text-[11px]">
                    ({activeLightbox.width}x{activeLightbox.height}px)
                  </span>
                )}
                {activeLightbox.size && (
                  <span className="text-neutral-500 text-[11px]">
                    &bull; {formatBytes(activeLightbox.size)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setActiveLightbox(null)}
                aria-label="Close image viewer"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image viewer */}
            <div className="relative max-h-[75vh] overflow-hidden rounded-b-2xl border-x border-b border-neutral-800 bg-neutral-950 flex items-center justify-center">
              <img
                src={
                  activeLightbox.storageReference
                    ? getMediaUrl(activeLightbox.storageReference)
                    : activeLightbox.previewUrl || ''
                }
                alt={activeLightbox.name}
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default {
  ImageComposerPreviews,
  MessageImageGallery,
};
