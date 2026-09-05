import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  SECURITY_HEADERS,
  checkRateLimit,
} from './lib/security';
import {
  initiateLogin,
  handleCallback,
  handleLogout,
  getRecentAuditLogs,
} from './lib/auth';
import {
  verifySessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  DEV_SESSION_COOKIE_NAME,
} from './lib/session';
import { registeredApplications } from './lib/redirects';
import {
  processGitHubWebhook,
  getRecentWebhookEvents,
} from './lib/github-webhook';
import {
  getKoreyBotStats,
  getKoreyBotHistory,
  executeKoreyBotRun,
  updateKoreyBotConfig,
} from './lib/korey-bot';
import {
  getGitHubAuthConfig,
  buildGitHubAuthorizeUrl,
  handleGitHubCallback,
  DEV_GITHUB_CALLBACK_URL,
  SHARED_GITHUB_CALLBACK_URL,
} from './lib/github-auth';
import {
  getCodeRabbitStats,
  getCodeRabbitHistory,
  executeCodeRabbitAutoFixAndApprove,
  updateCodeRabbitConfig,
} from './lib/coderabbit-bot';
import {
  getRecentPopNotifications,
  emitGitHubPopNotification,
  markPopNotificationRead,
  markAllPopNotificationsRead,
  clearAllPopNotifications,
} from './lib/notifications';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

// Trust reverse proxy for correct client IP detection (X-Forwarded-For)
app.set('trust proxy', 1);

// 1. Mandatory Security Headers Middleware
app.use((_req, res, next) => {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(header, value);
  }
  res.removeHeader('X-Powered-By');
  next();
});

// 2. Cookie parser
app.use(cookieParser());

// 3. Raw body preservation for Webhook HMAC SHA-256 verification
app.use(
  express.json({
    verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// 4. Rate Limiting Middleware for Auth & Sensitive Endpoints
function rateLimitMiddleware(limit: number = 60, windowMs: number = 60_000) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.path}:${ip}`;
    const status = checkRateLimit(key, limit, windowMs);

    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', status.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(status.resetTime / 1000).toString());

    if (!status.allowed) {
      res.status(429).json({
        error: 'too_many_requests',
        message: 'Rate limit exceeded. Please retry shortly.',
      });
      return;
    }
    next();
  };
}

// ==============================================================================
// SSO & AUTHENTICATION ENDPOINTS
// ==============================================================================

/**
 * GET /login
 * Initiates standard OIDC Authorization Code Flow with PKCE.
 */
app.get('/login', rateLimitMiddleware(30, 60_000), (req, res) => {
  const targetRedirectUri = (req.query.redirect_uri as string) || undefined;
  const targetClientId = (req.query.client_id as string) || undefined;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];

  try {
    const { authorizationUrl, state } = initiateLogin({
      targetRedirectUri,
      targetClientId,
      ipAddress,
      userAgent,
    });

    // If client requested JSON (e.g. from UI testing modal)
    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      res.json({ authorizationUrl, state });
      return;
    }

    // If OIDC_ISSUER is not set to an external authority or interactive mode is requested,
    // route to the interactive login & application consent screen
    if (
      req.query.interactive === 'true' ||
      !process.env.OIDC_ISSUER ||
      process.env.OIDC_ISSUER.includes('example.com')
    ) {
      res.redirect(`/auth/login-consent?state=${encodeURIComponent(state)}`);
      return;
    }

    res.redirect(authorizationUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid login parameters';
    res.redirect(`/auth/error?error=invalid_request&error_description=${encodeURIComponent(msg)}`);
  }
});

/**
 * GET /auth/login-consent
 * Interactive login and multi-application consent portal.
 * Demonstrates zero password interception error and provides clean callback links to exchange code.
 */
app.get('/auth/login-consent', (req, res) => {
  const state = (req.query.state as string) || 'sim_state_dev_demo';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const origin = `${protocol}://${host}`;

  const cleanCallbackUrl = `${origin}/auth/callback?code=sim_code_enterprise_user&state=${encodeURIComponent(state)}`;
  const cleanErrorCallbackUrl = `${origin}/auth/callback?error=access_denied&error_description=${encodeURIComponent('Direct password interception rejected by zero-trust policy')}`;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>SSO Login &amp; Application Consent | Zero Password Interception</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { background-color: #080808; color: #e5e5e5; font-family: ui-sans-serif, system-ui, sans-serif; }
        </style>
      </head>
      <body class="min-h-screen flex items-center justify-center p-4 selection:bg-purple-500 selection:text-white">
        <div class="w-full max-w-xl bg-[#0f0f0f] border border-[#222222] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-[#1f1f1f] pb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold text-lg shadow-inner">
                🛡️
              </div>
              <div>
                <h1 class="text-base sm:text-lg font-semibold text-white tracking-tight">Enterprise SSO &amp; Consent Portal</h1>
                <p class="text-xs text-neutral-400">OpenID Connect &bull; OAuth 2.0 PKCE &bull; Zero Interception</p>
              </div>
            </div>
            <span class="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              Active Security
            </span>
          </div>

          <!-- Application Access & Consent Section -->
          <div class="bg-[#141414] border border-[#262626] rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-xs font-semibold text-neutral-200 uppercase tracking-wider">Application Access Request</h2>
                <p class="text-[11px] text-neutral-400">The following applications are requesting federated identity:</p>
              </div>
              <label class="flex items-center gap-2 cursor-pointer bg-[#1c1c1c] hover:bg-[#252525] px-3 py-1.5 rounded-lg border border-[#333] transition">
                <input type="checkbox" id="accept-all-checkbox" checked class="w-4 h-4 rounded text-purple-600 focus:ring-0 cursor-pointer" />
                <span class="text-xs font-medium text-purple-300 font-mono">Accept all applications</span>
              </label>
            </div>

            <div id="apps-list" class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div class="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-between">
                <span class="text-xs text-neutral-300 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Engineering Portal
                </span>
                <span class="text-[10px] font-mono text-neutral-500">client_eng_prod_9921</span>
              </div>
              <div class="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-between">
                <span class="text-xs text-neutral-300 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Enterprise Sales CRM
                </span>
                <span class="text-[10px] font-mono text-neutral-500">client_sales_crm_4412</span>
              </div>
              <div class="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-between">
                <span class="text-xs text-neutral-300 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                  HR Directory
                </span>
                <span class="text-[10px] font-mono text-neutral-500">client_hr_portal_1109</span>
              </div>
              <div class="p-2.5 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] flex items-center justify-between">
                <span class="text-xs text-neutral-300 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                  CodeRabbit AI &amp; GitHub SSO
                </span>
                <span class="text-[10px] font-mono text-neutral-500">preferred_provider</span>
              </div>
            </div>
            <p id="consent-status" class="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5">
              <span>✓</span> 4 of 4 applications accepted for federated token exchange.
            </p>
          </div>

          <!-- Direct Username & Password Input Form -->
          <form id="credentials-form" class="space-y-4">
            <div class="space-y-1.5">
              <label for="username" class="block text-xs font-medium text-neutral-300">
                Username / Corporate Email
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value="user@enterprise.example.com"
                required
                class="w-full px-3 py-2 bg-[#141414] border border-[#2a2a2a] rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label for="password" class="block text-xs font-medium text-neutral-300">
                  Password
                </label>
                <span class="text-[10px] text-neutral-500">Test Password Interception</span>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                value="EnterpriseSecret2026!"
                required
                class="w-full px-3 py-2 bg-[#141414] border border-[#2a2a2a] rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>

            <button
              type="submit"
              id="btn-submit-credentials"
              class="w-full py-2.5 px-4 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-medium text-xs rounded-lg transition shadow-md shadow-purple-950/40 flex items-center justify-center gap-2"
            >
              <span>Submit Direct Credentials</span>
              <span class="text-[10px] font-mono bg-black/30 px-1.5 py-0.5 rounded text-purple-200">Test Policy</span>
            </button>
          </form>

          <!-- Explicit Error Box on Password Input (Revealed upon form submission) -->
          <div id="error-box" class="hidden border border-rose-800/60 bg-rose-950/40 rounded-xl p-4 space-y-2">
            <div class="flex items-center gap-2 text-rose-400 font-semibold text-xs">
              <span class="text-base">⚠️</span>
              <span>Authentication Error: Direct Password Interception Prohibited</span>
            </div>
            <p class="text-xs text-rose-200/90 leading-relaxed">
              Under <strong>RFC 6749</strong> and <strong>OpenID Connect PKCE</strong> specifications, client applications and intermediate SSO brokers are strictly forbidden from intercepting, storing, or handling raw passwords.
            </p>
            <div class="bg-black/50 p-2 rounded text-[11px] font-mono text-neutral-300 flex justify-between">
              <span>Credential Leak Status:</span>
              <span class="text-emerald-400 font-bold">0 Leaked (Discarded from Memory)</span>
            </div>
          </div>

          <!-- Clean Callback Links Section -->
          <div class="border-t border-[#1f1f1f] pt-4 space-y-4">
            <h3 class="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Clean Callback Links to Exchange Code
            </h3>

            <!-- 1. Clean Code Exchange Callback -->
            <div class="bg-[#121212] border border-[#222] rounded-xl p-3.5 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Clean Code Exchange Callback Link
                </span>
                <button
                  type="button"
                  onclick="navigator.clipboard.writeText('${cleanCallbackUrl}'); this.innerText='Copied!';"
                  class="text-[10px] font-mono px-2 py-1 rounded bg-[#1f1f1f] hover:bg-[#2a2a2a] text-neutral-300 border border-[#333]"
                >
                  Copy Link
                </button>
              </div>
              <div class="p-2 rounded bg-black/60 border border-[#1a1a1a] text-[10px] font-mono text-neutral-300 break-all select-all">
                ${cleanCallbackUrl}
              </div>
              <div class="flex gap-2 pt-1">
                <a
                  id="btn-clean-exchange-code"
                  href="${cleanCallbackUrl}"
                  class="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg text-center transition flex items-center justify-center gap-2 shadow-sm shadow-emerald-950/50"
                >
                  <span>Exchange Code &amp; Log In</span>
                  <span>&rarr;</span>
                </a>
              </div>
            </div>

            <!-- 2. Clean Error Callback -->
            <div class="bg-[#121212] border border-[#222] rounded-xl p-3.5 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-rose-400 flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-rose-400"></span>
                  Clean Error Callback Link
                </span>
                <button
                  type="button"
                  onclick="navigator.clipboard.writeText('${cleanErrorCallbackUrl}'); this.innerText='Copied!';"
                  class="text-[10px] font-mono px-2 py-1 rounded bg-[#1f1f1f] hover:bg-[#2a2a2a] text-neutral-300 border border-[#333]"
                >
                  Copy Link
                </button>
              </div>
              <div class="p-2 rounded bg-black/60 border border-[#1a1a1a] text-[10px] font-mono text-neutral-300 break-all select-all">
                ${cleanErrorCallbackUrl}
              </div>
              <a
                id="btn-clean-error-callback"
                href="${cleanErrorCallbackUrl}"
                class="block py-2 px-3 bg-[#181818] hover:bg-[#222] border border-[#333] text-rose-300 text-xs font-medium rounded-lg text-center transition"
              >
                Trigger Error Callback Flow (Access Denied)
              </a>
            </div>

            <!-- Alternative: GitHub Preferred Auth -->
            <div class="pt-2 text-center">
              <a
                href="/auth/github/callback"
                class="text-xs text-neutral-400 hover:text-white underline transition"
              >
                Or complete with GitHub Preferred SSO Callback &rarr;
              </a>
            </div>
          </div>

        </div>

        <script>
          const form = document.getElementById('credentials-form');
          const errorBox = document.getElementById('error-box');
          const acceptAll = document.getElementById('accept-all-checkbox');
          const consentStatus = document.getElementById('consent-status');

          acceptAll.addEventListener('change', () => {
            if (acceptAll.checked) {
              consentStatus.innerHTML = '<span class="text-emerald-400">✓ 4 of 4 applications accepted for federated token exchange.</span>';
            } else {
              consentStatus.innerHTML = '<span class="text-amber-400">⚠️ All applications deselected. User authorization pending.</span>';
            }
          });

          form.addEventListener('submit', (e) => {
            e.preventDefault();
            // Show error immediately upon input of username and password
            errorBox.classList.remove('hidden');
            errorBox.scrollIntoView({ behavior: 'smooth' });
          });
        </script>
      </body>
    </html>
  `);
});

/**
 * GET /auth/callback
 * Validates state, exchanges authorization code, verifies ID token & signature,
 * sets secure HttpOnly session cookie, and redirects to authorized application.
 */
app.get('/auth/callback', rateLimitMiddleware(30, 60_000), async (req, res) => {
  const code = (req.query.code as string) || undefined;
  const state = (req.query.state as string) || undefined;
  const error = (req.query.error as string) || undefined;
  const errorDescription = (req.query.error_description as string) || undefined;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];

  const result = await handleCallback({
    code,
    state,
    error,
    errorDescription,
    ipAddress,
    userAgent,
  });

  if (result.success && result.sessionToken) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = getSessionCookieOptions();

    // Set secure, HttpOnly, SameSite=Lax cookie
    res.cookie(isProd ? SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME, result.sessionToken, cookieOpts);
    res.cookie(DEV_SESSION_COOKIE_NAME, result.sessionToken, { ...cookieOpts, secure: isProd });
  }

  res.redirect(result.redirectUrl);
});

/**
 * GET /auth/logout
 * Destroys authenticated session, clears cookies, returns user strictly to registered logout redirect.
 */
app.get('/auth/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const token = req.cookies[isProd ? SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME] || req.cookies[DEV_SESSION_COOKIE_NAME];
  let sessionId: string | undefined;

  if (token) {
    const verified = verifySessionToken(token);
    sessionId = verified?.sessionId;
  }

  const postLogoutRedirect = (req.query.post_logout_redirect_uri as string) || undefined;
  const clientId = (req.query.client_id as string) || undefined;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];

  const { redirectUrl } = handleLogout({
    sessionId,
    postLogoutRedirectUri: postLogoutRedirect,
    clientId,
    ipAddress,
    userAgent,
  });

  // Clear session cookies
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.clearCookie(DEV_SESSION_COOKIE_NAME, { path: '/' });

  res.redirect(redirectUrl);
});

// ==============================================================================
// GITHUB OAUTH PREFERRED IDENTITY PROVIDER & CALLBACK HANDLING
// ==============================================================================

/**
 * GET /api/auth/github/config
 * Returns GitHub OAuth setup status and preferred callback URLs.
 */
app.get('/api/auth/github/config', (_req, res) => {
  res.json(getGitHubAuthConfig());
});

/**
 * GET /api/auth/github/url
 * Generates an RFC-compliant GitHub OAuth authorization URL with CSRF state token.
 */
app.get('/api/auth/github/url', (req, res) => {
  const redirectUri = (req.query.redirect_uri as string) || undefined;
  const result = buildGitHubAuthorizeUrl({ redirectUri });
  res.json(result);
});

/**
 * GET /auth/github/callback and /auth/github/callback/
 * Handles GitHub OAuth callback. Exchanges code, validates state, issues session.
 * Adheres to popup-based postMessage pattern and iframe cookie requirements.
 */
app.get(['/auth/github/callback', '/auth/github/callback/'], async (req, res) => {
  const code = (req.query.code as string) || '';
  const state = (req.query.state as string) || '';
  const error = (req.query.error as string) || '';
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];

  if (error || !code || !state) {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Failed</title></head>
        <body style="background:#050505;color:#f87171;font-family:sans-serif;padding:24px;text-align:center;">
          <h2>GitHub Authentication Failed</h2>
          <p>${error || 'Missing authorization code or state.'}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${error || 'missing_params'}' }, '*');
              setTimeout(() => window.close(), 1500);
            } else {
              setTimeout(() => window.location.href = '/', 2000);
            }
          </script>
        </body>
      </html>
    `);
    return;
  }

  const result = await handleGitHubCallback({
    code,
    state,
    ipAddress,
    userAgent,
  });

  if (result.success && result.sessionToken) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = getSessionCookieOptions();

    // Required for iframe preview environment: SameSite=None, Secure=true
    res.cookie(isProd ? SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME, result.sessionToken, {
      ...cookieOpts,
      sameSite: 'none',
      secure: true,
    });
    res.cookie(DEV_SESSION_COOKIE_NAME, result.sessionToken, {
      ...cookieOpts,
      sameSite: 'none',
      secure: true,
    });

    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>GitHub Authentication Successful</title></head>
        <body style="background:#050505;color:#34d399;font-family:sans-serif;padding:32px;text-align:center;">
          <h2 style="margin-bottom:8px;">Authentication Successful</h2>
          <p style="color:#a3a3a3;font-size:14px;">Redirecting you back to the platform...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body style="background:#050505;color:#f87171;font-family:sans-serif;padding:24px;text-align:center;">
          <h2>Authentication Verification Failed</h2>
          <p>${result.errorDescription || 'Could not verify GitHub authentication response.'}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${result.error || 'verification_failed'}' }, '*');
              setTimeout(() => window.close(), 2000);
            } else {
              setTimeout(() => window.location.href = '/', 2000);
            }
          </script>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/auth/github/simulate
 * Simulates immediate GitHub OAuth SSO login in preview environment.
 */
app.post('/api/auth/github/simulate', async (req, res) => {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];

  const { state } = buildGitHubAuthorizeUrl();
  const result = await handleGitHubCallback({
    code: 'sim_github_auth_code',
    state,
    ipAddress,
    userAgent,
  });

  if (result.success && result.sessionToken) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = getSessionCookieOptions();
    res.cookie(isProd ? SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME, result.sessionToken, cookieOpts);
    res.cookie(DEV_SESSION_COOKIE_NAME, result.sessionToken, { ...cookieOpts, secure: isProd });

    res.json({
      success: true,
      message: 'Signed in via GitHub SSO (Preferred Identity Provider)',
      session: result.session,
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'GitHub simulation failed',
      error: result.errorDescription,
    });
  }
});

// ==============================================================================
// GITHUB WEBHOOK INTEGRATION
// ==============================================================================

/**
 * POST /api/github/webhook
 * Verifies X-Hub-Signature-256 HMAC-SHA256, validates delivery ID deduplication,
 * and processes push, pull_request, workflow_run, code_scanning_alert events.
 */
app.post('/api/github/webhook', rateLimitMiddleware(60, 60_000), async (req: express.Request & { rawBody?: string }, res) => {
  const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
  const deliveryId = req.headers['x-github-delivery'] as string | undefined;
  const eventType = req.headers['x-github-event'] as string | undefined;
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];

  const result = await processGitHubWebhook({
    rawBody,
    signatureHeader,
    deliveryId,
    eventType,
    ipAddress,
    userAgent,
  });

  res.status(result.statusCode).json({
    status: result.success ? 'accepted' : 'rejected',
    message: result.message,
    deliveryId: result.deliveryId,
  });
});

// ==============================================================================
// SECURE REST API ENDPOINTS FOR DASHBOARD & MANAGEMENT
// ==============================================================================

/**
 * GET /api/session
 * Returns safe identity profile info. Never exposes tokens, secrets, or keys.
 */
app.get('/api/session', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const token = req.cookies[isProd ? SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME] || req.cookies[DEV_SESSION_COOKIE_NAME];

  if (!token) {
    res.json({ authenticated: false });
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    res.json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      userId: session.userId,
      name: session.name,
      email: session.email,
      roles: session.roles,
      expiresAt: session.expiresAt,
    },
  });
});

/**
 * GET /api/applications
 * Returns authorized application registry. Does not expose client secrets.
 */
app.get('/api/applications', (_req, res) => {
  res.json({
    applications: registeredApplications.map((app) => ({
      id: app.id,
      name: app.name,
      clientId: app.clientId,
      redirectUris: app.redirectUris,
      logoutRedirectUris: app.logoutRedirectUris,
      allowedOrigins: app.allowedOrigins,
      enabled: app.enabled,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    })),
  });
});

/**
 * GET /api/audit-logs
 * Returns sanitized security audit logs.
 */
app.get('/api/audit-logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({ logs: getRecentAuditLogs(limit) });
});

/**
 * GET /api/webhook-events
 * Returns recent GitHub webhook processing history.
 */
app.get('/api/webhook-events', (_req, res) => {
  res.json({ events: getRecentWebhookEvents() });
});

/**
 * GET /api/korey-bot/stats
 * Returns Korey AI Assistant Bot configuration, operational stats, and execution count.
 */
app.get('/api/korey-bot/stats', (_req, res) => {
  res.json(getKoreyBotStats());
});

/**
 * GET /api/korey-bot/history
 * Returns recent automated runs and approvals by @Korey bot.
 */
app.get('/api/korey-bot/history', (_req, res) => {
  res.json({ history: getKoreyBotHistory() });
});

/**
 * POST /api/korey-bot/config
 * Updates Korey Bot auto-run and auto-approve settings.
 */
app.post('/api/korey-bot/config', (req, res) => {
  const updated = updateKoreyBotConfig(req.body);
  res.json({ success: true, config: updated });
});

/**
 * POST /api/korey-bot/dispatch
 * Programmatically triggers @Korey AI Assistant Bot to auto-run CI/CD jobs and approve a PR.
 */
app.post('/api/korey-bot/dispatch', (req, res) => {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];
  const prNumber = req.body.prNumber ? parseInt(req.body.prNumber, 10) : undefined;

  const record = executeKoreyBotRun({
    eventType: req.body.eventType || 'pull_request',
    prNumber,
    prTitle: req.body.prTitle,
    branch: req.body.branch,
    sender: req.body.sender || 'contributor',
    commandText: req.body.commandText,
    ipAddress,
    userAgent,
  });

  res.json({
    success: true,
    message: `@Korey AI Assistant Bot executed CI/CD jobs and approved PR #${record.prNumber}`,
    record,
  });
});

/**
 * POST /api/test/simulate-sso-login
 * Developer/Auditor tool to simulate an end-to-end authorized login using test vectors.
 */
app.post('/api/test/simulate-sso-login', async (req, res) => {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];

  // Initiate login with test engineering portal redirect
  const { state } = initiateLogin({
    targetRedirectUri: 'http://localhost:3000/auth/callback',
    targetClientId: 'client_eng_prod_9921',
    ipAddress,
    userAgent,
  });

  // Complete callback with simulator code
  const result = await handleCallback({
    code: 'sim_code_enterprise_user',
    state,
    ipAddress,
    userAgent,
  });

  if (result.success && result.sessionToken) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = getSessionCookieOptions();
    res.cookie(isProd ? SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME, result.sessionToken, cookieOpts);
    res.cookie(DEV_SESSION_COOKIE_NAME, result.sessionToken, { ...cookieOpts, secure: isProd });

    res.json({
      success: true,
      message: 'Simulated SSO authentication succeeded',
      session: result.session,
      redirectUrl: '/dashboard',
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Simulation failed',
      error: result.errorDescription,
    });
  }
});

/**
 * POST /api/test/simulate-webhook
 * Developer/Auditor tool to dispatch a test GitHub webhook with authentic HMAC SHA-256 signature.
 */
app.post('/api/test/simulate-webhook', async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET || 'test_webhook_secret_for_local_development_minimum_32_chars';
  const event = (req.body.event as string) || 'push';
  const deliveryId = `sim_delivery_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  let payloadObj: Record<string, unknown> = {
    sender: { login: req.body.sender || 'security-auditor' },
    repository: { full_name: 'enterprise/sso-platform' },
  };

  if (event === 'push') {
    payloadObj = {
      ...payloadObj,
      ref: 'refs/heads/main',
      commits: [{ message: 'feat: add strict PKCE validation' }],
    };
  } else if (event === 'pull_request') {
    const prNumber = req.body.prNumber || 42;
    payloadObj = {
      ...payloadObj,
      action: req.body.action || 'opened',
      number: prNumber,
      pull_request: {
        number: prNumber,
        title: req.body.prTitle || 'feat(sso): automated token integrity and PKCE compliance',
        head: { ref: req.body.branch || 'feature/sso-hardening' },
      },
    };
  } else if (event === 'issue_comment') {
    payloadObj = {
      ...payloadObj,
      action: 'created',
      issue: {
        number: req.body.prNumber || 42,
        title: 'Security PR for SSO review',
        pull_request: {},
      },
      comment: {
        body: req.body.commentBody || '@Korey auto-approve and run CI/CD jobs',
      },
    };
  } else if (event === 'code_scanning_alert') {
    payloadObj = {
      ...payloadObj,
      action: 'created',
      alert: { rule: { description: 'CodeQL verified zero high vulnerabilities' } },
    };
  } else if (event === 'workflow_run') {
    payloadObj = {
      ...payloadObj,
      action: 'completed',
      workflow: { name: 'CI/CD Pipeline' },
      workflow_run: { conclusion: 'success', head_branch: 'main' },
    };
  }

  const rawBody = JSON.stringify(payloadObj);
  const signature = req.body.tamperSignature
    ? 'sha256=invalid_tampered_signature_hex_0000000000'
    : `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  const result = await processGitHubWebhook({
    rawBody,
    signatureHeader: req.body.missingSignature ? undefined : signature,
    deliveryId: req.body.duplicateDelivery ? 'sim_delivery_duplicate_fixed_id' : deliveryId,
    eventType: event,
    ipAddress: '127.0.0.1',
    userAgent: 'GitHub-Hookshot/simulated',
  });

  res.status(result.statusCode).json(result);
});

// ==============================================================================
// CODERABBIT BOT AUTOMATED ERROR FIX & APPROVAL ENDPOINTS
// ==============================================================================

/**
 * GET /api/coderabbit/stats
 * Returns CodeRabbit bot statistics and automated error resolution metrics.
 */
app.get('/api/coderabbit/stats', (_req, res) => {
  res.json(getCodeRabbitStats());
});

/**
 * GET /api/coderabbit/history
 * Returns audit history of all CodeRabbit automated fixes and reviews.
 */
app.get('/api/coderabbit/history', (_req, res) => {
  res.json(getCodeRabbitHistory());
});

/**
 * POST /api/coderabbit/autofix
 * Auto fixes all errors using CodeRabbit AI and automatically approves the PR.
 */
app.post('/api/coderabbit/autofix', (req, res) => {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'];
  const prNumber = req.body.prNumber ? parseInt(req.body.prNumber, 10) : 42;

  const record = executeCodeRabbitAutoFixAndApprove({
    prNumber,
    prTitle: req.body.prTitle,
    branch: req.body.branch,
    sender: req.body.sender || 'contributor',
    customErrorDescriptions: req.body.errors,
    ipAddress,
    userAgent,
  });

  res.json({
    success: true,
    message: `CodeRabbit bot auto-fixed all ${record.errorsFixed} errors and auto-approved PR #${record.prNumber}`,
    record,
  });
});

/**
 * POST /api/coderabbit/config
 * Updates CodeRabbit configuration settings.
 */
app.post('/api/coderabbit/config', (req, res) => {
  const updated = updateCodeRabbitConfig(req.body);
  res.json({ success: true, config: updated });
});

// ==============================================================================
// GITHUB POP NOTIFICATIONS ENDPOINTS
// ==============================================================================

/**
 * GET /api/notifications
 * Returns recent GitHub pop notifications.
 */
app.get('/api/notifications', (_req, res) => {
  res.json(getRecentPopNotifications());
});

/**
 * POST /api/notifications/read
 * Marks a notification as read.
 */
app.post('/api/notifications/read', (req, res) => {
  const { id } = req.body;
  if (id) {
    markPopNotificationRead(id);
  }
  res.json({ success: true });
});

/**
 * POST /api/notifications/read-all
 * Marks all notifications as read.
 */
app.post('/api/notifications/read-all', (_req, res) => {
  markAllPopNotificationsRead();
  res.json({ success: true });
});

/**
 * POST /api/notifications/clear
 * Clears all pop notifications.
 */
app.post('/api/notifications/clear', (_req, res) => {
  clearAllPopNotifications();
  res.json({ success: true });
});

/**
 * POST /api/notifications/test
 * Emits a test GitHub pop notification.
 */
app.post('/api/notifications/test', (req, res) => {
  const notif = emitGitHubPopNotification({
    type: req.body.type || 'CODERABBIT_APPROVAL',
    title: req.body.title || 'CodeRabbit Bot: All Errors Auto-Fixed',
    message: req.body.message || 'Auto-resolved 3 TypeScript and security issues and submitted approval.',
    badge: req.body.badge || 'CodeRabbit AI',
    icon: req.body.icon || 'rabbit',
    linkTab: req.body.linkTab || 'webhooks',
  });
  res.json({ success: true, notification: notif });
});

// ==============================================================================
// FRONTEND SERVING (VITE SPA / PRODUCTION DIST)
// ==============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SSO Platform] Production server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
