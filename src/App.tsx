import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ApplicationsView } from './components/ApplicationsView';
import { WebhookMonitor } from './components/WebhookMonitor';
import { AuditLogView } from './components/AuditLogView';
import { SecuritySpecView } from './components/SecuritySpecView';
import { AuthErrorModal } from './components/AuthErrorModal';
import { CodeRabbitConsole } from './components/CodeRabbitConsole';
import { GitHubPopNotifications } from './components/GitHubPopNotifications';
import { GoogleDriveView } from './components/GoogleDriveView';
import { testFirestoreConnection } from './lib/firebase';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [botSubTab, setBotSubTab] = useState<'coderabbit' | 'korey_and_webhooks'>('coderabbit');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [session, setSession] = useState<{
    authenticated: boolean;
    user?: {
      userId: string;
      name: string;
      email: string;
      roles: string[];
      expiresAt: number;
    };
  }>({ authenticated: false });

  const [applications, setApplications] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; code: string }>({
    isOpen: false,
    code: 'access_denied',
  });

  // Fetch active session profile
  const fetchSession = async () => {
    try {
      const res = await fetch('/api/session');
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch {
      // Ignore network errors in initial state
    }
  };

  // Fetch registered applications
  const fetchApplications = async () => {
    try {
      const res = await fetch('/api/applications');
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch {
      // fallback
    }
  };

  // Fetch security audit logs
  const fetchAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Fetch webhook event history
  const fetchWebhookEvents = async () => {
    try {
      const res = await fetch('/api/webhook-events');
      if (res.ok) {
        const data = await res.json();
        setWebhookEvents(data.events || []);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    testFirestoreConnection();
    fetchSession();
    fetchApplications();
    fetchAuditLogs();
    fetchWebhookEvents();

    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) {
      setErrorModal({ isOpen: true, code: err });
    }
  }, []);

  const handleSimulateLogin = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/test/simulate-sso-login', { method: 'POST' });
      if (res.ok) {
        await fetchSession();
        await fetchAuditLogs();
      }
    } finally {
      setIsSimulating(false);
    }
  };

  const handleLogout = async () => {
    window.location.href = '/auth/logout';
  };

  const handleTestAppSSO = (app: any) => {
    const callbackUri = app.redirectUris[0] || 'http://localhost:3000/auth/callback';
    window.location.href = `/login?client_id=${encodeURIComponent(
      app.clientId
    )}&redirect_uri=${encodeURIComponent(callbackUri)}`;
  };

  const handleDispatchTestWebhook = async (params: {
    event: string;
    tamperSignature?: boolean;
    missingSignature?: boolean;
    duplicateDelivery?: boolean;
  }) => {
    const res = await fetch('/api/test/simulate-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    await fetchWebhookEvents();
    await fetchAuditLogs();

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Webhook rejected');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e5e5] font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAuthenticated={session.authenticated}
        userEmail={session.user?.email}
        onLogout={handleLogout}
        unreadNotificationsCount={unreadCount}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            isAuthenticated={session.authenticated}
            user={session.user}
            onSimulateLogin={handleSimulateLogin}
            onLogout={handleLogout}
            isSimulating={isSimulating}
          />
        )}

        {activeTab === 'drive' && <GoogleDriveView />}

        {activeTab === 'applications' && (
          <ApplicationsView applications={applications} onTestAppSSO={handleTestAppSSO} />
        )}

        {activeTab === 'webhooks' && (
          <div className="space-y-6">
            {/* Subtab Switcher */}
            <div className="flex items-center justify-between border-b border-[#222] pb-3">
              <div className="flex items-center gap-2">
                <button
                  id="tab-sub-coderabbit"
                  onClick={() => setBotSubTab('coderabbit')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                    botSubTab === 'coderabbit'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950/50'
                      : 'bg-[#121212] text-neutral-400 hover:text-white border border-[#222]'
                  }`}
                >
                  <span>🐇</span>
                  <span>CodeRabbit AI Bot &amp; GitHub Auth</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-950/80 text-purple-300 border border-purple-500/30">
                    Auto-Fix
                  </span>
                </button>

                <button
                  id="tab-sub-korey"
                  onClick={() => setBotSubTab('korey_and_webhooks')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                    botSubTab === 'korey_and_webhooks'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                      : 'bg-[#121212] text-neutral-400 hover:text-white border border-[#222]'
                  }`}
                >
                  <span>🤖</span>
                  <span>@Korey CI/CD Bot &amp; Webhooks</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                    Auto-Approve
                  </span>
                </button>
              </div>

              <span className="text-xs text-neutral-500 hidden sm:inline-block font-mono">
                Real-time GitHub Webhook &amp; Autonomous Bots
              </span>
            </div>

            {botSubTab === 'coderabbit' ? (
              <CodeRabbitConsole
                onNotify={() => {
                  fetchAuditLogs();
                }}
                onGitHubLoginSuccess={(s) => {
                  setSession({
                    authenticated: true,
                    user: s?.user || {
                      userId: 'github_user',
                      name: 'GitHub SSO User',
                      email: 'user@github.com',
                      roles: ['ROLE_USER', 'ROLE_GITHUB_SSO_USER'],
                      expiresAt: Date.now() + 3600 * 1000,
                    },
                  });
                  fetchAuditLogs();
                }}
              />
            ) : (
              <WebhookMonitor
                events={webhookEvents}
                onRefresh={fetchWebhookEvents}
                onDispatchTestWebhook={handleDispatchTestWebhook}
                isLoading={false}
              />
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <AuditLogView logs={auditLogs} onRefresh={fetchAuditLogs} isLoading={isLoadingLogs} />
        )}

        {activeTab === 'architecture' && <SecuritySpecView />}
      </main>

      <GitHubPopNotifications
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'webhooks') setBotSubTab('coderabbit');
        }}
        onUnreadCountChange={setUnreadCount}
      />

      <AuthErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ ...errorModal, isOpen: false })}
        errorCode={errorModal.code}
      />
    </div>
  );
}
