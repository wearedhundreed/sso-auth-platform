import React from 'react';
import { GitPullRequest, ShieldCheck, Terminal, Server, Key, FileCheck, CheckCircle2 } from 'lucide-react';

export const SecuritySpecView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* SSO Architecture Flow */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-serif font-semibold text-white mb-2 tracking-tight">
          OpenID Connect &amp; PKCE Authentication Architecture
        </h2>
        <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
          Standard RFC 7636 Authorization Code Flow with Proof Key for Code Exchange (PKCE). At no point does
          this SSO platform handle or store identity-provider passwords.
        </p>

        <div className="bg-[#070707] p-5 rounded-xl border border-[#1a1a1a] font-mono text-xs text-neutral-300 overflow-x-auto space-y-2">
          <div className="text-emerald-400 font-semibold">[Federated SSO Architecture Flow]</div>
          <div className="text-neutral-400">1. User &rarr; Authorized Application</div>
          <div className="text-neutral-400">2. Application &rarr; GET /login?client_id=...&amp;redirect_uri=...</div>
          <div className="text-neutral-400">3. SSO Platform &rarr; Generates cryptographic State, Nonce, PKCE S256 Challenge</div>
          <div className="text-neutral-400">4. Browser &rarr; Upstream OIDC Authorization Endpoint (Auth0 / IdP)</div>
          <div className="text-neutral-400">5. User authenticates securely at Identity Provider (MFA, Passkey, etc.)</div>
          <div className="text-neutral-400">6. IdP redirects &rarr; GET /auth/callback?code=...&amp;state=...</div>
          <div className="text-neutral-400">7. SSO Platform &rarr; Server-to-server token exchange with PKCE code_verifier</div>
          <div className="text-neutral-400">8. SSO Platform &rarr; Validates ID Token (signature, iss, aud, exp, nonce, sub)</div>
          <div className="text-neutral-400">9. SSO Platform &rarr; Issues HttpOnly, Secure, SameSite=Lax session cookie</div>
          <div className="text-emerald-400 font-semibold">10. SSO Platform &rarr; Redirects strictly to approved application callback URL</div>
        </div>
      </div>

      {/* CodeQL & CI/CD Security */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-serif font-semibold text-white">GitHub CodeQL Security Analysis</h3>
              <p className="text-[11px] text-neutral-400 font-mono">.github/workflows/codeql.yml</p>
            </div>
          </div>
          <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
            Automated semantic AST vulnerability analysis configured with the security-extended query suite
            targeting authentication bypass, open redirects, timing leaks, and SSRF.
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Security-extended query suite enabled</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Automated scans on push, PR, and weekly schedule</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Zero warnings / zero suppressed security queries</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <GitPullRequest className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-serif font-semibold text-white">Automated CI/CD Pipeline</h3>
              <p className="text-[11px] text-neutral-400 font-mono">.github/workflows/ci.yml</p>
            </div>
          </div>
          <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
            Every commit and pull request must satisfy strict linting, automated dependency audits (npm audit),
            full unit/security test suites, and production build validation.
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>TypeScript compiler check (tsc --noEmit)</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>38/38 Automated Vitest security &amp; auth tests pass</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Production bundle and esbuild compilation</span>
            </div>
          </div>
        </div>
      </div>

      {/* @Korey AI Assistant Bot CI/CD & Auto-Approval Specification */}
      <div className="bg-[#0c0c0c] border border-emerald-500/30 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/50 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-serif font-bold text-sm">
              🤖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-serif font-semibold text-white">@Korey AI Assistant Bot</h3>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 rounded-full">
                  Auto-Run &bull; Auto-Approve
                </span>
              </div>
              <p className="text-xs text-neutral-400">GitHub CI/CD Automation &amp; Workflow Reviewer</p>
            </div>
          </div>
          <span className="font-mono text-xs px-2.5 py-1 rounded bg-[#070707] text-neutral-300 border border-[#1f1f1f]">
            .github/workflows/korey-ai-bot.yml
          </span>
        </div>

        <p className="text-xs text-neutral-300 mb-4 leading-relaxed">
          The <span className="font-mono text-emerald-400">@Korey</span> AI assistant bot is integrated directly
          into GitHub Actions and the platform's webhook processing gateway. It continuously monitors incoming
          pull requests, issue comments (e.g. <span className="font-mono text-neutral-300">"@Korey please run CI"</span>),
          and workflow completions to automatically execute the 5-point CI/CD validation suite and submit signed
          <span className="font-mono text-emerald-400"> APPROVE</span> reviews.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-4">
          <div className="bg-[#070707] p-3 rounded-lg border border-[#1a1a1a]">
            <span className="font-mono text-emerald-400 block font-semibold mb-1">1. Event Ingestion</span>
            <span className="text-neutral-400">
              Captures PR opened/sync events, comment triggers with <code className="text-neutral-300">@Korey</code>, and GitHub Actions workflow runs.
            </span>
          </div>
          <div className="bg-[#070707] p-3 rounded-lg border border-[#1a1a1a]">
            <span className="font-mono text-emerald-400 block font-semibold mb-1">2. Auto-Run Validation</span>
            <span className="text-neutral-400">
              Executes tsc, high-severity npm audit, Vitest auth tests, and production compilation in isolated containers.
            </span>
          </div>
          <div className="bg-[#070707] p-3 rounded-lg border border-[#1a1a1a]">
            <span className="font-mono text-emerald-400 block font-semibold mb-1">3. Automated Approval</span>
            <span className="text-neutral-400">
              Submits official GitHub PR review with <code className="text-emerald-400">APPROVE</code> status, tags <code className="text-neutral-300">automerge</code>, and writes immutable audit logs.
            </span>
          </div>
        </div>
      </div>

      {/* Security Rules Adherence Matrix */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-serif font-semibold text-white mb-4">Enforced Security Rules Matrix</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-[#070707] p-3.5 rounded-lg border border-[#1a1a1a]">
            <span className="font-serif font-semibold text-emerald-400 block mb-1">
              &bull; Zero Password Interception
            </span>
            <span className="text-neutral-400">
              Never collects, logs, stores, or processes users' identity-provider passwords or credentials.
            </span>
          </div>
          <div className="bg-[#070707] p-3.5 rounded-lg border border-[#1a1a1a]">
            <span className="font-serif font-semibold text-emerald-400 block mb-1">
              &bull; Anti-Open-Redirect Defense
            </span>
            <span className="text-neutral-400">
              Strict allowlist exact matching against Application model. Forbids javascript:, data:, and
              wildcards.
            </span>
          </div>
          <div className="bg-[#070707] p-3.5 rounded-lg border border-[#1a1a1a]">
            <span className="font-serif font-semibold text-emerald-400 block mb-1">
              &bull; Constant-Time HMAC Signature Check
            </span>
            <span className="text-neutral-400">
              crypto.timingSafeEqual on X-Hub-Signature-256 prevents side-channel timing attacks.
            </span>
          </div>
          <div className="bg-[#070707] p-3.5 rounded-lg border border-[#1a1a1a]">
            <span className="font-serif font-semibold text-emerald-400 block mb-1">
              &bull; Secure Cookie &amp; Session Isolation
            </span>
            <span className="text-neutral-400">
              HttpOnly, Secure, SameSite=Lax cookies prevent XSS exfiltration and CSRF session riding.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
