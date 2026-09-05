import React from 'react';
import { Layers, CheckCircle, ExternalLink, ShieldAlert, ArrowUpRight } from 'lucide-react';

interface Application {
  id: string;
  name: string;
  clientId: string;
  redirectUris: string[];
  logoutRedirectUris: string[];
  allowedOrigins: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ApplicationsViewProps {
  applications: Application[];
  onTestAppSSO: (app: Application) => void;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  applications,
  onTestAppSSO,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-serif font-semibold text-white tracking-tight">Authorized Application Registry</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Registered OAuth 2.0 / OIDC clients authorized for Single Sign-On federation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-mono rounded-full">
            {applications.filter((a) => a.enabled).length} Active SSO Clients
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {applications.map((app) => (
          <div
            key={app.id}
            className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 hover:border-[#2a2a2a] transition shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-serif font-semibold text-white">{app.name}</h3>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded-full ${
                      app.enabled
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                        : 'bg-[#141414] text-neutral-400 border border-[#262626]'
                    }`}
                  >
                    {app.enabled ? 'Federation Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 font-mono text-xs text-neutral-400">
                  <span>Client ID:</span>
                  <code className="text-emerald-400 bg-[#070707] px-2 py-0.5 rounded border border-[#1a1a1a]">
                    {app.clientId}
                  </code>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onTestAppSSO(app)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition shadow-sm shadow-emerald-950/50"
                >
                  <span>Test SSO Flow</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-4 border-t border-[#1f1f1f] text-xs">
              <div>
                <span className="text-neutral-400 font-medium block mb-1.5">
                  Authorized Redirect URIs (Strict Allowlist)
                </span>
                <div className="space-y-1">
                  {app.redirectUris.map((uri) => (
                    <div
                      key={uri}
                      className="font-mono text-[11px] text-neutral-300 bg-[#070707] p-2 rounded border border-[#1a1a1a] truncate"
                      title={uri}
                    >
                      {uri}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-neutral-400 font-medium block mb-1.5">
                  Authorized Post-Logout Redirects
                </span>
                <div className="space-y-1">
                  {app.logoutRedirectUris.map((uri) => (
                    <div
                      key={uri}
                      className="font-mono text-[11px] text-neutral-300 bg-[#070707] p-2 rounded border border-[#1a1a1a] truncate"
                      title={uri}
                    >
                      {uri}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center justify-between text-[11px] text-neutral-500 font-mono">
              <span>Allowed Origins: {app.allowedOrigins.join(', ')}</span>
              <span>Registered: {new Date(app.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
