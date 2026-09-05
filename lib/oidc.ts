import crypto from 'crypto';
import { z } from 'zod';
import {
  generateRandomString,
  calculatePKCECodeChallenge,
} from './security';

// Schema for temporary OIDC auth state stored between /login and /auth/callback
export const OIDCAuthStateSchema = z.object({
  state: z.string().min(16),
  codeVerifier: z.string().min(32),
  nonce: z.string().min(16),
  targetRedirectUri: z.string().url().optional(),
  targetClientId: z.string().optional(),
  createdAt: z.number(),
  expiresAt: z.number(),
});

export type OIDCAuthState = z.infer<typeof OIDCAuthStateSchema>;

// Store temporary in-flight auth states (TTL: 10 minutes)
const pendingAuthStates = new Map<string, OIDCAuthState>();
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OIDCConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint?: string;
  jwksUri?: string;
  clientId: string;
  clientSecret?: string;
  callbackUrl: string;
}

export function getOIDCConfig(): OIDCConfig {
  const issuer = process.env.OIDC_ISSUER || 'https://auth.example.com/';
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const callbackUrl =
    process.env.OIDC_CALLBACK_URL || `${appUrl.replace(/\/+$/, '')}/auth/callback`;

  return {
    issuer: issuer.endsWith('/') ? issuer : `${issuer}/`,
    authorizationEndpoint: `${issuer.replace(/\/+$/, '')}/authorize`,
    tokenEndpoint: `${issuer.replace(/\/+$/, '')}/oauth/token`,
    userInfoEndpoint: `${issuer.replace(/\/+$/, '')}/userinfo`,
    jwksUri: `${issuer.replace(/\/+$/, '')}/.well-known/jwks.json`,
    clientId: process.env.OIDC_CLIENT_ID || 'sso-platform-client-id-placeholder',
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    callbackUrl,
  };
}

/**
 * Initiates the PKCE OIDC authorization flow:
 * 1. Generates cryptographic state
 * 2. Generates PKCE code_verifier and code_challenge (S256)
 * 3. Generates nonce
 * 4. Persists state temporarily
 * 5. Returns authorization URL
 */
export function buildAuthorizationUrl(params: {
  targetRedirectUri?: string;
  targetClientId?: string;
}): { authorizationUrl: string; state: string; authState: OIDCAuthState } {
  const config = getOIDCConfig();

  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(48);
  const codeChallenge = calculatePKCECodeChallenge(codeVerifier);
  const nonce = generateRandomString(32);

  const now = Date.now();
  const authState: OIDCAuthState = {
    state,
    codeVerifier,
    nonce,
    targetRedirectUri: params.targetRedirectUri,
    targetClientId: params.targetClientId,
    createdAt: now,
    expiresAt: now + AUTH_STATE_TTL_MS,
  };

  // Store in pending state map keyed by state
  pendingAuthStates.set(state, authState);

  // Clean up expired states
  for (const [key, item] of pendingAuthStates.entries()) {
    if (Date.now() > item.expiresAt) {
      pendingAuthStates.delete(key);
    }
  }

  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('nonce', nonce);

  return {
    authorizationUrl: url.toString(),
    state,
    authState,
  };
}

/**
 * Consumes and deletes a temporary authentication state.
 * Prevents replay attacks by ensuring state can only be used once.
 */
export function consumeAuthState(state: string): OIDCAuthState | null {
  if (!state || typeof state !== 'string') {
    return null;
  }

  const authState = pendingAuthStates.get(state);
  if (!authState) {
    return null;
  }

  // Remove immediately (single use)
  pendingAuthStates.delete(state);

  // Check TTL
  if (Date.now() > authState.expiresAt) {
    return null;
  }

  return authState;
}

export interface ValidatedIDTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

/**
 * Validates ID token according to OpenID Connect Core 1.0 specifications:
 * - Alg cannot be "none" (reject unsigned tokens)
 * - Signature verified
 * - Issuer matches expected OIDC_ISSUER
 * - Audience matches client_id
 * - exp is in the future (with 60s clock skew tolerance)
 * - nonce matches the original login nonce
 */
export function validateIDToken(
  tokenString: string,
  expectedNonce: string,
  verificationKeyOrSecret: string,
  expectedIssuer?: string,
  expectedAudience?: string
): { isValid: boolean; claims?: ValidatedIDTokenClaims; error?: string } {
  if (!tokenString || typeof tokenString !== 'string') {
    return { isValid: false, error: 'Token string missing or invalid' };
  }

  const parts = tokenString.split('.');
  if (parts.length !== 3) {
    return { isValid: false, error: 'Malformed JWT structure' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Decode header and reject unsigned / "none" algorithm
  let header: { alg: string; typ?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  } catch {
    return { isValid: false, error: 'Invalid token header JSON' };
  }

  if (!header.alg || header.alg.toLowerCase() === 'none') {
    return { isValid: false, error: 'Unsigned tokens (alg: none) are strictly forbidden' };
  }

  // 2. Verify signature
  if (header.alg === 'HS256') {
    const expectedSig = crypto
      .createHmac('sha256', verificationKeyOrSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signatureB64, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { isValid: false, error: 'Invalid token signature' };
    }
  } else if (header.alg === 'RS256') {
    // For RS256, verify using public key
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${headerB64}.${payloadB64}`);
      const isValidSig = verifier.verify(
        verificationKeyOrSecret,
        Buffer.from(signatureB64, 'base64url')
      );
      if (!isValidSig) {
        return { isValid: false, error: 'Invalid RS256 token signature' };
      }
    } catch (err) {
      return { isValid: false, error: `Signature verification failed: ${String(err)}` };
    }
  } else {
    return { isValid: false, error: `Unsupported signing algorithm: ${header.alg}` };
  }

  // 3. Parse and validate claims
  let claims: ValidatedIDTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { isValid: false, error: 'Invalid token payload JSON' };
  }

  const config = getOIDCConfig();
  const issuer = expectedIssuer || config.issuer;
  const audience = expectedAudience || config.clientId;

  // 4. Validate Issuer
  const normalizedTokenIss = claims.iss.endsWith('/') ? claims.iss : `${claims.iss}/`;
  const normalizedExpectedIss = issuer.endsWith('/') ? issuer : `${issuer}/`;
  if (normalizedTokenIss !== normalizedExpectedIss) {
    return { isValid: false, error: `Issuer mismatch: expected ${issuer}, got ${claims.iss}` };
  }

  // 5. Validate Audience
  const audMatches = Array.isArray(claims.aud)
    ? claims.aud.includes(audience)
    : claims.aud === audience;

  if (!audMatches) {
    return { isValid: false, error: `Audience mismatch: expected ${audience}, got ${claims.aud}` };
  }

  // 6. Validate Expiration (with 60s clock skew)
  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp + 60 < nowInSeconds) {
    return { isValid: false, error: 'Token has expired' };
  }

  // 7. Validate Nonce
  if (!claims.nonce || claims.nonce !== expectedNonce) {
    return { isValid: false, error: 'Nonce mismatch: potential replay attack' };
  }

  // 8. Validate Subject
  if (!claims.sub || typeof claims.sub !== 'string') {
    return { isValid: false, error: 'Missing or empty subject (sub) claim' };
  }

  return { isValid: true, claims };
}

/**
 * Creates a valid test/mock ID token signed with HS256 for testing and offline development.
 */
export function createMockIdToken(params: {
  sub: string;
  email: string;
  name: string;
  nonce: string;
  secret: string;
  issuer?: string;
  audience?: string;
  expiresInSeconds?: number;
  tamperSignature?: boolean;
  alg?: string;
}): string {
  const config = getOIDCConfig();
  const alg = params.alg || 'HS256';
  const header = { alg, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const payload: ValidatedIDTokenClaims = {
    iss: params.issuer || config.issuer,
    sub: params.sub,
    aud: params.audience || config.clientId,
    exp: now + (params.expiresInSeconds ?? 3600),
    iat: now,
    nonce: params.nonce,
    email: params.email,
    name: params.name,
    email_verified: true,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  if (alg === 'none') {
    return `${headerB64}.${payloadB64}.`;
  }

  let sig = crypto
    .createHmac('sha256', params.secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (params.tamperSignature) {
    sig = sig.slice(0, -4) + 'abcd';
  }

  return `${headerB64}.${payloadB64}.${sig}`;
}
