import crypto from 'crypto';

/**
 * Generates a cryptographically secure random string for OAuth state, PKCE verifier, or nonce.
 */
export function generateRandomString(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Calculates a PKCE S256 code challenge from a code verifier.
 * SHA256(verifier) -> base64url
 */
export function calculatePKCECodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash('sha256')
    .update(codeVerifier, 'utf8')
    .digest('base64url');
}

/**
 * Timing-safe HMAC SHA-256 verification to prevent timing attacks.
 */
export function verifyHmacSha256(
  payload: string | Buffer,
  signatureWithPrefix: string,
  secret: string
): boolean {
  if (!signatureWithPrefix || !secret) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  const sigBuffer = Buffer.from(signatureWithPrefix, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Sensitive field redaction helper to ensure no secrets, tokens, or private keys are ever logged.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'accesstoken',
  'access_token',
  'idtoken',
  'id_token',
  'refreshtoken',
  'refresh_token',
  'authorizationcode',
  'code',
  'clientsecret',
  'client_secret',
  'sessionsecret',
  'session_secret',
  'webhooksecret',
  'secret',
  'privatekey',
  'private_key',
  'authorization',
  'cookie',
]);

export function sanitizeLogData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Comprehensive security headers conforming to OWASP and industry standards.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self';",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * In-memory sliding window rate limiter for authentication endpoints and webhooks.
 */
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  key: string,
  maxRequests: number = 60,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key) || { timestamps: [] };

  // Filter timestamps within current window
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const resetTime = oldest + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetTime,
    };
  }

  validTimestamps.push(now);
  rateLimitStore.set(key, { timestamps: validTimestamps });

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
    resetTime: now + windowMs,
  };
}
