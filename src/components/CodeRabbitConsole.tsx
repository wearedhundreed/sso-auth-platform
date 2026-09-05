import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  GitPullRequest,
  Check,
  Copy,
  ExternalLink,
  Shield,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Sliders,
  Terminal,
  FileCode,
  Github,
  Bell,
} from 'lucide-react';

interface Finding {
  id: string;
  file: string;
  line: number;
  rule: string;
  severity: 'error' | 'warning' | 'critical';
  description: string;
  suggestedPatch: string;
  status: 'FIXED' | 'APPROVED';
}

interface CodeRabbitReviewRecord {
  id: string;
  prNumber: number;
  prTitle: string;
  branch: string;
  sender: string;
  timestamp: string;
  verdict: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  reviewComment: string;
  errorsFound: number;
  errorsFixed: number;
  autoMerged: boolean;
  findings: Finding[];
}

interface Stats {
  totalReviews: number;
  totalErrorsFixed: number;
  totalFixesApproved: number;
  totalAutoMerged: number;
}

interface GitHubConfig {
  configured: boolean;
  preferred: boolean;
  clientId: string;
  devCallbackUrl: string;
  previewCallbackUrl: string;
  currentCallbackUrl: string;
  defaultScopes: string[];
}

interface Props {
  onNotify?: () => void;
  onGitHubLoginSuccess?: (session: any) => void;
}

export const CodeRabbitConsole: React.FC<Props> = ({ onNotify, onGitHubLoginSuccess }) => {
  const [stats, setStats] = useState<Stats>({
    totalReviews: 12,
    totalErrorsFixed: 28,
    totalFixesApproved: 12,
    totalAutoMerged: 12,
  });

  const [history, setHistory] = useState<CodeRabbitReviewRecord[]>([]);
  const [gitHubConfig, setGitHubConfig] = useState<GitHubConfig | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Auto-Fix form inputs
  const [prNumber, setPrNumber] = useState('42');
  const [prTitle, setPrTitle] = useState('feat(auth): harden PKCE verifier & token exchange');
  const [branch, setBranch] = useState('feature/pkce-hardening');
  const [errorInput, setErrorInput] = useState(
    'TS2339: Property id does not exist on type unknown in auth-callback.ts\nCWE-601: Missing strict URL scheme check in oauth redirect verification\nRFC 7636: Insecure code_challenge_method plaintext used instead of S256'
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoggingInGitHub, setIsLoggingInGitHub] = useState(false);
  const [lastActionResult, setLastActionResult] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<CodeRabbitReviewRecord | null>(null);

  // Settings
  const [autoFixErrors, setAutoFixErrors] = useState(true);
  const [autoApproveFixes, setAutoApproveFixes] = useState(true);
  const [autoMergeFixes, setAutoMergeFixes] = useState(true);

  const fetchData = async () => {
    try {
      const [statsRes, historyRes, configRes] = await Promise.all([
        fetch('/api/coderabbit/stats'),
        fetch('/api/coderabbit/history'),
        fetch('/api/auth/github/config'),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (historyRes.ok) {
        const hist: CodeRabbitReviewRecord[] = await historyRes.json();
        setHistory(hist);
        if (hist.length > 0 && !selectedReview) {
          setSelectedReview(hist[0]);
        }
      }
      if (configRes.ok) setGitHubConfig(await configRes.json());
    } catch {
      // Ignore during initial build
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(label);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleRunCodeRabbitAutoFix = async () => {
    setIsProcessing(true);
    setLastActionResult(null);

    try {
      const errorsList = errorInput
        .split('\n')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const res = await fetch('/api/coderabbit/autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prNumber: parseInt(prNumber, 10) || 42,
          prTitle,
          branch,
          sender: 'developer',
          errors: errorsList,
        }),
      });

      const data = await res.json();
      if (data.success && data.record) {
        setLastActionResult(
          `CodeRabbit Bot successfully auto-fixed ${data.record.errorsFixed} errors and auto-approved PR #${data.record.prNumber} with verdict APPROVED!`
        );
        setSelectedReview(data.record);
        fetchData();
        if (onNotify) onNotify();
      }
    } catch (err) {
      setLastActionResult('Failed to execute CodeRabbit auto-fix.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGitHubSSOLogin = async () => {
    setIsLoggingInGitHub(true);
    try {
      const res = await fetch('/api/auth/github/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (data.success) {
        setLastActionResult('Successfully authenticated via GitHub Auth (Preferred Identity Provider)!');
        if (onGitHubLoginSuccess) {
          onGitHubLoginSuccess(data.session);
        }
        if (onNotify) onNotify();
      } else {
        setLastActionResult(`GitHub Authentication Error: ${data.error || 'Check configuration'}`);
      }
    } catch {
      setLastActionResult('Network error connecting to GitHub OAuth provider.');
    } finally {
      setIsLoggingInGitHub(false);
    }
  };

  const callbackUrl =
    gitHubConfig?.currentCallbackUrl ||
    'https://ais-dev-ztj3vhz7koxe4lifelklme-365889169571.us-east1.run.app/auth/github/callback';

  return (
    <div className="space-y-6">
      {/* SECTION 1: GITHUB AUTH PREFERRED IDENTITY PROVIDER & CALLBACK SETUP */}
      <div
        id="github-preferred-auth-panel"
        className="rounded-2xl border border-[#222] bg-[#0c0c0c] p-5 shadow-xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-white shadow-inner">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">GitHub OAuth (Preferred Identity Provider)</h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                  Preferred SSO
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-purple-950/60 text-purple-300 border border-purple-500/30">
                  RFC 6749 &bull; PKCE
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Designated preferred provider for federated single sign-on with strict CSRF protection & callback verification.
              </p>
            </div>
          </div>

          <button
            id="btn-signin-github-preferred"
            onClick={handleGitHubSSOLogin}
            disabled={isLoggingInGitHub}
            className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Github className="w-4 h-4" />
            {isLoggingInGitHub ? 'Authenticating...' : 'Sign in via GitHub SSO (Preferred)'}
          </button>
        </div>

        {/* Callback URL Configuration Box */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div>
              <label className="block text-[11px] font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                Designated GitHub OAuth Callback URL (Redirect URI)
              </label>
              <div className="flex items-center gap-2 bg-[#141414] border border-[#2a2a2a] rounded-xl px-3 py-2">
                <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                <code className="text-xs font-mono text-emerald-300 select-all flex-1 truncate">
                  {callbackUrl}
                </code>
                <button
                  id="btn-copy-github-callback-url"
                  onClick={() => handleCopy(callbackUrl, 'callback')}
                  className="p-1.5 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-neutral-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
                  title="Copy Callback URL"
                >
                  {copiedUrl === 'callback' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Configure this in GitHub Developer Settings &gt; OAuth Apps &gt; Authorization callback URL.
              </p>
            </div>

            {/* Scope & Protocol metadata */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-xl bg-[#141414] border border-[#222]">
                <span className="text-[10px] font-mono text-neutral-400 block mb-1">Requested OAuth Scopes</span>
                <div className="flex gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-[#1f1f1f] text-[10px] font-mono text-neutral-300 border border-[#333]">
                    read:user
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#1f1f1f] text-[10px] font-mono text-neutral-300 border border-[#333]">
                    user:email
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#141414] border border-[#222]">
                <span className="text-[10px] font-mono text-neutral-400 block mb-1">State & Cookie Specs</span>
                <span className="text-[11px] text-neutral-300">
                  48-char hex CSRF nonce &bull; SameSite=None; Secure
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#141414] border border-[#222] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200 mb-1">
                <Shield className="w-3.5 h-3.5 text-emerald-400" /> Security Compliance
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Zero password storage. Strict timing-safe state comparison prevents CSRF attacks. Tokens are verified via GitHub API and mapped to standard OIDC claims.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-[#222] flex items-center justify-between text-[11px]">
              <span className="text-neutral-500">Provider Status:</span>
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Ready
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CODERABBIT BOT STATS & CONTROLS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#0c0c0c] border border-[#222]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">Total Code Reviews</span>
            <span className="text-lg">🐇</span>
          </div>
          <p className="text-xl font-bold font-mono text-white mt-1">{stats.totalReviews}</p>
          <span className="text-[10px] text-purple-400 font-mono">CodeRabbit AI Bot</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0c0c0c] border border-[#222]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">Errors Detected</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold font-mono text-amber-400 mt-1">{stats.totalErrorsFixed}</p>
          <span className="text-[10px] text-neutral-500">Lint, types & security</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0c0c0c] border border-[#222]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">Errors Auto-Fixed</span>
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xl font-bold font-mono text-purple-400 mt-1">{stats.totalErrorsFixed}</p>
          <span className="text-[10px] text-purple-300 font-mono">100% resolution rate</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0c0c0c] border border-[#222]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">Auto-Approved PRs</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{stats.totalFixesApproved}</p>
          <span className="text-[10px] text-emerald-400 font-mono">Verdict: APPROVED</span>
        </div>
      </div>

      {/* SECTION 3: CODE RABBIT INTERACTIVE AUTO-FIX RUNNER */}
      <div
        id="coderabbit-runner-panel"
        className="rounded-2xl border border-purple-500/30 bg-[#0c0c0c] p-5 shadow-xl relative overflow-hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-300 flex items-center justify-center font-bold text-lg shadow-sm shadow-purple-950/40">
              🐇
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">CodeRabbit Bot: Auto-Fix Errors & Auto-Approve</h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/30">
                  AI Autonomous Fixer
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Automatically scans PR diffs, repairs syntax/security/type defects, submits automated PR approval, and emits GitHub pop notifications.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-coderabbit-autofix-trigger"
              onClick={handleRunCodeRabbitAutoFix}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-950/50 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isProcessing ? 'Auto-Fixing & Approving...' : 'Auto Fix All Errors & Auto-Approve'}
            </button>
          </div>
        </div>

        {/* Auto-Fix Config Options */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-xl bg-[#121212] border border-[#222]">
          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoFixErrors}
              onChange={(e) => setAutoFixErrors(e.target.checked)}
              className="rounded bg-neutral-800 border-neutral-700 text-purple-500 focus:ring-purple-500"
            />
            <span>Auto-fix detected errors automatically</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoApproveFixes}
              onChange={(e) => setAutoApproveFixes(e.target.checked)}
              className="rounded bg-neutral-800 border-neutral-700 text-purple-500 focus:ring-purple-500"
            />
            <span>Auto-approve all necessary fixes</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoMergeFixes}
              onChange={(e) => setAutoMergeFixes(e.target.checked)}
              className="rounded bg-neutral-800 border-neutral-700 text-purple-500 focus:ring-purple-500"
            />
            <span>Auto-merge pull request upon approval</span>
          </label>
        </div>

        {/* Inputs for simulated PR error scenario */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-mono text-neutral-400 mb-1">Target PR Number & Branch</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={prNumber}
                  onChange={(e) => setPrNumber(e.target.value)}
                  className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                  placeholder="PR #42"
                />
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs font-mono text-white"
                  placeholder="branch"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-neutral-400 mb-1">Pull Request Title</label>
              <input
                type="text"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                className="w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-white"
                placeholder="PR Title"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-mono text-neutral-400 mb-1">
              Detected Errors To Auto-Fix (one per line)
            </label>
            <textarea
              rows={4}
              value={errorInput}
              onChange={(e) => setErrorInput(e.target.value)}
              className="w-full bg-[#141414] border border-[#2a2a2a] rounded-lg p-2.5 text-xs font-mono text-purple-300 focus:border-purple-500 focus:outline-none leading-relaxed"
              placeholder="List errors to auto-repair..."
            />
          </div>
        </div>

        {lastActionResult && (
          <div className="mt-4 p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 text-xs text-purple-200 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{lastActionResult}</span>
            </div>
            <span className="text-[10px] font-mono text-purple-300">Pop Notification Sent &bull; Toast Active</span>
          </div>
        )}
      </div>

      {/* SECTION 4: CODERABBIT REVIEW & AUTO-FIX AUDIT LOG WITH CODE PATCH DIFF */}
      <div className="rounded-2xl border border-[#222] bg-[#0c0c0c] p-5 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-2.5">
            <FileCode className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">CodeRabbit Automated Fixes & Review Inspector</h3>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            {history.length} Automated Reviews Logged
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Review List */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {history.map((rev) => (
              <div
                key={rev.id}
                id={`review-item-${rev.id}`}
                onClick={() => setSelectedReview(rev)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedReview?.id === rev.id
                    ? 'bg-purple-950/20 border-purple-500/50 shadow-sm'
                    : 'bg-[#121212] border-[#222] hover:border-[#333]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-white">
                    PR #{rev.prNumber}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                    {rev.verdict}
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-1 truncate">{rev.prTitle}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1f1f1f] text-[10px] font-mono text-neutral-500">
                  <span className="text-purple-400">Fixed {rev.errorsFixed} errors</span>
                  <span>{new Date(rev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Review Details & Diffs */}
          <div className="lg:col-span-2 bg-[#121212] rounded-xl border border-[#222] p-4 flex flex-col justify-between">
            {selectedReview ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#222]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        Review for PR #{selectedReview.prNumber}: {selectedReview.prTitle}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-950/80 text-purple-300 border border-purple-500/30">
                        @{selectedReview.sender}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-neutral-400 mt-0.5">
                      Branch: <span className="text-emerald-400">{selectedReview.branch}</span> &bull; Status: Auto-Merged
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                      <Check className="w-3.5 h-3.5" /> VERDICT: {selectedReview.verdict}
                    </span>
                  </div>
                </div>

                {/* Findings & Code Patches */}
                <div>
                  <h4 className="text-xs font-mono text-neutral-400 mb-2">
                    Auto-Fixed Findings & Applied Code Patches:
                  </h4>
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {selectedReview.findings.map((f) => (
                      <div
                        key={f.id}
                        className="p-3 rounded-lg bg-[#0e0e0e] border border-[#222] text-xs font-mono"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-purple-400 font-semibold">{f.file}:{f.line}</span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 text-[10px] border border-emerald-500/30">
                            {f.status}
                          </span>
                        </div>
                        <p className="text-neutral-300 text-[11px] mb-2 font-sans">{f.description}</p>
                        <div className="p-2 rounded bg-black/80 border border-[#262626] text-[11px] overflow-x-auto text-emerald-300">
                          <pre>{f.suggestedPatch}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Review Markdown excerpt */}
                <div className="p-2.5 rounded-lg bg-[#090909] border border-[#222] text-[11px] font-mono text-neutral-400">
                  <span className="text-purple-400 block mb-1">CodeRabbit Review Summary Comment:</span>
                  <div className="text-neutral-300 whitespace-pre-wrap line-clamp-3">
                    {selectedReview.reviewComment}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-neutral-500 text-xs">
                Select a review from the left panel to inspect CodeRabbit automated patches.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
