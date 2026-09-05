import { describe, it, expect } from 'vitest';
import {
  buildAuthorizationUrl,
  validateIDToken,
  createMockIdToken,
  getOIDCConfig,
} from '../lib/oidc';
import { handleCallback } from '../lib/auth';

describe('OIDC Authentication & Token Validation Suite', () => {
  const config = getOIDCConfig();
  const secret = 'test-signing-secret-minimum-32-chars-long-for-testing';

  it('generates secure PKCE parameters and authorization URL', () => {
    const { authorizationUrl, state, authState } = buildAuthorizationUrl({});

    expect(authorizationUrl).toContain('response_type=code');
    expect(authorizationUrl).toContain('scope=openid+profile+email');
    expect(authorizationUrl).toContain('code_challenge_method=S256');
    expect(authorizationUrl).toContain(`state=${state}`);
    expect(authState.codeVerifier.length).toBeGreaterThanOrEqual(32);
    expect(authState.nonce.length).toBeGreaterThanOrEqual(16);
  });

  it('successfully validates a legitimate ID token', () => {
    const nonce = 'test-valid-nonce-12345';
    const token = createMockIdToken({
      sub: 'user_123',
      email: 'alex@example.com',
      name: 'Alex Engineer',
      nonce,
      secret,
    });

    const result = validateIDToken(token, nonce, secret);
    expect(result.isValid).toBe(true);
    expect(result.claims?.sub).toBe('user_123');
    expect(result.claims?.email).toBe('alex@example.com');
  });

  it('rejects unsigned tokens (alg: none)', () => {
    const nonce = 'test-nonce-none-alg';
    const unsignedToken = createMockIdToken({
      sub: 'user_attacker',
      email: 'attacker@example.com',
      name: 'Attacker',
      nonce,
      secret,
      alg: 'none',
    });

    const result = validateIDToken(unsignedToken, nonce, secret);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unsigned tokens (alg: none) are strictly forbidden');
  });

  it('rejects tokens with invalid signatures (signature tampering)', () => {
    const nonce = 'test-nonce-tampered';
    const tamperedToken = createMockIdToken({
      sub: 'user_tampered',
      email: 'user@example.com',
      name: 'Tampered User',
      nonce,
      secret,
      tamperSignature: true,
    });

    const result = validateIDToken(tamperedToken, nonce, secret);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid token signature');
  });

  it('rejects tokens with mismatched nonce (replay attack prevention)', () => {
    const token = createMockIdToken({
      sub: 'user_replay',
      email: 'user@example.com',
      name: 'Replay User',
      nonce: 'legitimate-nonce-A',
      secret,
    });

    const result = validateIDToken(token, 'different-expected-nonce-B', secret);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Nonce mismatch');
  });

  it('rejects expired tokens', () => {
    const nonce = 'test-nonce-expired';
    const expiredToken = createMockIdToken({
      sub: 'user_expired',
      email: 'user@example.com',
      name: 'Expired User',
      nonce,
      secret,
      expiresInSeconds: -120, // Expired 2 minutes ago
    });

    const result = validateIDToken(expiredToken, nonce, secret);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Token has expired');
  });

  it('rejects tokens with incorrect issuer', () => {
    const nonce = 'test-nonce-iss';
    const token = createMockIdToken({
      sub: 'user_bad_iss',
      email: 'user@example.com',
      name: 'User Bad Iss',
      nonce,
      secret,
      issuer: 'https://evil-untrusted-issuer.example.com/',
    });

    const result = validateIDToken(token, nonce, secret);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Issuer mismatch');
  });

  it('rejects tokens with incorrect audience', () => {
    const nonce = 'test-nonce-aud';
    const token = createMockIdToken({
      sub: 'user_bad_aud',
      email: 'user@example.com',
      name: 'User Bad Aud',
      nonce,
      secret,
      audience: 'foreign_client_id_9999',
    });

    const result = validateIDToken(token, nonce, secret);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Audience mismatch');
  });

  it('rejects callback with invalid or missing state', async () => {
    const result = await handleCallback({
      state: 'non_existent_or_forged_state_value',
      code: 'auth_code_123',
    });

    expect(result.success).toBe(false);
    expect(result.redirectUrl).toContain('/auth/error?error=invalid_request');
  });

  it('handles upstream identity provider errors gracefully', async () => {
    const result = await handleCallback({
      error: 'access_denied',
      errorDescription: 'User canceled login',
    });

    expect(result.success).toBe(false);
    expect(result.redirectUrl).toContain('/auth/error?error=access_denied');
  });
});
