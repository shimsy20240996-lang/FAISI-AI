import React, { useState, useEffect, useRef } from 'react';
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
  Folder,
  FolderPlus,
  Tag,
  Database,
  Layers,
  BookOpen,
  ArrowRight,
  ChevronDown,
  Edit2,
  Trash2,
  Check,
} from 'lucide-react';
import FileUploadZone from './FileUploadZone';
import DocumentCard from './DocumentCard';
import DocumentPreviewModal from './DocumentPreviewModal';
import DocumentAnalysisModal from './DocumentAnalysisModal';
import DocumentDeleteModal from './DocumentDeleteModal';
import CollectionModal from './CollectionModal';
import CollectionDeleteModal from './CollectionDeleteModal';
import KnowledgeSearchResultCard from './KnowledgeSearchResultCard';
import {
  apiGetDocuments,
  apiUploadDocument,
  apiGetDocumentStats,
  apiIndexDocument,
  apiIndexAllDocuments,
  apiSearchKnowledgeBase,
  apiGetCollections,
  apiUpdateDocumentCollection,
  apiUpdateDocumentTags,
} from '../../services/api';

/**
 * DocumentHubModal Component
 * Comprehensive Document Management Hub with Collections, Tags, and Interactive Semantic Search.
 */
export default function DocumentHubModal({ isOpen, onClose, user, onAskFaisi }) {
  const [activeTab, setActiveTab] = useState('files'); // 'files' | 'search'
  const [documents, setDocuments] = useState([]);
  const [collections, setCollections] = useState([]);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [indexingDocIds, setIndexingDocIds] = useState(new Set());
  const [isIndexingAll, setIsIndexingAll] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('all');

  // Collection & Tag Filters (Phase 5)
  const [selectedCollectionId, setSelectedCollectionId] = useState('all'); // 'all' | 'uncategorized' | '<id>'
  const [selectedTag, setSelectedTag] = useState(null);

  // Semantic Search Explorer State (Phase 3)
  const [semanticQuery, setSemanticQuery] = useState('');
  const [selectedDocFilter, setSelectedDocFilter] = useState('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasEvidence, setHasEvidence] = useState(false);
  const semanticInputRef = useRef(null);

  // Sub-modal states
  const [previewDoc, setPreviewDoc] = useState(null);
  const [analyzeDoc, setAnalyzeDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState(null);

  const fetchDocumentsAndStats = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError('');

    try {
      const [docsData, colsData, statsData] = await Promise.all([
        apiGetDocuments(100, 0),
        apiGetCollections(),
        apiGetDocumentStats(),
      ]);
      setDocuments(docsData.documents || []);
      setCollections(colsData.collections || []);
      setUncategorizedCount(colsData.uncategorizedCount || 0);
      setStats(statsData);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDocumentsAndStats(true);
    }
  }, [isOpen]);

  // Focus semantic input on tab switch
  useEffect(() => {
    if (activeTab === 'search') {
      setTimeout(() => {
        semanticInputRef.current?.focus();
      }, 50);
    }
  }, [activeTab]);

  // Dynamic lightweight polling when any document is actively extracting or indexing
  useEffect(() => {
    if (!isOpen) return;

    const hasPendingWork = documents.some(
      (d) =>
        d.indexingStatus === 'pending' ||
        d.indexingStatus === 'processing' ||
        d.status === 'processing'
    );

    if (!hasPendingWork) return;

    const pollInterval = setInterval(() => {
      fetchDocumentsAndStats(false);
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isOpen, documents]);

  // Escape key & body scroll lock handling
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (!previewDoc && !analyzeDoc && !deleteDoc && !isCollectionModalOpen && !deleteCollectionTarget) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, previewDoc, analyzeDoc, deleteDoc, isCollectionModalOpen, deleteCollectionTarget]);

  if (!isOpen) return null;

  const announce = (msg) => {
    setAnnouncement(msg);
    setTimeout(() => setAnnouncement(''), 3000);
  };

  const handleUploadSuccess = async (file) => {
    // If viewing a specific user collection, upload directly into that collection
    const targetCollectionId =
      selectedCollectionId !== 'all' && selectedCollectionId !== 'uncategorized'
        ? selectedCollectionId
        : null;

    const result = await apiUploadDocument(file, targetCollectionId);
    await fetchDocumentsAndStats(false);
    announce(`Document "${file.name}" uploaded successfully.`);
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
    // Clean up semantic search results if deleted document was displayed
    if (searchResults.length > 0) {
      setSearchResults((prev) => prev.filter((r) => r.documentId !== deletedId));
    }
    fetchDocumentsAndStats(false);
    announce('Document deleted.');
  };

  const handleAssignCollection = async (doc, collectionId) => {
    try {
      await apiUpdateDocumentCollection(doc.id, collectionId);
      const targetCol = collections.find((c) => c.id === collectionId);
      const colName = targetCol ? targetCol.name : 'Uncategorized';
      announce(`Document moved to "${colName}".`);
      setSuccessMessage(`Moved "${doc.originalName}" to ${colName}`);
      setTimeout(() => setSuccessMessage(''), 3000);
      await fetchDocumentsAndStats(false);
    } catch (err) {
      setError(`Failed to move document: ${err.message}`);
    }
  };

  const handleUpdateTags = async (doc, newTags) => {
    try {
      await apiUpdateDocumentTags(doc.id, newTags);
      announce(`Updated tags for "${doc.originalName}".`);
      await fetchDocumentsAndStats(false);
    } catch (err) {
      setError(`Failed to update tags: ${err.message}`);
    }
  };

  const handleCollectionSuccess = (col, isEdit) => {
    fetchDocumentsAndStats(false);
    const msg = isEdit ? `Collection "${col.name}" updated.` : `Collection "${col.name}" created.`;
    setSuccessMessage(msg);
    announce(msg);
    setTimeout(() => setSuccessMessage(''), 3500);
  };

  const handleCollectionDeleted = (deletedId, uncoupledCount) => {
    if (selectedCollectionId === deletedId) {
      setSelectedCollectionId('all');
    }
    fetchDocumentsAndStats(false);
    const msg = `Collection deleted. ${uncoupledCount} document(s) moved to Uncategorized.`;
    setSuccessMessage(msg);
    announce(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleIndexDocument = async (doc) => {
    setIndexingDocIds((prev) => new Set(prev).add(doc.id));
    setError('');
    setSuccessMessage('');
    try {
      const res = await apiIndexDocument(doc.id);
      setSuccessMessage(`Indexed "${doc.originalName}" (${res.chunkCount} chunks)`);
      setTimeout(() => setSuccessMessage(''), 4000);
      await fetchDocumentsAndStats(false);
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
      await fetchDocumentsAndStats(false);
    } catch (err) {
      setError(`Batch indexing failed: ${err.message}`);
    } finally {
      setIsIndexingAll(false);
    }
  };

  // Perform Knowledge Base Semantic Search (Phase 3)
  const handleSemanticSearch = async (overrideQuery) => {
    const queryToSearch = typeof overrideQuery === 'string' ? overrideQuery : semanticQuery;
    const cleanQuery = queryToSearch ? queryToSearch.trim() : '';

    if (!cleanQuery) return;

    setIsSearching(true);
    setSearchError('');
    setHasSearched(true);

    try {
      const docIdsFilter = selectedDocFilter !== 'all' ? [selectedDocFilter] : [];
      const res = await apiSearchKnowledgeBase(cleanQuery, docIdsFilter, 6);

      setSearchResults(res.sources || []);
      setHasEvidence(res.hasEvidence || (res.sources && res.sources.length > 0));
    } catch (err) {
      setSearchError(err.message || 'Knowledge Base search failed. Please try again.');
      setSearchResults([]);
      setHasEvidence(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSemanticKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSemanticSearch();
    }
  };

  // Filter documents by Collection + Tag + Search + Format (Files tab)
  const filteredDocuments = documents.filter((doc) => {
    // 1. Collection filter
    if (selectedCollectionId === 'uncategorized') {
      if (doc.collectionId) return false;
    } else if (selectedCollectionId !== 'all') {
      const docColId = doc.collectionId?.toString() || doc.collectionId;
      if (docColId !== selectedCollectionId) return false;
    }

    // 2. Tag filter
    if (selectedTag) {
      if (!Array.isArray(doc.tags) || !doc.tags.includes(selectedTag)) return false;
    }

    // 3. Filename / Tag search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesName = doc.originalName?.toLowerCase().includes(q);
      const matchesTag = Array.isArray(doc.tags) && doc.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchesName && !matchesTag) return false;
    }

    // 4. Format filter
    if (selectedFormat !== 'all') {
      if (doc.extension?.toLowerCase() !== selectedFormat) return false;
    }

    return true;
  });

  const indexedDocuments = documents.filter((d) => d.indexingStatus === 'indexed');

  const formats = [
    { id: 'all', label: 'All Files' },
    { id: 'pdf', label: 'PDF' },
    { id: 'docx', label: 'DOCX' },
    { id: 'csv', label: 'CSV' },
    { id: 'txt', label: 'TXT' },
  ];

  const suggestedQueries = [
    'What are the main findings and conclusions?',
    'Summarize key metrics and financial data',
    'Explain the methodology and technical architecture',
  ];

  const storageUsedMB = stats ? parseFloat(stats.totalMB || 0) : 0;
  const storageMaxMB = stats ? stats.maxMB || 100 : 100;
  const storagePercent = Math.min((storageUsedMB / storageMaxMB) * 100, 100);

  const activeCollectionObj = collections.find((c) => c.id === selectedCollectionId);

  return (
    <>
      {/* Screen Reader Live Region for Announcements */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Knowledge Base & Document Workspace"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      >
        <div className="w-full max-w-6xl h-[92vh] max-h-[900px] flex flex-col rounded-3xl bg-neutral-900 border border-white/10 shadow-2xl overflow-hidden text-neutral-100 animate-scaleUp">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 shadow-inner">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base md:text-lg font-semibold text-white tracking-tight">
                    Document Workspace & Knowledge Base
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    Phase 5
                  </span>
                </div>
                <p className="text-xs text-white/50 hidden sm:block">
                  Organize collections, tag files, auto-index vectors, and explore your personal grounded knowledge.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {stats && (
                <div className="hidden lg:flex items-center gap-3 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs">
                  <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <div className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="text-white/60">
                        Storage: {storageUsedMB} / {storageMaxMB} MB
                      </span>
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

              {activeTab === 'files' && documents.length > 0 && (
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
                onClick={() => fetchDocumentsAndStats()}
                disabled={isLoading}
                aria-label="Refresh documents and collections"
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

          {/* Primary View Mode Tab Navigation */}
          <div className="flex items-center gap-2 px-5 md:px-6 pt-3 border-b border-white/10 bg-white/[0.01]">
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'files'
                  ? 'border-cyan-400 text-cyan-300 bg-white/[0.02]'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Files & Collections</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-white/70">
                {documents.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'search'
                  ? 'border-cyan-400 text-cyan-300 bg-white/[0.02]'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Semantic Search & Explorer</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                {indexedDocuments.length} indexed
              </span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Global Success Banner */}
            {successMessage && (
              <div className="m-4 mb-0 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs animate-fadeIn shrink-0">
                <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* TAB 1: FILES & COLLECTIONS */}
            {activeTab === 'files' && (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Desktop Collections Sidebar */}
                <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.01] p-4 overflow-y-auto space-y-4">
                  {/* Views */}
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedCollectionId('all')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                        selectedCollectionId === 'all'
                          ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-cyan-400" />
                        <span>All Documents</span>
                      </div>
                      <span className="text-[10px] text-white/40 font-mono">{documents.length}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedCollectionId('uncategorized')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                        selectedCollectionId === 'uncategorized'
                          ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-white/40" />
                        <span>Uncategorized</span>
                      </div>
                      <span className="text-[10px] text-white/40 font-mono">{uncategorizedCount}</span>
                    </button>
                  </div>

                  <div className="border-t border-white/10 pt-3">
                    {/* Collections Header */}
                    <div className="flex items-center justify-between px-1 mb-2">
                      <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                        Collections ({collections.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCollection(null);
                          setIsCollectionModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                        title="Create new collection"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New</span>
                      </button>
                    </div>

                    {/* Collection List */}
                    <div className="space-y-1">
                      {collections.length === 0 ? (
                        <div className="text-center py-6 px-2 text-white/40 text-xs">
                          <p>No collections created.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCollection(null);
                              setIsCollectionModalOpen(true);
                            }}
                            className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                          >
                            + Create Collection
                          </button>
                        </div>
                      ) : (
                        collections.map((col) => {
                          const isSelected = selectedCollectionId === col.id;
                          return (
                            <div
                              key={col.id}
                              className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all ${
                                isSelected
                                  ? 'bg-white/10 text-white font-semibold border border-white/15'
                                  : 'hover:bg-white/5 text-white/70 hover:text-white'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedCollectionId(col.id)}
                                className="flex-1 flex items-center gap-2 text-left truncate cursor-pointer py-0.5"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                                  style={{ backgroundColor: col.color || '#6366f1' }}
                                />
                                <span className="text-xs truncate">{col.name}</span>
                              </button>

                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-white/40 font-mono">
                                  {col.documentCount || 0}
                                </span>

                                <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCollection(col);
                                      setIsCollectionModalOpen(true);
                                    }}
                                    className="p-1 text-white/40 hover:text-white rounded hover:bg-white/10 cursor-pointer"
                                    title="Edit collection"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteCollectionTarget(col)}
                                    className="p-1 text-white/40 hover:text-red-400 rounded hover:bg-white/10 cursor-pointer"
                                    title="Delete collection"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </aside>

                {/* Main Documents Workspace */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                  {/* Mobile Collections Selector */}
                  <div className="md:hidden space-y-2 pb-2 border-b border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                        Workspace Scope
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCollection(null);
                          setIsCollectionModalOpen(true);
                        }}
                        className="text-xs text-cyan-400 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> New Collection
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      <button
                        type="button"
                        onClick={() => setSelectedCollectionId('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                          selectedCollectionId === 'all'
                            ? 'bg-cyan-500 text-neutral-950 font-bold'
                            : 'bg-white/5 text-white/70 border border-white/10'
                        }`}
                      >
                        All ({documents.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCollectionId('uncategorized')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                          selectedCollectionId === 'uncategorized'
                            ? 'bg-cyan-500 text-neutral-950 font-bold'
                            : 'bg-white/5 text-white/70 border border-white/10'
                        }`}
                      >
                        Uncategorized ({uncategorizedCount})
                      </button>
                      {collections.map((col) => (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => setSelectedCollectionId(col.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                            selectedCollectionId === col.id
                              ? 'bg-white/20 text-white font-bold border border-white/30'
                              : 'bg-white/5 text-white/70 border border-white/10'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: col.color || '#6366f1' }}
                          />
                          <span>{col.name}</span>
                          <span className="text-[10px] opacity-70">({col.documentCount || 0})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Workspace Banner / Collection Details */}
                  {activeCollectionObj && (
                    <div
                      className="flex items-center justify-between p-3 px-4 rounded-2xl border bg-white/[0.02]"
                      style={{
                        borderColor: `${activeCollectionObj.color}40`,
                        backgroundColor: `${activeCollectionObj.color}08`,
                      }}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: activeCollectionObj.color }}
                        />
                        <div className="truncate">
                          <h4 className="text-xs font-semibold text-white truncate">
                            Collection: {activeCollectionObj.name}
                          </h4>
                          {activeCollectionObj.description && (
                            <p className="text-[11px] text-white/50 truncate">
                              {activeCollectionObj.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCollection(activeCollectionObj);
                            setIsCollectionModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Edit collection"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteCollectionTarget(activeCollectionObj)}
                          className="p-1.5 rounded-lg text-white/60 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                          title="Delete collection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Active Tag Filter Indicator */}
                  {selectedTag && (
                    <div className="flex items-center justify-between p-2.5 px-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-300 animate-fadeIn">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5" />
                        <span>
                          Filtered by Tag: <strong>#{selectedTag}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTag(null)}
                        className="text-[11px] text-cyan-200 hover:text-white underline cursor-pointer"
                      >
                        Clear tag filter
                      </button>
                    </div>
                  )}

                  {/* Upload Drop Zone */}
                  <FileUploadZone
                    onUploadSuccess={handleUploadSuccess}
                    isUploading={isUploading}
                    setIsUploading={setIsUploading}
                  />

                  {/* Filter & Search Toolbar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                    {/* Filename & Tag Search */}
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by filename or #tag..."
                        className="w-full pl-9 pr-4 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
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
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
                        {searchQuery || selectedFormat !== 'all' || selectedCollectionId !== 'all' || selectedTag
                          ? 'No documents match your active filters'
                          : 'No documents uploaded yet'}
                      </h4>
                      <p className="text-xs text-white/40 max-w-sm mt-1">
                        {searchQuery || selectedFormat !== 'all' || selectedCollectionId !== 'all' || selectedTag ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCollectionId('all');
                              setSelectedTag(null);
                              setSearchQuery('');
                              setSelectedFormat('all');
                            }}
                            className="text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer"
                          >
                            Reset all filters
                          </button>
                        ) : (
                          'Upload a PDF, DOCX, TXT, or CSV file above to start organizing and querying with Gemini RAG.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredDocuments.map((doc) => (
                        <DocumentCard
                          key={doc.id}
                          document={doc}
                          collections={collections}
                          onPreview={(d) => setPreviewDoc(d)}
                          onAnalyze={(d) => setAnalyzeDoc(d)}
                          onDelete={(d) => setDeleteDoc(d)}
                          onIndex={handleIndexDocument}
                          isIndexing={indexingDocIds.has(doc.id)}
                          onFilterByCollection={(colId) => setSelectedCollectionId(colId)}
                          onFilterByTag={(tag) => setSelectedTag(tag)}
                          onAssignCollection={handleAssignCollection}
                          onUpdateTags={handleUpdateTags}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: SEMANTIC SEARCH & PASSAGE EXPLORER (Phase 3) */}
            {activeTab === 'search' && (
              <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 animate-fadeIn">
                {/* Search Header Bar */}
                <div className="flex flex-col gap-3 p-4 md:p-5 rounded-2xl bg-white/[0.02] border border-white/10 shadow-inner">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {/* Semantic Search Input */}
                    <div className="relative flex-1">
                      <Sparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
                      <input
                        ref={semanticInputRef}
                        type="text"
                        value={semanticQuery}
                        onChange={(e) => setSemanticQuery(e.target.value)}
                        onKeyDown={handleSemanticKeyDown}
                        placeholder="Search Knowledge Base by concept, question, or key phrase..."
                        className="w-full pl-10 pr-24 py-2.5 rounded-xl bg-black/50 border border-white/15 text-xs md:text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 transition-all"
                      />
                      {semanticQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSemanticQuery('');
                            setSearchResults([]);
                            setHasSearched(false);
                          }}
                          aria-label="Clear semantic search"
                          className="absolute right-14 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSemanticSearch()}
                        disabled={isSearching || !semanticQuery.trim()}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-neutral-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer font-semibold flex items-center gap-1 shadow-sm"
                      >
                        {isSearching ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">Search</span>
                      </button>
                    </div>

                    {/* Document Scope Filter Dropdown */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40 shrink-0 hidden md:inline">Scope:</span>
                      <select
                        value={selectedDocFilter}
                        onChange={(e) => setSelectedDocFilter(e.target.value)}
                        className="px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white/80 focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer w-full sm:w-auto max-w-xs truncate"
                        title="Filter semantic search by document"
                      >
                        <option value="all" className="bg-neutral-900 text-white">
                          All Indexed Documents ({indexedDocuments.length})
                        </option>
                        {indexedDocuments.map((doc) => (
                          <option key={doc.id} value={doc.id} className="bg-neutral-900 text-white">
                            {doc.originalName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quick Suggestion Chips (when idle) */}
                  {!hasSearched && !isSearching && (
                    <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/5">
                      <span className="text-[11px] text-white/40">Try asking:</span>
                      {suggestedQueries.map((queryText, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSemanticQuery(queryText);
                            handleSemanticSearch(queryText);
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/10 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/20 text-white/60 transition-all cursor-pointer"
                        >
                          "{queryText}"
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* State: Loading */}
                {isSearching && (
                  <div className="flex flex-col items-center justify-center py-16 text-white/50 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                    <p className="text-xs md:text-sm font-medium text-white/80">
                      Searching Knowledge Base across indexed vector embeddings...
                    </p>
                    <p className="text-[11px] text-white/40">
                      Retrieving top matching passages with cosine similarity
                    </p>
                  </div>
                )}

                {/* State: Error */}
                {searchError && (
                  <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                      <span>{searchError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSemanticSearch()}
                      className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 text-xs transition-colors cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* State: Idle / No search yet */}
                {!hasSearched && !isSearching && (
                  <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
                    <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 mb-3 border border-cyan-500/20">
                      <BookOpen className="w-8 h-8" />
                    </div>
                    <h4 className="text-sm font-semibold text-white/80">
                      Interactive Knowledge Base Explorer
                    </h4>
                    <p className="text-xs text-white/45 max-w-md mt-1 leading-relaxed">
                      Enter any natural-language concept or question above to extract relevant excerpts from your indexed documents, inspect similarity scores, and ask FAISI about specific passages.
                    </p>
                  </div>
                )}

                {/* State: No Results */}
                {hasSearched && !isSearching && !searchError && searchResults.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
                    <div className="p-4 rounded-2xl bg-white/5 text-white/30 mb-3">
                      <Search className="w-8 h-8" />
                    </div>
                    <h4 className="text-sm font-medium text-white/80">
                      No matching passages found
                    </h4>
                    <p className="text-xs text-white/40 max-w-sm mt-1">
                      No indexed passages matched your query above the relevance threshold. Try broadening your terms or checking that your documents are fully indexed.
                    </p>
                  </div>
                )}

                {/* State: Results Found */}
                {hasSearched && !isSearching && !searchError && searchResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-white/50 px-1">
                      <span className="font-medium text-cyan-300">
                        Found {searchResults.length} matching passage{searchResults.length === 1 ? '' : 's'}
                      </span>
                      <span>Sorted by similarity relevance</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {searchResults.map((source, index) => (
                        <KnowledgeSearchResultCard
                          key={source.chunkId || source.sourceIndex || index}
                          source={source}
                          onAskFaisi={onAskFaisi}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 px-6 border-t border-white/10 bg-white/[0.02] text-xs text-white/40">
            <span>
              {activeTab === 'files'
                ? `${filteredDocuments.length} of ${documents.length} documents shown`
                : `${indexedDocuments.length} indexed document(s) available for search`}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
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

      {isCollectionModalOpen && (
        <CollectionModal
          isOpen={isCollectionModalOpen}
          onClose={() => {
            setIsCollectionModalOpen(false);
            setEditingCollection(null);
          }}
          collection={editingCollection}
          onSuccess={handleCollectionSuccess}
        />
      )}

      {deleteCollectionTarget && (
        <CollectionDeleteModal
          isOpen={Boolean(deleteCollectionTarget)}
          onClose={() => setDeleteCollectionTarget(null)}
          collection={deleteCollectionTarget}
          onSuccess={handleCollectionDeleted}
        />
      )}
    </>
  );
}
