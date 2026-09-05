import React from 'react';
import { Shield, KeyRound, Bell, Github } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAuthenticated: boolean;
  userEmail?: string;
  onLogout: () => void;
  unreadNotificationsCount?: number;
  onOpenNotifications?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isAuthenticated,
  userEmail,
  onLogout,
  unreadNotificationsCount = 0,
  onOpenNotifications,
}) => {
  return (
    <header className="border-b border-[#1f1f1f] bg-[#0a0a0a]/90 sticky top-0 z-30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#121212] border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-950/40">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-semibold text-white tracking-tight text-base sm:text-lg">Enterprise SSO Platform</span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium tracking-wide bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 rounded-full uppercase">
                  OIDC &bull; PKCE
                </span>
              </div>
              <p className="text-xs text-neutral-400 hidden sm:block">
                Federated Identity &bull; GitHub Preferred Auth &bull; CodeRabbit AI
              </p>
            </div>
          </div>

          {/* Navigation tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'drive', label: 'Google Drive' },
              { id: 'applications', label: 'Applications' },
              { id: 'webhooks', label: 'GitHub & AI Bots' },
              { id: 'audit', label: 'Security Audit' },
              { id: 'architecture', label: 'Architecture & CI/CD' },
            ].map((tab) => (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/50'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#141414]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Session controls & Notifications */}
          <div className="flex items-center gap-2.5">
            {/* GitHub Pop Notifications Bell */}
            <button
              id="btn-header-notifications-bell"
              onClick={onOpenNotifications}
              aria-label="GitHub Pop Notifications"
              className="relative p-2 rounded-xl bg-[#141414] border border-[#222] text-neutral-300 hover:text-white hover:border-purple-500/40 transition-colors"
              title="GitHub Pop Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-mono font-bold flex items-center justify-center animate-pulse">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-medium text-neutral-200 truncate max-w-[140px]">{userEmail}</span>
                  <span className="text-[10px] text-emerald-400 flex items-center justify-end gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Authenticated
                  </span>
                </div>
                <button
                  id="btn-header-logout"
                  onClick={onLogout}
                  className="px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 rounded-lg transition"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <a
                href="/login"
                id="btn-header-login"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition shadow-sm shadow-emerald-950/50"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Initiate SSO
              </a>
            )}
          </div>
        </div>

        {/* Mobile Nav Bar */}
        <div className="flex md:hidden overflow-x-auto py-2 border-t border-[#1f1f1f] space-x-1">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'drive', label: 'Google Drive' },
            { id: 'applications', label: 'Applications' },
            { id: 'webhooks', label: 'GitHub & Bots' },
            { id: 'audit', label: 'Audit' },
            { id: 'architecture', label: 'Architecture' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 whitespace-nowrap rounded-md text-xs font-medium ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
