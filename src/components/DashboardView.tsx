import React from 'react';
import { User, ShieldCheck, Clock, Key, ArrowRight, RefreshCw, AlertTriangle } from 'lucide-react';

interface DashboardViewProps {
  isAuthenticated: boolean;
  user?: {
    userId: string;
    name: string;
    email: string;
    roles: string[];
    expiresAt: number;
  };
  onSimulateLogin: () => void;
  onLogout: () => void;
  isSimulating: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  isAuthenticated,
  user,
  onSimulateLogin,
  onLogout,
  isSimulating,
}) => {
  return (
    <div className="space-y-6">
      {/* Banner / Security Status */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-semibold text-white tracking-tight">
                Standards-Based Single Sign-On (SSO) Platform
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                OAuth 2.0 Authorization Code Flow with PKCE (RFC 7636) &bull; OpenID Connect Core 1.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Zero-Trust Architecture
            </span>
          </div>
        </div>
      </div>

      {isAuthenticated && user ? (
        <div className="space-y-6">
          {/* Identity Profile Card */}
          <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#1f1f1f]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#141414] border border-[#262626] flex items-center justify-center text-emerald-400 font-serif font-semibold">
                  {user.name ? user.name[0] : 'U'}
                </div>
                <div>
                  <h3 className="text-base font-serif font-semibold text-white">{user.name}</h3>
                  <p className="text-xs text-neutral-400">{user.email}</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Session Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#070707] p-4 rounded-lg border border-[#1a1a1a]">
                <span className="text-xs font-medium text-neutral-400 block mb-1">Subject (sub) ID</span>
                <p className="font-mono text-xs text-emerald-400 truncate" title={user.userId}>
                  {user.userId}
                </p>
                <span className="text-[10px] text-neutral-500 mt-1 block">OIDC Unique Subject Claim</span>
              </div>

              <div className="bg-[#070707] p-4 rounded-lg border border-[#1a1a1a]">
                <span className="text-xs font-medium text-neutral-400 block mb-1">Assigned Security Roles</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="px-2 py-0.5 rounded bg-[#141414] border border-[#262626] text-neutral-300 text-[11px] font-mono"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-[#070707] p-4 rounded-lg border border-[#1a1a1a]">
                <span className="text-xs font-medium text-neutral-400 block mb-1">Session Expiration</span>
                <p className="text-xs font-mono text-neutral-200">
                  {new Date(user.expiresAt).toLocaleTimeString()} ({new Date(user.expiresAt).toLocaleDateString()})
                </p>
                <span className="text-[10px] text-neutral-500 mt-1 block">HttpOnly, Secure Cookie Protected</span>
              </div>
            </div>

            {/* Security Guarantee Notice */}
            <div className="mt-5 p-4 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs text-neutral-300 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-serif font-medium text-emerald-300">Identity Protection Verification</p>
                <p className="mt-0.5 text-neutral-400 leading-relaxed">
                  In compliance with strict security rules, this application NEVER accesses, collects, or stores
                  user identity-provider passwords, raw private keys, or plaintext client secrets. Only sanitized,
                  cryptographically signed session representations are retained.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#1f1f1f]">
              <button
                onClick={onLogout}
                className="px-4 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 rounded-lg transition"
              >
                Terminate Session (Logout)
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Unauthenticated State */
        <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-8 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Key className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-serif font-semibold text-white mb-2">No Active SSO Session</h3>
          <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6 leading-relaxed">
            Authenticate using the OpenID Connect PKCE authorization flow or simulate an authorized enterprise
            session to test SSO access and security auditing.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              id="btn-dashboard-github-sso"
              onClick={async () => {
                try {
                  const res = await fetch('/api/auth/github/simulate', { method: 'POST' });
                  if (res.ok) {
                    window.location.reload();
                  }
                } catch {
                  // ignore
                }
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-neutral-200 text-black text-xs font-semibold rounded-lg transition shadow-md flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Sign in via GitHub (Preferred SSO)
            </button>

            <a
              id="btn-dashboard-login-consent"
              href="/auth/login-consent"
              className="w-full sm:w-auto px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-purple-950/50 flex items-center justify-center gap-2"
            >
              <span>Consent &amp; Code Exchange Console</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href="/login"
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition shadow-sm shadow-emerald-950/50 flex items-center justify-center gap-2"
            >
              Initiate OIDC Code Flow
              <ArrowRight className="w-4 h-4" />
            </a>

            <button
              onClick={onSimulateLogin}
              disabled={isSimulating}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#141414] hover:bg-[#1c1c1c] border border-[#262626] text-neutral-200 text-xs font-medium rounded-lg transition flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
              Test SSO Simulation (PKCE)
            </button>
          </div>
        </div>
      )}

      {/* Security Architecture Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-5">
          <span className="text-xs font-serif font-semibold text-emerald-400 block mb-1">Strict PKCE (S256)</span>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Every login produces a high-entropy 48-byte code verifier and computes SHA-256 base64url challenge to
            prevent authorization code interception.
          </p>
        </div>

        <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-5">
          <span className="text-xs font-serif font-semibold text-emerald-400 block mb-1">Replay & Nonce Defense</span>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Cryptographic state and unique ID token nonces are enforced and immediately invalidated after single
            use, neutralizing replay attacks.
          </p>
        </div>

        <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-5">
          <span className="text-xs font-serif font-semibold text-emerald-400 block mb-1">Strict URI Allowlists</span>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Redirect destinations are strictly validated against registered application records. Wildcards and
            unauthorized domains are unconditionally rejected.
          </p>
        </div>
      </div>
    </div>
  );
};
