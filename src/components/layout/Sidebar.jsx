import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Sparkles,
  Settings,
  HelpCircle,
  ChevronLeft,
  Trash2,
  Edit2,
  Database,
  LogIn,
  FileText,
  X,
} from 'lucide-react';
import IconButton from '../common/IconButton';
import Tooltip from '../common/Tooltip';
import { useAuth } from '../../context/AuthContext';
import UserProfileMenu from './UserProfileMenu';

function getGroupForDate(dateString) {
  if (!dateString) return 'Today';
  const d = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 Days';
  return 'Older';
}

/**
 * Desktop Sidebar Component
 * @param {{
 *   isCollapsed: boolean,
 *   onToggleCollapse: () => void,
 *   conversations: Array<any>,
 *   activeId: string,
 *   isLoadingConversations?: boolean,
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
export function Sidebar({
  isCollapsed,
  onToggleCollapse,
  conversations,
  activeId,
  isLoadingConversations = false,
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

  // Memoized conversation search filtering
  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const titleMatch = c.title?.toLowerCase().includes(q);
      const contentMatch = c.messages?.some((m) =>
        m.content?.toLowerCase().includes(q)
      );
      return titleMatch || contentMatch;
    });
  }, [conversations, searchQuery]);

  // Memoized date period grouping
  const groups = useMemo(() => [
    {
      label: 'Today',
      items: filteredConversations.filter(
        (c) => getGroupForDate(c.updatedAt || c.createdAt) === 'Today'
      ),
    },
    {
      label: 'Yesterday',
      items: filteredConversations.filter(
        (c) => getGroupForDate(c.updatedAt || c.createdAt) === 'Yesterday'
      ),
    },
    {
      label: 'Previous 7 Days',
      items: filteredConversations.filter(
        (c) => getGroupForDate(c.updatedAt || c.createdAt) === 'Previous 7 Days'
      ),
    },
    {
      label: 'Older',
      items: filteredConversations.filter(
        (c) => getGroupForDate(c.updatedAt || c.createdAt) === 'Older'
      ),
    },
  ], [filteredConversations]);

  return (
    <aside
      className={`hidden lg:flex flex-col h-full border-r border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90 bg-neutral-950 dark:bg-neutral-950 light:bg-neutral-50 transition-all duration-300 relative z-30 shrink-0 select-none ${
        isCollapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 flex items-center justify-between px-3.5 border-b border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 shrink-0 shadow-md shadow-indigo-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-neutral-950 dark:bg-neutral-950 light:bg-white rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
            </div>
          </div>
          {!isCollapsed && (
            <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-neutral-100 to-neutral-400 dark:from-neutral-100 dark:to-neutral-400 light:from-neutral-900 light:to-neutral-700 bg-clip-text text-transparent">
              FAISI AI
            </span>
          )}
        </div>

        {!isCollapsed && (
          <IconButton
            icon={<ChevronLeft className="w-4 h-4" />}
            label="Collapse sidebar"
            tooltip="Collapse"
            size="sm"
            onClick={onToggleCollapse}
          />
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        {isCollapsed ? (
          <IconButton
            icon={<Plus className="w-5 h-5" />}
            label="New Exploration"
            tooltip="New Chat (Ctrl+N)"
            variant="primary"
            size="md"
            className="w-full"
            onClick={onNewChat}
          />
        ) : (
          <button
            type="button"
            onClick={onNewChat}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 font-medium text-xs transition-all active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>New Exploration</span>
            </div>
            <span className="text-[10px] bg-indigo-700/60 px-1.5 py-0.5 rounded border border-indigo-400/30">
              Ctrl+N
            </span>
          </button>
        )}
      </div>

      {/* Search Input (when expanded) */}
      {!isCollapsed && (
        <div className="px-3 mb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full bg-neutral-900/80 dark:bg-neutral-900/80 light:bg-neutral-100 border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-300 rounded-xl pl-8 pr-7 py-1.5 text-xs text-neutral-200 dark:text-neutral-200 light:text-neutral-800 placeholder:text-neutral-500 outline-none focus:border-indigo-500/80 focus-visible:ring-1 focus-visible:ring-indigo-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear conversation search"
                className="absolute right-2.5 text-neutral-400 hover:text-neutral-200 p-0.5 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {isLoadingConversations ? (
          <div className="p-3 text-center text-xs text-neutral-500 space-y-2">
            <div className="w-3/4 h-3 bg-neutral-800 rounded animate-pulse mx-auto" />
            <div className="w-1/2 h-3 bg-neutral-800 rounded animate-pulse mx-auto" />
          </div>
        ) : (
          groups.map((group) => {
            if (group.items.length === 0) return null;

            return (
              <div key={group.label}>
                {!isCollapsed && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-500 light:text-neutral-400">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = item.id === activeId;

                    if (isCollapsed) {
                      return (
                        <Tooltip key={item.id} content={item.title} position="right">
                          <button
                            type="button"
                            onClick={() => onSelectConversation(item.id)}
                            aria-label={item.title}
                            className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                              isActive
                                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                                : 'text-neutral-400 hover:bg-neutral-800/60 dark:hover:bg-neutral-800/60 light:hover:bg-neutral-200'
                            }`}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        aria-selected={isActive}
                        aria-label={`Select conversation: ${item.title}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectConversation(item.id);
                          }
                        }}
                        onClick={() => onSelectConversation(item.id)}
                        className={`group/item flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none ${
                          isActive
                            ? 'bg-neutral-800/90 dark:bg-neutral-800/90 light:bg-neutral-200/90 text-neutral-100 dark:text-neutral-100 light:text-neutral-900 border border-neutral-700/60 dark:border-neutral-700/60 light:border-neutral-300'
                            : 'text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-800/50 dark:hover:bg-neutral-800/40 light:hover:bg-neutral-100 hover:text-neutral-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate pr-1 flex-1 pointer-events-none">
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          <span className="truncate">{item.title}</span>
                        </div>

                        {/* Action buttons on hover */}
                        <div className="flex items-center opacity-0 group-hover/item:opacity-100 transition-opacity gap-0.5 shrink-0">
                          <button
                            type="button"
                            aria-label={`Rename ${item.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRenameConversation(item.id, item.title);
                            }}
                            className="p-1 hover:text-indigo-400 text-neutral-400 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${item.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConversation(item.id, item.title);
                            }}
                            className="p-1 hover:text-red-400 text-neutral-400 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Area: Auth User, Settings, Help & Database Status */}
      <div className="p-2 border-t border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90 space-y-1">
        {/* User Account / Sign In Trigger */}
        {isAuthenticated ? (
          <UserProfileMenu isCompact={isCollapsed} onOpenSettings={onOpenSettings} />
        ) : (
          !isCollapsed && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer mb-1"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In / Register</span>
            </button>
          )
        )}

        {isCollapsed ? (
          <Tooltip content="Document Workspace & AI Analysis" position="right">
            <button
              type="button"
              onClick={onOpenDocuments}
              className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-cyan-400 hover:bg-cyan-500/10 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={onOpenDocuments}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Documents & Analysis</span>
          </button>
        )}

        {!isCollapsed && (
          <>
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-800/50 dark:hover:bg-neutral-800/50 light:hover:bg-neutral-100 hover:text-neutral-200 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              onClick={onOpenHelp}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-400 dark:text-neutral-400 light:text-neutral-600 hover:bg-neutral-800/50 dark:hover:bg-neutral-800/50 light:hover:bg-neutral-100 hover:text-neutral-200 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help & Roadmap</span>
            </button>
          </>
        )}

        {/* Database Persistence Status Pill */}
        <div
          className={`flex items-center gap-2.5 p-2 rounded-xl bg-neutral-900/60 dark:bg-neutral-900/60 light:bg-neutral-100 border border-neutral-800/60 dark:border-neutral-800/60 light:border-neutral-200 ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400 shrink-0">
            <Database className="w-3.5 h-3.5" />
          </div>
          {!isCollapsed && (
            <div className="truncate flex-1">
              <div className="text-xs font-semibold text-neutral-200 dark:text-neutral-200 light:text-neutral-800 truncate">
                MongoDB Persistence
              </div>
              <div className="text-[10px] text-neutral-500 truncate">
                {isAuthenticated ? 'Authenticated Cloud Sync' : 'Local Workspace'}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export const MemoizedSidebar = React.memo(Sidebar);
export default MemoizedSidebar;
