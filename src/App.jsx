import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import MainLayout from './components/layout/MainLayout';
import ChatContainer from './components/chat/ChatContainer';
import { useAuth } from './context/AuthContext';
import { INITIAL_CONVERSATIONS } from './utils/constants';

// Lazy-loaded modal dialogs (code-split for smaller initial bundle and faster startup)
const RenameModal = React.lazy(() => import('./components/modals/RenameModal'));
const DeleteConfirmModal = React.lazy(() => import('./components/modals/DeleteConfirmModal'));
const AuthModal = React.lazy(() => import('./components/auth/AuthModal'));
const ClaimConversationsModal = React.lazy(() => import('./components/auth/ClaimConversationsModal'));
const DocumentHubModal = React.lazy(() => import('./components/documents/DocumentHubModal'));
import {
  getConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  streamChatMessage,
  apiClaimConversations,
  apiGetUnclaimedCount,
} from './services/api';

function App() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [noticeModal, setNoticeModal] = useState(null);

  // Auth modal state
  const [authModalState, setAuthModalState] = useState({
    isOpen: false,
    mode: 'login',
  });

  // Claim modal state (for moving anonymous browser conversations to authenticated account)
  const [claimModalState, setClaimModalState] = useState({
    isOpen: false,
    unclaimedCount: 0,
  });

  // Rename modal state
  const [renameModalState, setRenameModalState] = useState({
    isOpen: false,
    conversationId: null,
    currentTitle: '',
    isSaving: false,
  });

  // Delete modal state
  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    conversationId: null,
    title: '',
    isDeleting: false,
  });

  // Document Hub modal state (Phase 6)
  const [isDocumentHubOpen, setIsDocumentHubOpen] = useState(false);

  // Knowledge Base RAG state (Phase 7)
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false);

  const activeAbortControllerRef = useRef(null);
  const lastFailedActionRef = useRef(null);
  const claimDismissedRef = useRef(false);

  // Document Hub opener & closer
  const handleOpenDocuments = useCallback(() => {
    setIsDocumentHubOpen(true);
  }, []);

  const handleCloseDocuments = useCallback(() => {
    setIsDocumentHubOpen(false);
  }, []);

  // Load conversations whenever authentication state changes
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (isAuthLoading) return;

      setIsLoadingConversations(true);

      if (isAuthenticated) {
        try {
          // Fetch authenticated user's conversations from MongoDB
          const userConversations = await getConversations();

          if (isMounted) {
            if (Array.isArray(userConversations) && userConversations.length > 0) {
              setConversations(userConversations);
              setActiveId(userConversations[0].id);
            } else {
              // Create the first default conversation in MongoDB for this user
              const initialConv = await createConversation('New Exploration');
              setConversations([initialConv]);
              setActiveId(initialConv.id);
            }

            // Check if there are unclaimed anonymous conversations on this browser
            if (!claimDismissedRef.current) {
              const unclaimed = await apiGetUnclaimedCount();
              if (unclaimed > 0 && isMounted) {
                setClaimModalState({ isOpen: true, unclaimedCount: unclaimed });
              }
            }
          }
        } catch (err) {
          console.warn('⚠️ Could not fetch authenticated conversations:', err.message);
          if (isMounted) {
            setConversations(INITIAL_CONVERSATIONS);
            setActiveId('conv-1');
          }
        } finally {
          if (isMounted) {
            setIsLoadingConversations(false);
          }
        }
      } else {
        // Unauthenticated guest exploring state (private user conversations are cleared immediately)
        if (isMounted) {
          setConversations(INITIAL_CONVERSATIONS);
          setActiveId('conv-1');
          setIsLoadingConversations(false);
          setClaimModalState({ isOpen: false, unclaimedCount: 0 });
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, isAuthLoading, user]);

  // Active conversation object
  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  // Format local timestamp
  const getFormattedTime = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Generate clean local conversation title from first user prompt
  const generateTitleFromText = (text) => {
    const clean = text.trim().replace(/^["']|["']$/g, '');
    const firstLine = clean.split('\n')[0];
    return firstLine.length > 45 ? firstLine.slice(0, 45).trim() + '...' : firstLine;
  };

  // Stop Generation Handler
  const handleStopGeneration = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    setIsGenerating(false);

    // Mark streaming message as stopped in local UI state
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeId) {
          const updatedMessages = (c.messages || []).map((m) =>
            m.status === 'streaming' ? { ...m, status: 'stopped' } : m
          );
          return { ...c, messages: updatedMessages };
        }
        return c;
      })
    );
  }, [activeId]);

  // New Chat Handler
  const handleNewChat = useCallback(async () => {
    if (isGenerating) {
      handleStopGeneration();
    }

    if (isAuthenticated) {
      try {
        const newConv = await createConversation('New Exploration');
        setConversations((prev) => [newConv, ...prev]);
        setActiveId(newConv.id);
        setErrorMessage(null);
      } catch (err) {
        console.warn('⚠️ Could not create conversation on server, using fallback:', err.message);
        const fallbackId = `conv-${Date.now()}`;
        const fallbackConv = {
          id: fallbackId,
          title: 'New Exploration',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setConversations((prev) => [fallbackConv, ...prev]);
        setActiveId(fallbackId);
        setErrorMessage(null);
      }
    } else {
      const fallbackId = `conv-${Date.now()}`;
      const fallbackConv = {
        id: fallbackId,
        title: 'New Exploration',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setConversations((prev) => [fallbackConv, ...prev]);
      setActiveId(fallbackId);
      setErrorMessage(null);
    }
  }, [isAuthenticated, isGenerating, handleStopGeneration]);

  // Keyboard shortcut Ctrl+N for new chat
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

  // Select Conversation
  const handleSelectConversation = useCallback((id) => {
    if (isGenerating) {
      handleStopGeneration();
    }
    setActiveId(id);
    setErrorMessage(null);
  }, [isGenerating, handleStopGeneration]);

  // Open Rename Modal
  const handleOpenRename = useCallback((id, currentTitle) => {
    setRenameModalState({
      isOpen: true,
      conversationId: id,
      currentTitle: currentTitle || 'New Exploration',
      isSaving: false,
    });
  }, []);

  // Save Rename Title
  const handleSaveRename = async (newTitle) => {
    const { conversationId } = renameModalState;
    if (!conversationId || !newTitle) return;

    setRenameModalState((prev) => ({ ...prev, isSaving: true }));

    if (isAuthenticated && !conversationId.startsWith('conv-')) {
      try {
        await renameConversation(conversationId, newTitle);
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, title: newTitle } : c))
        );
      } catch (err) {
        console.error('Failed to rename conversation:', err);
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, title: newTitle } : c))
        );
      }
    } else {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title: newTitle } : c))
      );
    }

    setRenameModalState({ isOpen: false, conversationId: null, currentTitle: '', isSaving: false });
  };

  // Open Delete Confirmation Modal
  const handleOpenDelete = useCallback((id, title) => {
    setDeleteModalState({
      isOpen: true,
      conversationId: id,
      title: title || 'this conversation',
      isDeleting: false,
    });
  }, []);

  // Confirm Delete Conversation
  const handleConfirmDelete = async () => {
    const { conversationId } = deleteModalState;
    if (!conversationId) return;

    if (activeId === conversationId && isGenerating) {
      handleStopGeneration();
    }

    setDeleteModalState((prev) => ({ ...prev, isDeleting: true }));

    if (isAuthenticated && !conversationId.startsWith('conv-')) {
      try {
        await deleteConversation(conversationId);
      } catch (err) {
        console.error('Failed to delete conversation on server:', err);
      }
    }

    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== conversationId);
      if (activeId === conversationId) {
        if (remaining.length > 0) {
          setActiveId(remaining[0].id);
        } else {
          handleNewChat();
        }
      }
      return remaining;
    });

    setDeleteModalState({ isOpen: false, conversationId: null, title: '', isDeleting: false });
  };

  // Claim Anonymous Conversations Handler
  const handleClaimConversations = async () => {
    try {
      await apiClaimConversations();
      claimDismissedRef.current = true;
      setClaimModalState({ isOpen: false, unclaimedCount: 0 });
      // Refresh conversation list
      const refreshed = await getConversations();
      if (refreshed.length > 0) {
        setConversations(refreshed);
        setActiveId(refreshed[0].id);
      }
    } catch (err) {
      console.error('Failed to claim conversations:', err);
      setClaimModalState({ isOpen: false, unclaimedCount: 0 });
    }
  };

  const handleDismissClaim = () => {
    claimDismissedRef.current = true;
    setClaimModalState({ isOpen: false, unclaimedCount: 0 });
  };

  // Send Message Handler (Progressive SSE Streaming + Auth Persistence + Multimodal)
  const handleSendMessage = async (text = '', attachments = undefined) => {
    const trimmed = (text || '').trim();
    if (!trimmed && (!attachments || attachments.length === 0)) return;
    if (isGenerating) return;

    setErrorMessage(null);

    const userMessageId = `msg-${Date.now()}-user`;
    const assistantMessageId = `msg-${Date.now()}-assistant`;
    const timestamp = getFormattedTime();

    const userMessage = {
      id: userMessageId,
      role: 'user',
      content: trimmed,
      status: 'complete',
      timestamp,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    };

    const emptyAssistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp,
    };

    const currentMessages = activeConversation?.messages || [];
    const updatedMessages = [...currentMessages, userMessage, emptyAssistantMessage];

    // Check if we should auto-generate an informative title from the first prompt
    const isDefaultTitle =
      !activeConversation?.title ||
      activeConversation.title === 'New Exploration' ||
      activeConversation.title === 'Quantum Computing Principles' ||
      activeConversation.title === 'Python Data Structures Roadmap' ||
      activeConversation.title === 'Sustainable Tech Startup Ideas';

    const newTitle =
      isDefaultTitle && currentMessages.length === 0
        ? generateTitleFromText(trimmed || 'Multimodal Exploration')
        : activeConversation?.title || 'New Exploration';

    // Update conversation in local UI state
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeId) {
          return {
            ...c,
            title: newTitle,
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      })
    );

    // If title was auto-updated and authenticated, persist the new title to MongoDB in background
    if (newTitle !== activeConversation?.title && isAuthenticated && activeId && !activeId.startsWith('conv-')) {
      renameConversation(activeId, newTitle).catch((err) =>
        console.warn('⚠️ Could not update title on server:', err.message)
      );
    }

    // Prepare context to send to Gemini (all previous completed/stopped + current user message)
    const contextHistory = [...currentMessages, userMessage]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      }));

    lastFailedActionRef.current = () => handleSendMessage(text, attachments);

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    setIsGenerating(true);

    try {
      await streamChatMessage(
        {
          messages: contextHistory,
          conversationId: isAuthenticated && activeId && !activeId.startsWith('conv-') ? activeId : undefined,
          isRegenerate: false,
          useKnowledgeBase: useKnowledgeBase && isAuthenticated,
          attachments: attachments && attachments.length > 0 ? attachments : undefined,
        },
        {
          onSources: (sources) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId ? { ...m, sources } : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
          onChunk: (chunk) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + chunk, status: 'streaming' }
                      : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
          onComplete: () => {
            setIsGenerating(false);
            activeAbortControllerRef.current = null;
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId ? { ...m, status: 'complete' } : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
          onError: (err) => {
            console.error('Streaming client error:', err);
            setIsGenerating(false);
            activeAbortControllerRef.current = null;
            setErrorMessage(
              err.message || 'Something went wrong while generating the response. Please try again.'
            );
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId ? { ...m, status: 'error' } : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
        },
        abortController.signal
      );
    } catch (err) {
      if (abortController.signal.aborted) return;
      setIsGenerating(false);
      activeAbortControllerRef.current = null;
      setErrorMessage(
        err.message || 'Something went wrong while generating the response. Please try again.'
      );
    }
  };

  // In-Place Regenerate Handler
  const handleRegenerate = async (assistantMessageId) => {
    if (isGenerating || !activeConversation) return;

    const targetIndex = (activeConversation.messages || []).findIndex(
      (m) => m.id === assistantMessageId
    );
    if (targetIndex === -1) return;

    setErrorMessage(null);

    // Context history BEFORE the assistant response
    const precedingMessages = activeConversation.messages.slice(0, targetIndex);
    const contextHistory = precedingMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    if (contextHistory.length === 0) return;

    // Reset targeted assistant message content and set status to streaming
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeId) {
          const msgs = c.messages.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: '', status: 'streaming', timestamp: getFormattedTime() }
              : m
          );
          return { ...c, messages: msgs };
        }
        return c;
      })
    );

    lastFailedActionRef.current = () => handleRegenerate(assistantMessageId);

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    setIsGenerating(true);

    try {
      await streamChatMessage(
        {
          messages: contextHistory,
          conversationId: isAuthenticated && activeId && !activeId.startsWith('conv-') ? activeId : undefined,
          isRegenerate: true,
          useKnowledgeBase: useKnowledgeBase && isAuthenticated,
        },
        {
          onSources: (sources) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId ? { ...m, sources } : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
          onChunk: (chunk) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + chunk, status: 'streaming' }
                      : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
          onComplete: () => {
            setIsGenerating(false);
            activeAbortControllerRef.current = null;
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId ? { ...m, status: 'complete' } : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
          onError: (err) => {
            console.error('Regeneration streaming error:', err);
            setIsGenerating(false);
            activeAbortControllerRef.current = null;
            setErrorMessage(
              err.message || 'Something went wrong while generating the response. Please try again.'
            );
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id === activeId) {
                  const msgs = (c.messages || []).map((m) =>
                    m.id === assistantMessageId ? { ...m, status: 'error' } : m
                  );
                  return { ...c, messages: msgs };
                }
                return c;
              })
            );
          },
        },
        abortController.signal
      );
    } catch (err) {
      if (abortController.signal.aborted) return;
      setIsGenerating(false);
      activeAbortControllerRef.current = null;
      setErrorMessage(
        err.message || 'Something went wrong while generating the response. Please try again.'
      );
    }
  };

  // Retry Failed Request Handler
  const handleRetry = useCallback(() => {
    if (lastFailedActionRef.current) {
      lastFailedActionRef.current();
    }
  }, []);

  // Select Suggestion
  const handleSelectSuggestion = useCallback((prompt) => {
    handleSendMessage(prompt);
  }, [handleSendMessage]);

  // Feature Notice Modal Trigger (for Phase 6+ features)
  const handleNotice = useCallback((featureName, description) => {
    setNoticeModal({
      isOpen: true,
      title: featureName,
      description,
      phase: 'Phase 6',
      featureName,
    });
  }, []);

  // Modal Open/Close Stable Handlers
  const handleOpenAuth = useCallback(() => {
    setAuthModalState({ isOpen: true, mode: 'login' });
  }, []);

  const handleCloseAuth = useCallback(() => {
    setAuthModalState({ isOpen: false, mode: 'login' });
  }, []);

  const handleCloseRename = useCallback(() => {
    setRenameModalState({ isOpen: false, conversationId: null, currentTitle: '', isSaving: false });
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeleteModalState({ isOpen: false, conversationId: null, title: '', isDeleting: false });
  }, []);

  const handleToggleKnowledgeBase = useCallback(() => {
    if (!isAuthenticated) {
      setAuthModalState({ isOpen: true, mode: 'login' });
    } else {
      setUseKnowledgeBase((prev) => !prev);
    }
  }, [isAuthenticated]);

  return (
    <>
      <MainLayout
        conversations={conversations}
        activeId={activeId}
        activeTitle={activeConversation?.title || 'NOVA AI'}
        isLoadingConversations={isLoadingConversations}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onRenameConversation={handleOpenRename}
        onDeleteConversation={handleOpenDelete}
        onOpenDocuments={handleOpenDocuments}
        onOpenAuth={handleOpenAuth}
        noticeModal={noticeModal}
        setNoticeModal={setNoticeModal}
      >
        <ChatContainer
          conversation={activeConversation}
          isGenerating={isGenerating}
          errorMessage={errorMessage}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onRegenerate={handleRegenerate}
          onSelectSuggestion={handleSelectSuggestion}
          onRetry={lastFailedActionRef.current ? handleRetry : null}
          useKnowledgeBase={useKnowledgeBase}
          onToggleKnowledgeBase={handleToggleKnowledgeBase}
          onOpenDocuments={handleOpenDocuments}
          onNotice={handleNotice}
        />
      </MainLayout>

      {/* Lazy-Loaded Modals with Suspense */}
      <Suspense fallback={null}>
        {/* Document Workspace & AI Analysis Hub Modal (Phase 6) */}
        {isDocumentHubOpen && (
          <DocumentHubModal
            isOpen={isDocumentHubOpen}
            onClose={handleCloseDocuments}
            user={user}
          />
        )}

        {/* Authentication Modal (Login / Register) */}
        {authModalState.isOpen && (
          <AuthModal
            isOpen={authModalState.isOpen}
            initialMode={authModalState.mode}
            onClose={handleCloseAuth}
          />
        )}

        {/* Claim Anonymous Browser Conversations Prompt */}
        {claimModalState.isOpen && (
          <ClaimConversationsModal
            isOpen={claimModalState.isOpen}
            unclaimedCount={claimModalState.unclaimedCount}
            onClaim={handleClaimConversations}
            onDismiss={handleDismissClaim}
          />
        )}

        {/* Rename Conversation Modal */}
        {renameModalState.isOpen && (
          <RenameModal
            isOpen={renameModalState.isOpen}
            currentTitle={renameModalState.currentTitle}
            isSaving={renameModalState.isSaving}
            onClose={handleCloseRename}
            onSave={handleSaveRename}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deleteModalState.isOpen && (
          <DeleteConfirmModal
            isOpen={deleteModalState.isOpen}
            title={deleteModalState.title}
            isDeleting={deleteModalState.isDeleting}
            onClose={handleCloseDelete}
            onConfirm={handleConfirmDelete}
          />
        )}
      </Suspense>
    </>
  );
}

export default App;
