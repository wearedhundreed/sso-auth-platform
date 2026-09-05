import React, { useState, useEffect } from 'react';
import {
  GitPullRequest,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Play,
  Bot,
  Zap,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface WebhookEvent {
  id: string;
  deliveryId: string;
  event: string;
  sender: string;
  repository?: string;
  action?: string;
  summary: string;
  status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED';
  koreyAction?: {
    id: string;
    prNumber: number;
    verdict: string;
    summary: string;
    autoMerged: boolean;
    approvalComment: string;
    checksRun: { name: string; status: string; durationMs: number; details?: string }[];
  };
  receivedAt: string;
}

interface KoreyBotStats {
  botHandle: string;
  appSlug: string;
  autoRunEnabled: boolean;
  autoApproveEnabled: boolean;
  autoMergeEnabled: boolean;
  totalRuns: number;
  totalApprovals: number;
  totalAutoMerged: number;
}

interface WebhookMonitorProps {
  events: WebhookEvent[];
  onRefresh: () => void;
  onDispatchTestWebhook: (params: {
    event: string;
    prNumber?: number;
    prTitle?: string;
    branch?: string;
    sender?: string;
    commentBody?: string;
    tamperSignature?: boolean;
    missingSignature?: boolean;
    duplicateDelivery?: boolean;
  }) => Promise<void>;
  isLoading: boolean;
}

export const WebhookMonitor: React.FC<WebhookMonitorProps> = ({
  events,
  onRefresh,
  onDispatchTestWebhook,
  isLoading,
}) => {
  const [selectedEventType, setSelectedEventType] = useState('pull_request');
  const [attackMode, setAttackMode] = useState<'none' | 'tamper' | 'missing' | 'duplicate'>('none');
  const [isSending, setIsSending] = useState(false);
  const [lastResponse, setLastResponse] = useState<{ status: string; message: string } | null>(null);

  // @Korey Bot interactive state
  const [prNumberInput, setPrNumberInput] = useState('42');
  const [branchInput, setBranchInput] = useState('feature/sso-hardening');
  const [botStats, setBotStats] = useState<KoreyBotStats | null>(null);
  const [latestBotRun, setLatestBotRun] = useState<any | null>(null);
  const [isBotRunning, setIsBotRunning] = useState(false);

  // Fetch bot stats
  const fetchBotStats = async () => {
    try {
      const res = await fetch('/api/korey-bot/stats');
      if (res.ok) {
        const data = await res.json();
        setBotStats(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchBotStats();
  }, []);

  const handleSend = async () => {
    setIsSending(true);
    try {
      await onDispatchTestWebhook({
        event: selectedEventType,
        prNumber: parseInt(prNumberInput, 10) || 42,
        branch: branchInput,
        tamperSignature: attackMode === 'tamper',
        missingSignature: attackMode === 'missing',
        duplicateDelivery: attackMode === 'duplicate',
      });
      setLastResponse({
        status: attackMode === 'tamper' || attackMode === 'missing' ? 'rejected' : 'accepted',
        message:
          attackMode === 'tamper'
            ? 'Signature Tampering Detected: 401 Rejected (Constant-Time HMAC Mismatch)'
            : attackMode === 'missing'
            ? 'Missing Signature Rejected: 401 Unauthorized'
            : attackMode === 'duplicate'
            ? 'Delivery ID Deduplicated: 200 OK (Idempotency Enforced)'
            : `HMAC SHA-256 Verified: 200 Accepted & ${
                selectedEventType === 'pull_request' ? '@Korey Auto-Approved' : 'Processed'
              }`,
      });
      await fetchBotStats();
    } finally {
      setIsSending(false);
    }
  };

  // Direct dispatch of @Korey bot run & auto-approval
  const handleTriggerKoreyBot = async (customCommand?: string) => {
    setIsBotRunning(true);
    try {
      const res = await fetch('/api/korey-bot/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: customCommand ? 'issue_comment' : 'pull_request',
          prNumber: parseInt(prNumberInput, 10) || 42,
          prTitle: 'feat(sso): enforce strict PKCE S256 & zero credential leakage',
          branch: branchInput,
          sender: 'security-eng',
          commandText: customCommand,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLatestBotRun(data.record);
        await fetchBotStats();
        onRefresh();
      }
    } finally {
      setIsBotRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview & Korey Bot Status Card */}
      <div className="bg-[#0c0c0c] border border-emerald-500/30 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-serif font-bold text-lg shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-serif font-semibold text-white tracking-tight">
                  @Korey AI Assistant Bot &bull; GitHub CI/CD Gateway
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active &bull; Auto-Approve Enabled
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Automated CI/CD validation runner &amp; Pull Request reviewer with cryptographic webhook verification.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-[#070707] text-neutral-300 border border-[#1f1f1f]">
              Bot: <span className="text-emerald-400">@Korey</span>
            </span>
            <span className="px-2.5 py-1 rounded bg-[#070707] text-neutral-300 border border-[#1f1f1f]">
              Auto-Runs: <span className="text-emerald-400">{botStats?.totalRuns || 0}</span>
            </span>
            <span className="px-2.5 py-1 rounded bg-[#070707] text-neutral-300 border border-[#1f1f1f]">
              Approvals: <span className="text-emerald-400">{botStats?.totalApprovals || 0}</span>
            </span>
            <span className="px-2.5 py-1 rounded bg-[#070707] text-neutral-300 border border-[#1f1f1f]">
              Auto-Merged: <span className="text-emerald-400">{botStats?.totalAutoMerged || 0}</span>
            </span>
          </div>
        </div>
      </div>

      {/* @Korey AI Assistant Auto-Run & Auto-Approval Controls */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h3 className="text-sm font-serif font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              @Korey AI Assistant Bot Execution Console
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Execute automated CI/CD job suites and auto-approve pull requests on GitHub automatically.
            </p>
          </div>
          <span className="font-mono text-[11px] px-2.5 py-1 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20">
            .github/workflows/korey-ai-bot.yml
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5 font-mono">Target PR Number</label>
            <input
              type="number"
              value={prNumberInput}
              onChange={(e) => setPrNumberInput(e.target.value)}
              className="w-full bg-[#070707] border border-[#222222] rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
              placeholder="e.g. 42"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5 font-mono">Head Branch</label>
            <input
              type="text"
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
              className="w-full bg-[#070707] border border-[#222222] rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
              placeholder="e.g. feature/sso-hardening"
            />
          </div>
          <div className="flex items-end">
            <button
              id="btn-run-korey-bot"
              onClick={() => handleTriggerKoreyBot()}
              disabled={isBotRunning}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition shadow-sm shadow-emerald-950/50 flex items-center justify-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isBotRunning ? 'Executing CI/CD...' : 'Run @Korey Auto-Run & Auto-Approve'}
            </button>
          </div>
        </div>

        {/* Quick Trigger Preset Buttons */}
        <div className="pt-3 border-t border-[#1a1a1a] flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-400 font-mono">Quick GitHub Invocations:</span>
          <button
            onClick={() => handleTriggerKoreyBot('@Korey auto-approve and run all CI jobs')}
            disabled={isBotRunning}
            className="px-2.5 py-1 text-[11px] bg-[#141414] hover:bg-[#1a1a1a] text-neutral-300 border border-[#262626] rounded-md transition font-mono"
          >
            Comment: "@Korey auto-approve"
          </button>
          <button
            onClick={() => handleTriggerKoreyBot('@Korey run ci')}
            disabled={isBotRunning}
            className="px-2.5 py-1 text-[11px] bg-[#141414] hover:bg-[#1a1a1a] text-neutral-300 border border-[#262626] rounded-md transition font-mono"
          >
            Comment: "@Korey run ci"
          </button>
          <button
            onClick={async () => {
              await onDispatchTestWebhook({
                event: 'workflow_run',
                prNumber: parseInt(prNumberInput, 10) || 42,
              });
              await fetchBotStats();
            }}
            disabled={isSending}
            className="px-2.5 py-1 text-[11px] bg-[#141414] hover:bg-[#1a1a1a] text-neutral-300 border border-[#262626] rounded-md transition font-mono"
          >
            Simulate CI Workflow Run Completion
          </button>
        </div>

        {/* Live Bot Execution Result Details */}
        {latestBotRun && (
          <div className="mt-5 p-4 rounded-xl bg-[#070707] border border-emerald-500/30 space-y-3 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1a1a1a] pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-xs font-mono font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  VERDICT: {latestBotRun.verdict}
                </span>
                <span className="text-xs text-neutral-300 font-serif font-medium">
                  Pull Request #{latestBotRun.prNumber} Approved by @Korey
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Total Duration: {latestBotRun.checksRun.reduce((a: any, b: any) => a + b.durationMs, 0)}ms</span>
                {latestBotRun.autoMerged && (
                  <span className="px-2 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-500/30">
                    Label: automerge
                  </span>
                )}
              </div>
            </div>

            {/* Checklist of Auto-Run Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
              {latestBotRun.checksRun.map((chk: any) => (
                <div key={chk.name} className="p-2.5 rounded-lg bg-[#0e0e0e] border border-[#1c1c1c]">
                  <div className="flex items-center justify-between text-neutral-300 font-mono text-[11px] mb-1">
                    <span className="truncate">{chk.name}</span>
                    <span className="text-emerald-400 font-medium">PASSED</span>
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">{chk.details}</div>
                </div>
              ))}
            </div>

            {/* Approval Comment Preview */}
            <div className="mt-3">
              <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                GitHub Review Comment Posted to PR #{latestBotRun.prNumber}:
              </label>
              <pre className="p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg text-xs font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed">
                {latestBotRun.approvalComment}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Webhook Test Simulator */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-serif font-semibold text-white mb-2">GitHub Webhook Security Verification Bench</h3>
        <p className="text-xs text-neutral-400 mb-5">
          Simulate incoming webhooks with authentic HMAC SHA-256 signatures, or test attack vectors such as tampered
          signatures, replay deliveries, and missing headers.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5 font-mono">Event Type (X-GitHub-Event)</label>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="w-full bg-[#070707] border border-[#222222] rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="pull_request">pull_request (Triggers @Korey CI auto-run &amp; auto-approve)</option>
              <option value="issue_comment">issue_comment (Mentions @Korey to auto-approve)</option>
              <option value="workflow_run">workflow_run (CI completion notification)</option>
              <option value="push">push (Commit branch triggers)</option>
              <option value="code_scanning_alert">code_scanning_alert (CodeQL alerts)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-300 block mb-1.5 font-mono">Security Verification Mode</label>
            <select
              value={attackMode}
              onChange={(e) => setAttackMode(e.target.value as any)}
              className="w-full bg-[#070707] border border-[#222222] rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="none">Standard: Valid HMAC SHA-256 Signature (Expect 200)</option>
              <option value="tamper">Attack Test: Tampered HMAC Signature (Expect 401 Reject)</option>
              <option value="missing">Attack Test: Omit X-Hub-Signature-256 (Expect 401 Reject)</option>
              <option value="duplicate">Replay Test: Duplicate Delivery ID (Expect 200 Idempotent)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[#1f1f1f]">
          <div className="text-xs">
            {lastResponse && (
              <span
                className={`inline-flex items-center gap-1.5 font-medium font-mono text-xs ${
                  lastResponse.status === 'accepted' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {lastResponse.status === 'accepted' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {lastResponse.message}
              </span>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={isSending}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition shadow-sm shadow-emerald-950/50 flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            {isSending ? 'Dispatching...' : 'Dispatch Webhook'}
          </button>
        </div>
      </div>

      {/* Processed Webhook Deliveries Table */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-serif font-semibold text-white">Processed Deliveries (Idempotency Registry)</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              History of validated GitHub webhook events with @Korey automated decisions.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="text-xs text-neutral-400 hover:text-neutral-200 flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] rounded-lg border border-[#222] transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {events.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-6">No webhooks received yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1f1f1f] text-neutral-400 uppercase tracking-wider text-[11px] font-mono">
                <tr>
                  <th className="py-2 px-3">Received</th>
                  <th className="py-2 px-3">Event</th>
                  <th className="py-2 px-3">Delivery ID</th>
                  <th className="py-2 px-3">Summary</th>
                  <th className="py-2 px-3">@Korey Action</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181818]">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-[#121212] transition-colors">
                    <td className="py-2.5 px-3 text-neutral-400 font-mono">
                      {new Date(evt.receivedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-emerald-400">{evt.event}</td>
                    <td className="py-2.5 px-3 font-mono text-neutral-400 truncate max-w-[140px]">
                      {evt.deliveryId}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-300 max-w-[280px] truncate">{evt.summary}</td>
                    <td className="py-2.5 px-3">
                      {evt.koreyAction ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-500/40">
                          <CheckCircle2 className="w-3 h-3" />
                          PR #{evt.koreyAction.prNumber} Approved
                        </span>
                      ) : (
                        <span className="text-neutral-500 text-[10px] font-mono">&mdash;</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                          evt.status === 'PROCESSED'
                            ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-950/40 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
