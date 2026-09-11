import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

export default function FileUploadZone({ onUploadSuccess, isUploading, setIsUploading }) {
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);

  const allowedExtensions = ['pdf', 'docx', 'txt', 'csv'];

  const validateAndUpload = async (file) => {
    if (!file) return;

    setErrorMessage('');
    setSuccessMessage('');

    const extMatch = file.name.match(/\.([0-9a-z]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';

    if (!allowedExtensions.includes(ext)) {
      setErrorMessage(`Unsupported format .${ext || 'unknown'}. Allowed: PDF, DOCX, TXT, CSV`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 10 MB limit.`);
      return;
    }

    try {
      setIsUploading(true);
      await onUploadSuccess(file);
      setSuccessMessage(`"${file.name}" uploaded and processed successfully!`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        id="file-upload-input"
        accept=".pdf,.docx,.txt,.csv"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />

      <div
        role="button"
        tabIndex={isUploading ? -1 : 0}
        aria-label="Upload document for AI analysis (PDF, DOCX, CSV, TXT up to 10 MB)"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`relative border-2 border-dashed rounded-2xl p-6 md:p-8 text-center cursor-pointer transition-all duration-300 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
          dragOver
            ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01] shadow-lg shadow-cyan-500/10'
            : isUploading
            ? 'border-white/10 bg-white/5 opacity-70 cursor-not-allowed'
            : 'border-white/15 hover:border-cyan-500/50 hover:bg-white/[0.02] bg-white/[0.01]'
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 ${
              dragOver
                ? 'bg-cyan-500/20 text-cyan-300 scale-110'
                : 'bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 text-cyan-400'
            }`}
          >
            {isUploading ? (
              <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>

          <div>
            <h4 className="text-base font-medium text-white">
              {isUploading ? 'Uploading & Extracting Document...' : 'Upload Document for AI Analysis'}
            </h4>
            <p className="text-xs text-white/50 mt-1">
              Drag & drop or <span className="text-cyan-400 underline decoration-cyan-400/30">browse files</span> from your device
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-300 border border-red-500/20">
              PDF
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
              DOCX
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              CSV
            </span>
            <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">
              TXT
            </span>
            <span className="text-[11px] text-white/40 ml-1">Max 10 MB per file</span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs animate-fadeIn"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}
    </div>
  );
}
