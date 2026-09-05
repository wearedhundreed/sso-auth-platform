import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  calculatePKCECodeChallenge,
  verifyHmacSha256,
  sanitizeLogData,
  checkRateLimit,
  SECURITY_HEADERS,
} from '../lib/security';
import {
  createSession,
  verifySessionToken,
  destroySession,
} from '../lib/session';

describe('Core Security Controls Suite', () => {
  it('calculates standard RFC 7636 PKCE S256 code challenges correctly', () => {
    // Standard test vector: code_verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = calculatePKCECodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('performs timing-safe HMAC verification and rejects invalid signatures', () => {
    const payload = 'test-audit-payload';
    const secret = 'super-secret-key-for-test-32-chars';
    const validSignature =
      'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyHmacSha256(payload, validSignature, secret)).toBe(true);
    expect(verifyHmacSha256(payload, 'sha256=invalid', secret)).toBe(false);
    expect(verifyHmacSha256('tampered-payload', validSignature, secret)).toBe(false);
  });

  it('redacts all sensitive credentials, secrets, and tokens from log objects', () => {
    const rawData = {
      user: 'alice',
      password: 'PlaintextPassword123!',
      id_token: 'eyJhbGciOiJIUzI1NiIsIn...',
      access_token: 'ya29.a0AfH6SM...',
      client_secret: 'secret_live_9999',
      nested: {
        private_key: '-----BEGIN RSA PRIVATE KEY-----',
        safe_field: 'allowed_value',
      },
    };

    const sanitized = sanitizeLogData(rawData);
    expect(sanitized.user).toBe('alice');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.id_token).toBe('[REDACTED]');
    expect(sanitized.access_token).toBe('[REDACTED]');
    expect(sanitized.client_secret).toBe('[REDACTED]');
    expect(sanitized.nested.private_key).toBe('[REDACTED]');
    expect(sanitized.nested.safe_field).toBe('allowed_value');
  });

  it('enforces strict security headers', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("default-src 'self'");
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('enforces sliding-window rate limiting', () => {
    const testKey = `client_ip_${Date.now()}`;
    const maxReqs = 3;
    const windowMs = 5000;

    // Requests 1 to 3: Allowed
    expect(checkRateLimit(testKey, maxReqs, windowMs).allowed).toBe(true);
    expect(checkRateLimit(testKey, maxReqs, windowMs).allowed).toBe(true);
    expect(checkRateLimit(testKey, maxReqs, windowMs).allowed).toBe(true);

    // Request 4: Rate limited
    const rateLimited = checkRateLimit(testKey, maxReqs, windowMs);
    expect(rateLimited.allowed).toBe(false);
    expect(rateLimited.remaining).toBe(0);
  });

  it('creates, signs, validates, and destroys secure user sessions', () => {
    const { session, token } = createSession({
      userId: 'sub_998811',
      name: 'Security Engineer',
      email: 'secops@enterprise.example.com',
      roles: ['admin', 'secops'],
    });

    // Valid token
    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('sub_998811');
    expect(verified?.roles).toContain('secops');

    // Tampered token
    const tamperedToken = token.slice(0, -4) + 'zzzz';
    expect(verifySessionToken(tamperedToken)).toBeNull();

    // Destroy session
    destroySession(session.sessionId);
    // Destroyed session lookup
    expect(verifySessionToken(token)).toBeNull();
  });
});
