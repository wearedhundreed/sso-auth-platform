import crypto from 'crypto';

export interface UserSession {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  roles: string[];
  createdAt: number;
  expiresAt: number;
}

// In-memory active session store and revocation tracking
const activeSessions = new Map<string, UserSession>();
const revokedSessionIds = new Set<string>();

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const DEFAULT_SECRET = 'super-secret-default-key-for-session-signing-at-least-32-chars-long!';

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

/**
 * Creates a cryptographically signed session token string.
 * Format: payloadBase64.signatureHex
 */
export function signSessionPayload(session: UserSession): string {
  const secret = getSessionSecret();
  const payloadStr = JSON.stringify(session);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a signed session token.
 * Rejects tampered, malformed, or expired sessions.
 */
export function verifySessionToken(tokenString: string): UserSession | null {
  if (!tokenString || typeof tokenString !== 'string') {
    return null;
  }

  const parts = tokenString.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signature] = parts;
  const secret = getSessionSecret();

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  // Constant-time signature comparison
  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const session: UserSession = JSON.parse(payloadStr);

    // Check expiration
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      activeSessions.delete(session.sessionId);
      return null;
    }

    // Check revocation
    if (revokedSessionIds.has(session.sessionId)) {
      return null;
    }

    if (!activeSessions.has(session.sessionId)) {
      activeSessions.set(session.sessionId, session);
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Creates and registers a new authenticated user session.
 */
export function createSession(userData: {
  userId: string;
  name: string;
  email: string;
  roles?: string[];
}): { session: UserSession; token: string } {
  const now = Date.now();
  const sessionId = crypto.randomUUID();

  const session: UserSession = {
    sessionId,
    userId: userData.userId,
    name: userData.name || 'Enterprise User',
    email: userData.email,
    roles: userData.roles || ['user'],
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };

  activeSessions.set(sessionId, session);
  const token = signSessionPayload(session);

  return { session, token };
}

/**
 * Destroys a session on logout.
 */
export function destroySession(sessionId: string): boolean {
  revokedSessionIds.add(sessionId);
  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * Generates secure cookie options compliant with enterprise security standards:
 * HttpOnly, Secure (in production), SameSite=Lax, Path=/
 */
export function getSessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction, // Set to true in HTTPS production
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

export const SESSION_COOKIE_NAME = '__Host-sso_session';
export const DEV_SESSION_COOKIE_NAME = 'sso_session';
