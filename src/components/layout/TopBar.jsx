import React from 'react';
import { Menu, PanelLeft, Sun, Moon, Sparkles, HelpCircle, Settings, ChevronDown, LogIn, FileText } from 'lucide-react';
import IconButton from '../common/IconButton';
import Badge from '../common/Badge';
import { useAuth } from '../../context/AuthContext';
import UserProfileMenu from './UserProfileMenu';

/**
 * TopBar Component
 * @param {{
 *   onToggleSidebar: () => void,
 *   onOpenMobileSidebar: () => void,
 *   isSidebarCollapsed: boolean,
 *   activeTitle: string,
 *   theme: 'dark' | 'light',
 *   onToggleTheme: () => void,
 *   onOpenSettings: () => void,
 *   onOpenHelp: () => void,
 *   onOpenModelSelector: () => void,
 *   onOpenDocuments?: () => void,
 *   onOpenAuth?: () => void,
 * }} props
 */
export function TopBar({
  onToggleSidebar,
  onOpenMobileSidebar,
  isSidebarCollapsed,
  activeTitle = 'New Exploration',
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenHelp,
  onOpenModelSelector,
  onOpenDocuments,
  onOpenAuth,
}) {
  const { user, isAuthenticated } = useAuth();

  return (
    <header className="h-14 border-b border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90 bg-neutral-950/80 dark:bg-neutral-950/80 light:bg-white/80 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between z-20 shrink-0 select-none">
      {/* Left Area: Toggle & Title */}
      <div className="flex items-center gap-2">
        {/* Mobile Hamburger */}
        <div className="lg:hidden">
          <IconButton
            icon={<Menu className="w-5 h-5" />}
            label="Open navigation sidebar"
            onClick={onOpenMobileSidebar}
            size="sm"
          />
        </div>

        {/* Desktop Sidebar Toggle */}
        <div className="hidden lg:block">
          <IconButton
            icon={<PanelLeft className="w-4 h-4" />}
            label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            tooltip={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleSidebar}
            size="sm"
          />
        </div>

        {/* Model Selector Pill */}
        <button
          type="button"
          onClick={onOpenModelSelector}
          className="flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 min-h-[44px] sm:min-h-[32px] rounded-xl bg-neutral-900/90 dark:bg-neutral-900/90 light:bg-neutral-100 hover:bg-neutral-800/80 dark:hover:bg-neutral-800/80 light:hover:bg-neutral-200 border border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-300 transition-colors text-xs font-medium text-neutral-200 dark:text-neutral-200 light:text-neutral-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
          aria-label="Select AI Model"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Gemini 3.6 Flash</span>
          <Badge variant="success" className="text-[10px] py-0 px-1.5 hidden sm:inline-flex">
            Live AI
          </Badge>
          <ChevronDown className="w-3 h-3 text-neutral-400 ml-0.5" />
        </button>

        {/* Active Conversation Title breadcrumb */}
        {activeTitle && activeTitle !== 'SABU AI' && activeTitle !== 'New Exploration' && (
          <div className="hidden md:flex items-center gap-2 pl-2 max-w-[200px] lg:max-w-[280px] truncate text-xs font-medium text-neutral-400 dark:text-neutral-400 light:text-neutral-600">
            <span className="text-neutral-600 dark:text-neutral-600 light:text-neutral-400 select-none">/</span>
            <span className="truncate">{activeTitle}</span>
          </div>
        )}
      </div>

      {/* Right Area: Auth Profile, Utility Actions & Theme Toggle */}
      <div className="flex items-center gap-1.5">
        {/* Documents & Analysis Workspace */}
        <IconButton
          icon={<FileText className="w-4 h-4 text-cyan-400" />}
          label="Document Workspace & AI Analysis"
          tooltip="Documents & Analysis"
          size="sm"
          onClick={onOpenDocuments}
        />

        {/* Help & Shortcuts */}
        <IconButton
          icon={<HelpCircle className="w-4 h-4" />}
          label="Help & Roadmap"
          tooltip="Help & Shortcuts"
          size="sm"
          onClick={onOpenHelp}
        />

        {/* Theme Toggle Button */}
        <IconButton
          icon={
            theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600" />
            )
          }
          label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          tooltip={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          size="sm"
          onClick={onToggleTheme}
        />

        {/* Settings Button */}
        <IconButton
          icon={<Settings className="w-4 h-4" />}
          label="Workspace Settings"
          tooltip="Settings"
          size="sm"
          onClick={onOpenSettings}
        />

        {/* User Auth Profile / Sign In Button */}
        {isAuthenticated ? (
          <div className="pl-1 border-l border-neutral-800/80 dark:border-neutral-800/80 light:border-neutral-200/90">
            <UserProfileMenu isCompact={true} onOpenSettings={onOpenSettings} />
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3.5 sm:px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-[32px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer ml-1 focus-visible:ring-2 focus-visible:ring-indigo-500/80 focus-visible:outline-none"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}

export default TopBar;
