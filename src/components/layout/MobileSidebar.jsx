import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Search,
  MessageSquare,
  Sparkles,
  Settings,
  HelpCircle,
  Trash2,
  Edit2,
  LogIn,
  FileText,
} from 'lucide-react';
import IconButton from '../common/IconButton';
import { useAuth } from '../../context/AuthContext';
import UserProfileMenu from './UserProfileMenu';

/**
 * Mobile Off-Canvas Drawer Sidebar
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   conversations: Array<any>,
 *   activeId: string,
 *   onSelectConversation: (id: string) => void,
 *   onNewChat: () => void,
 *   onRenameConversation: (id: string, currentTitle: string) => void,
 *   onDeleteConversation: (id: string, title: string) => void,
 *   onOpenSettings: () => void,
 *   onOpenHelp: () => void,
 *   onOpenDocuments?: () => void,
 *   onOpenAuth?: () => void,
 * }} props
 */
export function MobileSidebar({
  isOpen,
  onClose,
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  onOpenSettings,
  onOpenHelp,
  onOpenDocuments,
  onOpenAuth,
}) {
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const titleMatch = c.title?.toLowerCase().includes(q);
    const contentMatch = c.messages?.some((m) =>
      m.content?.toLowerCase().includes(q)
    );
    return titleMatch || contentMatch;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Drawer Container */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 240 }}
            className="relative w-[280px] max-w-[85vw] h-full bg-neutral-950 dark:bg-neutral-950 light:bg-neutral-50 border-r border-neutral-800 dark:border-neutral-800 light:border-neutral-200 flex flex-col z-10 shadow-2xl"
          >
            {/* Drawer Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 flex items-center justify-center">
                  <div className="w-full h-full bg-neutral-950 dark:bg-neutral-950 light:bg-white rounded-[10px] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
                  </div>
                </div>
                <span className="font-extrabold text-base tracking-tight text-neutral-100 dark:text-neutral-100 light:text-neutral-900">
                  SABU AI
                </span>
              </div>
              <IconButton
                icon={<X className="w-5 h-5" />}
                label="Close sidebar menu"
                onClick={onClose}
                size="md"
              />
            </div>

            {/* New Chat Button */}
            <div className="p-3">
              <button
                type="button"
                onClick={() => {
                  onNewChat();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Exploration</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="px-3 mb-2">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  aria-label="Search conversations"
                  className="w-full bg-neutral-900/80 dark:bg-neutral-900/80 light:bg-neutral-100 border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-300 rounded-xl pl-8 pr-7 py-2 text-xs text-neutral-200 dark:text-neutral-200 light:text-neutral-800 placeholder:text-neutral-500 outline-none focus:border-indigo-500/80 focus-visible:ring-1 focus-visible:ring-indigo-500/50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear conversation search"
                    className="absolute right-2.5 text-neutral-400 hover:text-neutral-200 p-1 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              {filteredConversations.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectConversation(item.id);
                      onClose();
                    }}
                    className={`flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-neutral-800/90 dark:bg-neutral-800/90 light:bg-neutral-200/90 text-neutral-100 dark:text-neutral-100 light:text-neutral-900 border border-neutral-700/60 dark:border-neutral-700/60 light:border-neutral-300'
                        : 'text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-800/50 dark:hover:bg-neutral-800/40 light:hover:bg-neutral-100 hover:text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-1 flex-1">
                      <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="truncate">{item.title}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Rename ${item.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose();
                          onRenameConversation(item.id, item.title);
                        }}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center p-1.5 text-neutral-400 hover:text-indigo-400 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${item.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose();
                          onDeleteConversation(item.id, item.title);
                        }}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center p-1.5 text-neutral-400 hover:text-red-400 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500/80 focus-visible:outline-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Controls */}
            <div className="p-3 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90 space-y-1">
              {isAuthenticated ? (
                <div className="mb-2">
                  <UserProfileMenu onOpenSettings={onOpenSettings} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAuth?.();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl bg-indigo-600 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 mb-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In / Register</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDocuments?.();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-500/80 focus-visible:outline-none"
              >
                <FileText className="w-4 h-4" />
                <span>Documents & Analysis</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-800/50 hover:text-neutral-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHelp();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-800/50 hover:text-neutral-200 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Help & Roadmap</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default MobileSidebar;
