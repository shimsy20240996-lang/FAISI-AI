import React, { useState, useEffect } from 'react';
import {
  FileText,
  X,
  Search,
  Plus,
  RefreshCw,
  HardDrive,
  Filter,
  Sparkles,
  AlertCircle,
  Loader2,
  FolderOpen,
  Database,
  Layers,
} from 'lucide-react';
import FileUploadZone from './FileUploadZone';
import DocumentCard from './DocumentCard';
import DocumentPreviewModal from './DocumentPreviewModal';
import DocumentAnalysisModal from './DocumentAnalysisModal';
import DocumentDeleteModal from './DocumentDeleteModal';
import {
  apiGetDocuments,
  apiUploadDocument,
  apiGetDocumentStats,
  apiIndexDocument,
  apiIndexAllDocuments,
} from '../../services/api';

export default function DocumentHubModal({ isOpen, onClose, user }) {
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [indexingDocIds, setIndexingDocIds] = useState(new Set());
  const [isIndexingAll, setIsIndexingAll] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('all');

  // Sub-modal states
  const [previewDoc, setPreviewDoc] = useState(null);
  const [analyzeDoc, setAnalyzeDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);

  const fetchDocumentsAndStats = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [docsData, statsData] = await Promise.all([
        apiGetDocuments(100, 0),
        apiGetDocumentStats(),
      ]);
      setDocuments(docsData.documents || []);
      setStats(statsData);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDocumentsAndStats();
    }
  }, [isOpen]);

  // Escape key & body scroll lock handling
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleUploadSuccess = async (file) => {
    const result = await apiUploadDocument(file);
    await fetchDocumentsAndStats();
    return result;
  };

  const handleDocumentDeleted = (deletedId) => {
    setDocuments((prev) => prev.filter((d) => d.id !== deletedId));
    if (stats) {
      setStats((prev) => ({
        ...prev,
        count: Math.max((prev?.count || 1) - 1, 0),
      }));
    }
  };

  const handleIndexDocument = async (doc) => {
    setIndexingDocIds((prev) => new Set(prev).add(doc.id));
    setError('');
    setSuccessMessage('');
    try {
      const res = await apiIndexDocument(doc.id);
      setSuccessMessage(`Indexed "${doc.originalName}" (${res.chunkCount} chunks)`);
      setTimeout(() => setSuccessMessage(''), 4000);
      await fetchDocumentsAndStats();
    } catch (err) {
      setError(`Failed to index "${doc.originalName}": ${err.message}`);
    } finally {
      setIndexingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  };

  const handleIndexAll = async () => {
    setIsIndexingAll(true);
    setError('');
    setSuccessMessage('');
    try {
      const res = await apiIndexAllDocuments();
      setSuccessMessage(
        `Batch Index Complete: ${res.indexedCount || 0} indexed, ${res.totalChunks || 0} chunks created.`
      );
      setTimeout(() => setSuccessMessage(''), 5000);
      await fetchDocumentsAndStats();
    } catch (err) {
      setError(`Batch indexing failed: ${err.message}`);
    } finally {
      setIsIndexingAll(false);
    }
  };

  // Filter documents by search and format
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      !searchQuery.trim() ||
      doc.originalName.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const matchesFormat =
      selectedFormat === 'all' || doc.extension.toLowerCase() === selectedFormat;
    return matchesSearch && matchesFormat;
  });

  const formats = [
    { id: 'all', label: 'All Files' },
    { id: 'pdf', label: 'PDF' },
    { id: 'docx', label: 'DOCX' },
    { id: 'csv', label: 'CSV' },
    { id: 'txt', label: 'TXT' },
  ];

  const storageUsedMB = stats ? (stats.totalBytes / (1024 * 1024)).toFixed(1) : '0';
  const storageMaxMB = stats?.maxMB || 100;
  const storagePercent = stats ? Math.min(Math.round((stats.totalBytes / (storageMaxMB * 1024 * 1024)) * 100), 100) : 0;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-hub-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      >
        <div
          className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-neutral-900 border border-white/15 shadow-2xl shadow-black/90 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between p-5 md:p-6 border-b border-white/10 bg-white/[0.02] gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-purple-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="doc-hub-title" className="text-lg md:text-xl font-bold text-white tracking-tight">
                    Document Workspace & Knowledge Base
                  </h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    Phase 7 RAG
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-0.5">
                  Semantic document indexing with Gemini Embedding 2 & Vector Retrieval
                </p>
              </div>
            </div>

            {/* Storage Quota & Action Bar */}
            <div className="flex items-center gap-3 flex-wrap">
              {stats && (
                <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
                  <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="text-white/60">Storage: {storageUsedMB} / {storageMaxMB} MB</span>
                      <span className="text-white/40">{stats.count || 0}/{stats.maxCount || 50} files</span>
                    </div>
                    <div className="w-32 h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                        style={{ width: `${storagePercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {documents.length > 0 && (
                <button
                  type="button"
                  onClick={handleIndexAll}
                  disabled={isIndexingAll || isLoading}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] sm:min-h-[36px] rounded-xl text-xs font-medium bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 hover:from-indigo-500/30 hover:to-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-500/80 focus-visible:outline-none"
                  title="Index all ready documents into Knowledge Base"
                >
                  {isIndexingAll ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  ) : (
                    <Database className="w-3.5 h-3.5" />
                  )}
                  <span>{isIndexingAll ? 'Indexing All...' : 'Index All'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={fetchDocumentsAndStats}
                disabled={isLoading}
                aria-label="Refresh documents"
                className="p-2.5 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-500/80 focus-visible:outline-none"
                title="Refresh documents"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close document workspace"
                className="p-2.5 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-500/80 focus-visible:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
            {/* Success message banner */}
            {successMessage && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs animate-fadeIn">
                <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Upload Zone */}
            <FileUploadZone
              onUploadSuccess={handleUploadSuccess}
              isUploading={isUploading}
              setIsUploading={setIsUploading}
            />

            {/* Controls Bar: Search & Format Filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents by name..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Format Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
                {formats.map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedFormat === fmt.id
                        ? 'bg-cyan-500/20 text-cyan-300 font-semibold shadow-sm'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Document Cards Grid */}
            {isLoading && documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                <p className="text-xs">Loading documents...</p>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
                <div className="p-4 rounded-2xl bg-white/5 text-white/30 mb-3">
                  <FolderOpen className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-medium text-white/70">
                  {searchQuery || selectedFormat !== 'all'
                    ? 'No documents match your filter'
                    : 'No documents uploaded yet'}
                </h4>
                <p className="text-xs text-white/40 max-w-sm mt-1">
                  {searchQuery || selectedFormat !== 'all'
                    ? 'Try clearing your search query or selecting "All Files".'
                    : 'Upload a PDF, DOCX, TXT, or CSV file above to start indexing and querying with Gemini RAG.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocuments.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onPreview={(d) => setPreviewDoc(d)}
                    onAnalyze={(d) => setAnalyzeDoc(d)}
                    onDelete={(d) => setDeleteDoc(d)}
                    onIndex={handleIndexDocument}
                    isIndexing={indexingDocIds.has(doc.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 px-6 border-t border-white/10 bg-white/[0.02] text-xs text-white/40">
            <span>
              {filteredDocuments.length} of {documents.length} documents shown
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {analyzeDoc && (
        <DocumentAnalysisModal
          document={analyzeDoc}
          isOpen={Boolean(analyzeDoc)}
          onClose={() => setAnalyzeDoc(null)}
        />
      )}

      {deleteDoc && (
        <DocumentDeleteModal
          document={deleteDoc}
          isOpen={Boolean(deleteDoc)}
          onClose={() => setDeleteDoc(null)}
          onDeleted={handleDocumentDeleted}
        />
      )}
    </>
  );
}
