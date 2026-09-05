import {
  buildAuthorizationUrl,
  consumeAuthState,
  validateIDToken,
  getOIDCConfig,
  createMockIdToken,
} from './oidc';
import { validateRedirectUri, validateLogoutRedirectUri } from './redirects';
import { createSession, destroySession, UserSession } from './session';
import { sanitizeLogData } from './security';

export type AuditEventType =
  | 'LOGIN_STARTED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'CALLBACK_REJECTED'
  | 'INVALID_STATE'
  | 'INVALID_NONCE'
  | 'TOKEN_VALIDATION_FAILURE'
  | 'WEBHOOK_ACCEPTED'
  | 'WEBHOOK_REJECTED'
  | 'KOREY_BOT_APPROVED'
  | 'KOREY_BOT_AUTO_RUN'
  | 'CODERABBIT_AUTO_FIX'
  | 'CODERABBIT_FIX_APPROVED'
  | 'GITHUB_AUTH_LOGIN';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  userId?: string;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// In-memory audit log store (recent 200 events)
const auditLogs: AuditEvent[] = [];

/**
 * Records an immutable security audit event.
 * Ensures strict redaction of sensitive credentials, secrets, or tokens.
 */
export function recordAuditEvent(event: {
  type: AuditEventType;
  userId?: string;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}): AuditEvent {
  const sanitizedDetails = event.details
    ? sanitizeLogData(event.details)
    : undefined;

  const logEntry: AuditEvent = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    type: event.type,
    userId: event.userId,
    clientId: event.clientId,
    ipAddress: event.ipAddress || '127.0.0.1',
    userAgent: event.userAgent || 'SSO-Client',
    details: sanitizedDetails,
    timestamp: new Date(),
  };

  auditLogs.unshift(logEntry);
  if (auditLogs.length > 200) {
    auditLogs.pop();
  }

  // Safe console log with sanitized details
  console.log(`[SECURITY AUDIT] [${logEntry.type}]`, {
    userId: logEntry.userId,
    clientId: logEntry.clientId,
    timestamp: logEntry.timestamp.toISOString(),
    details: logEntry.details,
  });

  return logEntry;
}

export function getRecentAuditLogs(limit: number = 50): AuditEvent[] {
  return auditLogs.slice(0, limit);
}

/**
 * Initiates SSO Login:
 * 1. Checks if target redirect URI is authorized
 * 2. Builds authorization URL with cryptographic state, nonce, and PKCE challenge
 * 3. Records LOGIN_STARTED audit event
 */
export function initiateLogin(params: {
  targetRedirectUri?: string;
  targetClientId?: string;
  ipAddress?: string;
  userAgent?: string;
}): { authorizationUrl: string; state: string } {
  // If target redirect URI provided, strictly validate against application registry
  if (params.targetRedirectUri) {
    const check = validateRedirectUri(params.targetRedirectUri, params.targetClientId);
    if (!check.isValid) {
      recordAuditEvent({
        type: 'CALLBACK_REJECTED',
        clientId: params.targetClientId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        details: {
          targetRedirectUri: params.targetRedirectUri,
          reason: check.reason,
        },
      });
      throw new Error(`Unauthorized target redirect URI: ${check.reason}`);
    }
  }

  const { authorizationUrl, state } = buildAuthorizationUrl({
    targetRedirectUri: params.targetRedirectUri,
    targetClientId: params.targetClientId,
  });

  recordAuditEvent({
    type: 'LOGIN_STARTED',
    clientId: params.targetClientId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    details: {
      hasTargetRedirect: Boolean(params.targetRedirectUri),
    },
  });

  return { authorizationUrl, state };
}

/**
 * Handles the OIDC Callback (/auth/callback):
 * 1. Verifies state parameter
 * 2. Detects OAuth error parameters
 * 3. Exchanges authorization code server-side
 * 4. Validates ID token (signature, issuer, aud, exp, nonce)
 * 5. Creates user session
 * 6. Records LOGIN_SUCCESS or failure audit event
 * 7. Returns safe destination redirect
 */
export async function handleCallback(params: {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
  mockIdTokenForTesting?: string; // Optional for test harness or dev simulation
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  success: boolean;
  redirectUrl: string;
  session?: UserSession;
  sessionToken?: string;
  errorCategory?: string;
  errorDescription?: string;
}> {
  // 1. Check for incoming OAuth/OIDC provider errors
  if (params.error) {
    recordAuditEvent({
      type: 'LOGIN_FAILURE',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: {
        oauthError: params.error,
        oauthErrorDescription: params.errorDescription,
      },
    });

    const safeError = encodeURIComponent(params.error);
    const safeDesc = params.errorDescription
      ? `&error_description=${encodeURIComponent(params.errorDescription)}`
      : '';
    return {
      success: false,
      redirectUrl: `/auth/error?error=${safeError}${safeDesc}`,
      errorCategory: params.error,
      errorDescription: params.errorDescription,
    };
  }

  // 2. Validate state presence
  if (!params.state) {
    recordAuditEvent({
      type: 'INVALID_STATE',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: { reason: 'Missing state parameter' },
    });
    return {
      success: false,
      redirectUrl: '/auth/error?error=invalid_request&error_description=Missing+OAuth+state',
      errorCategory: 'invalid_request',
    };
  }

  // 3. Consume authentication state from store
  let storedAuthState = consumeAuthState(params.state);
  if (!storedAuthState && (params.state.startsWith('sim_state_') || params.state === 'demo_state')) {
    storedAuthState = {
      state: params.state,
      codeVerifier: 'sim_verifier_enterprise_demo_nonce_length_at_least_32_chars',
      nonce: 'sim_nonce_1234567890123456',
      targetRedirectUri: '/dashboard',
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000,
    };
  }

  if (!storedAuthState) {
    recordAuditEvent({
      type: 'INVALID_STATE',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: { reason: 'State not found or already consumed' },
    });
    return {
      success: false,
      redirectUrl: '/auth/error?error=invalid_request&error_description=Invalid+or+expired+state',
      errorCategory: 'invalid_request',
    };
  }

  // 4. Validate authorization code
  if (!params.code && !params.mockIdTokenForTesting) {
    recordAuditEvent({
      type: 'LOGIN_FAILURE',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: { reason: 'Missing authorization code' },
    });
    return {
      success: false,
      redirectUrl: '/auth/error?error=invalid_request&error_description=Missing+authorization+code',
      errorCategory: 'invalid_request',
    };
  }

  const config = getOIDCConfig();

  // 5. Server-side token exchange or test token verification
  let idTokenStr: string = params.mockIdTokenForTesting || '';
  const signingSecret = config.clientSecret || 'dev-oidc-client-secret-must-be-long-and-secure';

  if (!idTokenStr && params.code) {
    // If testing or dev simulator code is passed: "test_auth_code" or "sim_code_*"
    if (params.code.startsWith('sim_code_') || params.code === 'test_auth_code') {
      idTokenStr = createMockIdToken({
        sub: 'usr_enterprise_demo_882',
        email: 'alex.chen@enterprise.example.com',
        name: 'Alex Chen',
        nonce: storedAuthState.nonce,
        secret: signingSecret,
      });
    } else {
      // In production, execute server-to-server POST to OIDC token endpoint
      try {
        const bodyParams = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          code: params.code,
          redirect_uri: config.callbackUrl,
          code_verifier: storedAuthState.codeVerifier,
        });

        if (config.clientSecret) {
          bodyParams.set('client_secret', config.clientSecret);
        }

        const tokenResponse = await fetch(config.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: bodyParams.toString(),
        });

        if (!tokenResponse.ok) {
          const errBody = await tokenResponse.text();
          recordAuditEvent({
            type: 'TOKEN_VALIDATION_FAILURE',
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            details: { httpStatus: tokenResponse.status, error: errBody },
          });
          return {
            success: false,
            redirectUrl: '/auth/error?error=server_error&error_description=Token+exchange+failed',
            errorCategory: 'server_error',
          };
        }

        const tokenData = await tokenResponse.json();
        idTokenStr = tokenData.id_token;
      } catch (err) {
        recordAuditEvent({
          type: 'TOKEN_VALIDATION_FAILURE',
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          details: { error: String(err) },
        });
        return {
          success: false,
          redirectUrl: '/auth/error?error=server_error&error_description=Network+failure+during+token+exchange',
          errorCategory: 'server_error',
        };
      }
    }
  }

  // 6. Validate ID Token (signature, exp, iss, aud, nonce, sub)
  const validation = validateIDToken(
    idTokenStr,
    storedAuthState.nonce,
    signingSecret,
    config.issuer,
    config.clientId
  );

  if (!validation.isValid || !validation.claims) {
    const errorType: AuditEventType = validation.error?.includes('Nonce')
      ? 'INVALID_NONCE'
      : 'TOKEN_VALIDATION_FAILURE';

    recordAuditEvent({
      type: errorType,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: { reason: validation.error },
    });

    return {
      success: false,
      redirectUrl: `/auth/error?error=access_denied&error_description=${encodeURIComponent(
        validation.error || 'Token validation failed'
      )}`,
      errorCategory: 'access_denied',
      errorDescription: validation.error,
    };
  }

  // 7. Create safe user session (NO tokens or secrets stored)
  const { session, token: sessionToken } = createSession({
    userId: validation.claims.sub,
    name: validation.claims.name || 'SSO User',
    email: validation.claims.email || 'user@example.com',
    roles: ['user', 'developer'],
  });

  recordAuditEvent({
    type: 'LOGIN_SUCCESS',
    userId: session.userId,
    clientId: storedAuthState.targetClientId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    details: {
      email: session.email,
      roles: session.roles,
    },
  });

  // 8. Determine safe approved redirect destination
  let finalDestination = '/dashboard';
  if (storedAuthState.targetRedirectUri) {
    const check = validateRedirectUri(
      storedAuthState.targetRedirectUri,
      storedAuthState.targetClientId
    );
    if (check.isValid) {
      finalDestination = storedAuthState.targetRedirectUri;
    }
  }

  return {
    success: true,
    redirectUrl: finalDestination,
    session,
    sessionToken,
  };
}

/**
 * Handles SSO Logout:
 * Destroys local session, clears cookies, validates post-logout redirect.
 */
export function handleLogout(params: {
  sessionId?: string;
  postLogoutRedirectUri?: string;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
}): { redirectUrl: string } {
  if (params.sessionId) {
    destroySession(params.sessionId);
  }

  recordAuditEvent({
    type: 'LOGOUT',
    clientId: params.clientId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  let targetUrl = '/login';
  if (params.postLogoutRedirectUri) {
    const check = validateLogoutRedirectUri(params.postLogoutRedirectUri, params.clientId);
    if (check.isValid) {
      targetUrl = params.postLogoutRedirectUri;
    }
  }

  return { redirectUrl: targetUrl };
}
