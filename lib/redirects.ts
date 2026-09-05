import { URL } from 'url';

export interface RegisteredApplication {
  id: string;
  name: string;
  clientId: string;
  redirectUris: string[];
  logoutRedirectUris: string[];
  allowedOrigins: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory registered application store (seeded with standard enterprise applications)
export const registeredApplications: RegisteredApplication[] = [
  {
    id: 'app_eng_01',
    name: 'Engineering Portal',
    clientId: 'client_eng_prod_9921',
    redirectUris: [
      'https://engineering.example.com/auth/callback',
      'http://localhost:3000/auth/callback',
    ],
    logoutRedirectUris: [
      'https://engineering.example.com/auth/logout',
      'http://localhost:3000/auth/logout',
    ],
    allowedOrigins: ['https://engineering.example.com', 'http://localhost:3000'],
    enabled: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: 'app_student_02',
    name: 'Student Portal',
    clientId: 'client_student_prod_4432',
    redirectUris: [
      'https://student.example.com/auth/callback',
    ],
    logoutRedirectUris: [
      'https://student.example.com/auth/logout',
    ],
    allowedOrigins: ['https://student.example.com'],
    enabled: true,
    createdAt: new Date('2025-02-01T00:00:00Z'),
    updatedAt: new Date('2025-02-01T00:00:00Z'),
  },
  {
    id: 'app_finance_03',
    name: 'Finance & Payroll Hub',
    clientId: 'client_fin_prod_7781',
    redirectUris: [
      'https://finance.example.com/auth/callback',
    ],
    logoutRedirectUris: [
      'https://finance.example.com/auth/logout',
    ],
    allowedOrigins: ['https://finance.example.com'],
    enabled: true,
    createdAt: new Date('2025-03-01T00:00:00Z'),
    updatedAt: new Date('2025-03-01T00:00:00Z'),
  },
  {
    id: 'app_internal_sso',
    name: 'SSO Platform Central Dashboard',
    clientId: 'client_sso_internal_master',
    redirectUris: [
      'https://sso.example.com/dashboard',
      'http://localhost:3000/dashboard',
    ],
    logoutRedirectUris: [
      'https://sso.example.com/login',
      'http://localhost:3000/login',
    ],
    allowedOrigins: ['https://sso.example.com', 'http://localhost:3000'],
    enabled: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  },
];

const FORBIDDEN_PROTOCOLS = new Set([
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'blob:',
  'about:',
]);

/**
 * Validates whether a target URL is syntactically safe and uses HTTPS (or localhost in dev).
 */
export function isSafeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }

  // Prevent leading control characters, spaces, or backslash trickery
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('//') || trimmed.includes('\\')) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);

    // Explicitly reject forbidden protocols
    if (FORBIDDEN_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return false;
    }

    // Must be https: or http: only on localhost/127.0.0.1
    if (parsed.protocol === 'http:') {
      return (
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname.endsWith('.localhost')
      );
    }

    return parsed.protocol === 'https:';
  } catch {
    // Relative paths beginning with '/' and not '//' are considered safe internal routes
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
      return true;
    }
    return false;
  }
}

/**
 * Validates a client redirect URI against the authorized application registry.
 * Rejects arbitrary URLs, unregistered domains, wildcards, and malicious schemes.
 */
export function validateRedirectUri(
  targetUri: string,
  clientId?: string
): { isValid: boolean; application?: RegisteredApplication; reason?: string } {
  if (!targetUri) {
    return { isValid: false, reason: 'Missing redirect URI' };
  }

  if (!isSafeUrl(targetUri)) {
    return { isValid: false, reason: 'Unsafe or disallowed protocol/format' };
  }

  // If clientId is provided, check only that application
  const candidates = clientId
    ? registeredApplications.filter((app) => app.clientId === clientId && app.enabled)
    : registeredApplications.filter((app) => app.enabled);

  if (candidates.length === 0) {
    return { isValid: false, reason: 'Unknown or disabled application clientId' };
  }

  // Strict exact matching against registered redirect URIs (or allowed local dashboard relative paths)
  for (const app of candidates) {
    const isMatched = app.redirectUris.some((registered) => {
      return normalizeUri(registered) === normalizeUri(targetUri);
    });

    if (isMatched) {
      return { isValid: true, application: app };
    }
  }

  return {
    isValid: false,
    reason: 'Redirect URI is not present in the application allowlist',
  };
}

/**
 * Validates a post-logout redirect URI against registered applications.
 */
export function validateLogoutRedirectUri(
  targetUri: string,
  clientId?: string
): { isValid: boolean; application?: RegisteredApplication; reason?: string } {
  if (!targetUri) {
    return { isValid: false, reason: 'Missing logout redirect URI' };
  }

  if (!isSafeUrl(targetUri)) {
    return { isValid: false, reason: 'Unsafe or disallowed protocol/format' };
  }

  const candidates = clientId
    ? registeredApplications.filter((app) => app.clientId === clientId && app.enabled)
    : registeredApplications.filter((app) => app.enabled);

  for (const app of candidates) {
    const isMatched = app.logoutRedirectUris.some((registered) => {
      return normalizeUri(registered) === normalizeUri(targetUri);
    });

    if (isMatched) {
      return { isValid: true, application: app };
    }
  }

  return {
    isValid: false,
    reason: 'Logout redirect URI is not authorized in registry allowlist',
  };
}

function normalizeUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return uri.replace(/\/+$/, '');
  }
}
