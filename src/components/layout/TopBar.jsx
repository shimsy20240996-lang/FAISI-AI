import React from 'react';
import { Menu, PanelLeft, Sun, Moon, HelpCircle, Settings, LogIn, FileText } from 'lucide-react';
import IconButton from '../common/IconButton';
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
 *   onOpenModelSelector?: () => void,
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
      <div className="flex items-center gap-2 min-w-0">
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

        {/* Active Conversation Title */}
        {activeTitle && activeTitle !== 'FAISI AI' && activeTitle !== 'SABU AI' && activeTitle !== 'New Exploration' && (
          <div className="flex items-center pl-1 max-w-[200px] sm:max-w-[320px] lg:max-w-[420px] truncate text-xs font-semibold text-neutral-300 dark:text-neutral-300 light:text-neutral-700">
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
