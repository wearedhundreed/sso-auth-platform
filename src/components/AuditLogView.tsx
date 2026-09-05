import React from 'react';
import { Shield, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface AuditLog {
  id: string;
  type: string;
  userId?: string;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

interface AuditLogViewProps {
  logs: AuditLog[];
  onRefresh: () => void;
  isLoading: boolean;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs, onRefresh, isLoading }) => {
  const getBadgeColor = (type: string) => {
    if (type.includes('SUCCESS') || type.includes('ACCEPTED')) {
      return 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30';
    }
    if (type.includes('FAILURE') || type.includes('REJECTED') || type.includes('INVALID')) {
      return 'bg-rose-950/40 text-rose-400 border-rose-800/40';
    }
    return 'bg-[#141414] text-neutral-300 border-[#262626]';
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-serif font-semibold text-white tracking-tight">Security &amp; Authentication Audit Trail</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Tamper-evident chronological log of state checks, PKCE verifications, callbacks, and webhooks.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-neutral-300 hover:text-white px-3 py-1.5 rounded-lg border border-[#262626] bg-[#141414] hover:bg-[#1a1a1a] transition flex items-center gap-1.5 self-start sm:self-auto font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Feed
        </button>
      </div>

      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-6 shadow-sm">
        {logs.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-6 font-mono">No security events logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1f1f1f] text-neutral-400 uppercase tracking-wider text-[11px] font-mono">
                <tr>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">IP / Client</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Sanitized Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181818]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#121212] transition-colors">
                    <td className="py-3 px-3 font-mono text-neutral-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold border ${getBadgeColor(
                          log.type
                        )}`}
                      >
                        {log.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-neutral-400">
                      <div>{log.ipAddress || '127.0.0.1'}</div>
                      {log.clientId && (
                        <div className="text-[10px] text-emerald-400 truncate max-w-[140px]">{log.clientId}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-neutral-300 font-mono text-[11px]">
                      {log.userId ? log.userId.slice(0, 16) + '...' : '-'}
                    </td>
                    <td className="py-3 px-3 text-neutral-300">
                      {log.details ? (
                        <pre className="text-[11px] font-mono text-neutral-400 bg-[#070707] p-2 rounded border border-[#1a1a1a] max-w-sm overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-neutral-600 font-mono">-</span>
                      )}
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
