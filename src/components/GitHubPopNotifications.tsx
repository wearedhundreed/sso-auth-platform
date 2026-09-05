import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  Bot,
  ExternalLink,
  X,
  Sparkles,
  Check,
  Trash2,
  RefreshCw,
} from 'lucide-react';

export interface PopNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  badge: string;
  icon: 'rabbit' | 'bot' | 'git' | 'shield' | 'check';
  linkTab?: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  onNavigateTab?: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export const GitHubPopNotifications: React.FC<Props> = ({
  onNavigateTab,
  isOpen,
  onClose,
  onUnreadCountChange,
}) => {
  const [notifications, setNotifications] = useState<PopNotification[]>([]);
  const [activeToasts, setActiveToasts] = useState<PopNotification[]>([]);
  const [seenToastIds, setSeenToastIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'coderabbit' | 'bot' | 'github'>('all');

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data: PopNotification[] = await res.json();
        setNotifications(data);

        const unread = data.filter((n) => !n.read).length;
        if (onUnreadCountChange) {
          onUnreadCountChange(unread);
        }

        // Check for new notifications to pop as toasts
        const newToasts = data.filter((n) => !n.read && !seenToastIds.has(n.id));
        if (newToasts.length > 0) {
          setActiveToasts((prev) => [...newToasts.slice(0, 3), ...prev.slice(0, 2)]);
          setSeenToastIds((prev) => {
            const next = new Set(prev);
            newToasts.forEach((t) => next.add(t.id));
            return next;
          });
        }
      }
    } catch {
      // Fallback silently if offline or refreshing
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleDismissToast = (id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
    markAsRead(id);
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      if (onUnreadCountChange) {
        const unread = notifications.filter((n) => n.id !== id && !n.read).length;
        onUnreadCountChange(unread);
      }
    } catch {
      // Ignore
    }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setActiveToasts([]);
      if (onUnreadCountChange) onUnreadCountChange(0);
    } catch {
      // Ignore
    }
  };

  const clearAll = async () => {
    try {
      await fetch('/api/notifications/clear', { method: 'POST' });
      setNotifications([]);
      setActiveToasts([]);
      if (onUnreadCountChange) onUnreadCountChange(0);
    } catch {
      // Ignore
    }
  };

  const triggerTestPop = async () => {
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'CodeRabbit Bot: All Errors Auto-Fixed',
          message: 'Auto-resolved 3 TypeScript & lint warnings on feature/auth-hardening and approved PR #42.',
          badge: 'CodeRabbit AI',
          icon: 'rabbit',
        }),
      });
      if (res.ok) {
        fetchNotifications();
      }
    } catch {
      // Ignore
    }
  };

  const getIcon = (iconType: string, type: string) => {
    if (type.includes('CODERABBIT') || iconType === 'rabbit') {
      return (
        <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-500/40 text-purple-300 flex items-center justify-center font-bold text-sm">
          🐇
        </div>
      );
    }
    if (type.includes('KOREY') || iconType === 'bot') {
      return (
        <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
          <Bot className="w-4 h-4" />
        </div>
      );
    }
    if (type.includes('AUTH') || iconType === 'git') {
      return (
        <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 text-white flex items-center justify-center">
          <GitBranch className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-950/60 border border-blue-500/40 text-blue-400 flex items-center justify-center">
        <CheckCircle2 className="w-4 h-4" />
      </div>
    );
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'coderabbit') return n.type.includes('CODERABBIT') || n.badge.includes('CodeRabbit');
    if (filter === 'bot') return n.type.includes('KOREY') || n.badge.includes('Korey');
    if (filter === 'github') return n.type.includes('AUTH') || n.type.includes('WEBHOOK');
    return true;
  });

  return (
    <>
      {/* FLOATING POP NOTIFICATION TOASTS (TOP-RIGHT) */}
      <div
        id="github-pop-notification-toasts"
        className="fixed top-20 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {activeToasts.map((toast) => (
          <div
            key={toast.id}
            id={`pop-toast-${toast.id}`}
            className="pointer-events-auto bg-[#121212]/95 border border-[#2a2a2a] hover:border-purple-500/50 rounded-xl p-3.5 shadow-2xl shadow-black/80 backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 duration-300"
          >
            <div className="flex items-start gap-3">
              {getIcon(toast.icon, toast.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[#1c1c1c] text-purple-300 border border-[#333]">
                    {toast.badge}
                  </span>
                  <span className="text-[10px] text-neutral-500">Just now</span>
                </div>
                <h4 className="text-xs font-semibold text-white tracking-tight leading-tight">
                  {toast.title}
                </h4>
                <p className="text-[11px] text-neutral-300 mt-1 leading-normal line-clamp-2">
                  {toast.message}
                </p>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#222]">
                  {toast.linkTab && onNavigateTab && (
                    <button
                      onClick={() => {
                        onNavigateTab(toast.linkTab!);
                        handleDismissToast(toast.id);
                      }}
                      className="text-[11px] font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                    >
                      View in Console <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDismissToast(toast.id)}
                    className="text-[11px] text-neutral-400 hover:text-white ml-auto px-1.5 py-0.5 rounded hover:bg-[#222]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button
                onClick={() => handleDismissToast(toast.id)}
                className="text-neutral-500 hover:text-neutral-300 transition-colors -mr-1 -mt-1 p-1"
                aria-label="Close notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FULL NOTIFICATION CENTER DRAWER */}
      {isOpen && (
        <div
          id="github-notifications-backdrop"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end transition-opacity"
          onClick={onClose}
        >
          <div
            id="github-notifications-panel"
            className="w-full max-w-md bg-[#0a0a0a] border-l border-[#222] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-[#222] flex items-center justify-between bg-[#111]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-950/40 border border-purple-500/30 flex items-center justify-center text-purple-300">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">GitHub Pop Notifications</h3>
                  <p className="text-[11px] text-neutral-400">
                    Real-time CodeRabbit fixes, @Korey bot CI, & GitHub SSO
                  </p>
                </div>
              </div>
              <button
                id="btn-close-notifications-panel"
                onClick={onClose}
                className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-[#222] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions & Filter Pills */}
            <div className="p-3 border-b border-[#1f1f1f] bg-[#0d0d0d] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'coderabbit', label: 'CodeRabbit' },
                  { id: 'bot', label: '@Korey' },
                  { id: 'github', label: 'GitHub SSO' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                      filter === f.id
                        ? 'bg-purple-600 text-white'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#181818]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  id="btn-mark-all-read"
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="p-1.5 rounded text-neutral-400 hover:text-emerald-400 hover:bg-[#1f1f1f] text-[11px] flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  id="btn-clear-notifications"
                  onClick={clearAll}
                  title="Clear all"
                  className="p-1.5 rounded text-neutral-400 hover:text-red-400 hover:bg-[#1f1f1f] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-12 h-12 rounded-full bg-[#181818] border border-[#2a2a2a] text-neutral-500 flex items-center justify-center mx-auto mb-3">
                    <Bell className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-medium text-neutral-300">No Notifications Yet</h4>
                  <p className="text-[11px] text-neutral-500 mt-1 max-w-xs mx-auto">
                    Events triggered by CodeRabbit AI bot, @Korey CI runs, and GitHub webhooks will appear here.
                  </p>
                  <button
                    onClick={triggerTestPop}
                    className="mt-4 px-3 py-1.5 rounded-lg bg-purple-950/60 border border-purple-500/40 text-purple-300 text-xs hover:bg-purple-900/60 transition-colors inline-flex items-center gap-1.5 font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Trigger Test Pop Notification
                  </button>
                </div>
              ) : (
                filteredNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    id={`notif-item-${notif.id}`}
                    onClick={() => markAsRead(notif.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      notif.read
                        ? 'bg-[#111]/70 border-[#222] opacity-80'
                        : 'bg-[#141414] border-purple-500/30 shadow-sm shadow-purple-950/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {getIcon(notif.icon, notif.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[#1c1c1c] text-purple-300 border border-[#333]">
                            {notif.badge}
                          </span>
                          <span className="text-[10px] text-neutral-500">
                            {new Date(notif.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-white mt-1 leading-snug">
                          {notif.title}
                        </h4>
                        <p className="text-[11px] text-neutral-300 mt-1 leading-relaxed">
                          {notif.message}
                        </p>
                        {notif.linkTab && onNavigateTab && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateTab(notif.linkTab!);
                              onClose();
                            }}
                            className="mt-2 text-[11px] font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
                          >
                            Open console <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[#1f1f1f] bg-[#0d0d0d] flex items-center justify-between">
              <button
                id="btn-simulate-pop-notification"
                onClick={triggerTestPop}
                className="text-xs font-medium text-neutral-300 hover:text-purple-400 flex items-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Simulate Pop Notification
              </button>
              <button
                onClick={fetchNotifications}
                className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
