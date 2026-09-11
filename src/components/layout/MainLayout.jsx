import React, { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';
import TopBar from './TopBar';
import SettingsModal from '../modals/SettingsModal';
import HelpModal from '../modals/HelpModal';
import ModelSelectorModal from '../modals/ModelSelectorModal';
import FeatureNoticeModal from '../modals/FeatureNoticeModal';
import useSidebar from '../../hooks/useSidebar';
import useTheme from '../../hooks/useTheme';

/**
 * MainLayout Component
 * High-level layout orchestrating responsive navigation, top bar, modals, and main workspace.
 */
export function MainLayout({
  children,
  conversations,
  activeId,
  activeTitle,
  isLoadingConversations = false,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  onOpenDocuments,
  onOpenAuth,
  noticeModal,
  setNoticeModal,
}) {
  const { isCollapsed, isMobileOpen, toggleCollapse, toggleMobile, closeMobile } =
    useSidebar();
  const { theme, setTheme, toggleTheme } = useTheme();

  // Modal visibility states with stable handlers
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
  const handleOpenHelp = useCallback(() => setIsHelpOpen(true), []);
  const handleCloseHelp = useCallback(() => setIsHelpOpen(false), []);
  const handleOpenModelSelector = useCallback(() => setIsModelSelectorOpen(true), []);
  const handleCloseModelSelector = useCallback(() => setIsModelSelectorOpen(false), []);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-neutral-950 dark:bg-neutral-950 light:bg-neutral-50 text-neutral-100 dark:text-neutral-100 light:text-neutral-900 selection:bg-indigo-500 selection:text-white">
      {/* Desktop Collapsible Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        conversations={conversations}
        activeId={activeId}
        isLoadingConversations={isLoadingConversations}
        onSelectConversation={onSelectConversation}
        onNewChat={onNewChat}
        onRenameConversation={onRenameConversation}
        onDeleteConversation={onDeleteConversation}
        onOpenSettings={handleOpenSettings}
        onOpenHelp={handleOpenHelp}
        onOpenDocuments={onOpenDocuments}
        onOpenAuth={onOpenAuth}
      />

      {/* Mobile Off-Canvas Sidebar */}
      <MobileSidebar
        isOpen={isMobileOpen}
        onClose={closeMobile}
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={onSelectConversation}
        onNewChat={onNewChat}
        onRenameConversation={onRenameConversation}
        onDeleteConversation={onDeleteConversation}
        onOpenSettings={handleOpenSettings}
        onOpenHelp={handleOpenHelp}
        onOpenDocuments={onOpenDocuments}
        onOpenAuth={onOpenAuth}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Bar */}
        <TopBar
          onToggleSidebar={toggleCollapse}
          onOpenMobileSidebar={toggleMobile}
          isSidebarCollapsed={isCollapsed}
          activeTitle={activeTitle}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={handleOpenSettings}
          onOpenHelp={handleOpenHelp}
          onOpenModelSelector={handleOpenModelSelector}
          onOpenDocuments={onOpenDocuments}
          onOpenAuth={onOpenAuth}
        />

        {/* Chat / Content View */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {children}
        </div>
      </div>

      {/* Modals & Dialogs */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        theme={theme}
        setTheme={setTheme}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={handleCloseHelp}
      />

      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={handleCloseModelSelector}
      />

      {noticeModal && (
        <FeatureNoticeModal
          isOpen={noticeModal.isOpen}
          onClose={() => setNoticeModal(null)}
          title={noticeModal.title}
          description={noticeModal.description}
          phase={noticeModal.phase}
          featureName={noticeModal.featureName}
        />
      )}
    </div>
  );
}

export default MainLayout;
