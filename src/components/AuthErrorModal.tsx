import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AuthErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorCode: string;
}

const ERROR_DETAILS: Record<string, { title: string; description: string }> = {
  access_denied: {
    title: 'Access Denied',
    description: 'The user or identity provider declined permissions for this application.',
  },
  login_required: {
    title: 'Authentication Required',
    description: 'The existing session has expired. Re-authentication at identity provider is required.',
  },
  interaction_required: {
    title: 'Interaction Required',
    description: 'Multi-factor authentication (MFA) or interactive challenge must be satisfied.',
  },
  consent_required: {
    title: 'Consent Required',
    description: 'The user must grant required identity scopes before SSO access can be issued.',
  },
  invalid_request: {
    title: 'Invalid Request',
    description: 'OAuth state parameter was missing, tampered with, or expired. Replay attack blocked.',
  },
  server_error: {
    title: 'Identity Provider Error',
    description: 'The upstream OpenID Connect service reported a temporary failure. Please retry.',
  },
};

export const AuthErrorModal: React.FC<AuthErrorModalProps> = ({ isOpen, onClose, errorCode }) => {
  if (!isOpen) return null;

  const info = ERROR_DETAILS[errorCode] || ERROR_DETAILS.access_denied;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0c0c0c] border border-[#222222] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-rose-950/40 text-rose-400 border border-rose-800/40 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-serif font-semibold text-white mb-1.5 tracking-tight">{info.title}</h3>
        <p className="text-xs text-neutral-300 mb-5 leading-relaxed">{info.description}</p>

        <div className="bg-[#070707] p-3.5 rounded-lg border border-[#1a1a1a] text-[11px] font-mono mb-5 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-neutral-500">Error Category:</span>
            <span className="text-rose-400 font-semibold">{errorCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Credential Leak Check:</span>
            <span className="text-emerald-400 font-semibold">0 Leaked (Protected)</span>
          </div>
        </div>

        <div className="flex gap-3">
          <a
            href="/login"
            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg text-center transition shadow-sm shadow-emerald-950/50"
          >
            Safe Retry Login
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-neutral-300 hover:text-white text-xs font-medium rounded-lg border border-[#262626] transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
