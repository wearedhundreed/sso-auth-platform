import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  executeCodeRabbitAutoFixAndApprove,
  getCodeRabbitStats,
  getCodeRabbitHistory,
  updateCodeRabbitConfig,
} from '../lib/coderabbit-bot';
import {
  buildGitHubAuthorizeUrl,
  handleGitHubCallback,
  getGitHubAuthConfig,
  DEV_GITHUB_CALLBACK_URL,
} from '../lib/github-auth';
import {
  emitGitHubPopNotification,
  getRecentPopNotifications,
  markPopNotificationRead,
  markAllPopNotificationsRead,
  clearAllPopNotifications,
} from '../lib/notifications';
import { processGitHubWebhook } from '../lib/github-webhook';

function createTestSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hmac}`;
}

describe('CodeRabbit Bot Automated Error Fix & Auto-Approve Suite', () => {
  beforeEach(() => {
    updateCodeRabbitConfig({
      autoFixErrors: true,
      autoApproveFixes: true,
      autoMergeFixes: true,
    });
  });

  it('automatically detects, fixes all errors, and issues an APPROVE verdict', () => {
    const customErrors = [
      'TS2339: Property id does not exist on type unknown',
      'CWE-601: Missing strict URL scheme check in oauth callback',
    ];

    const record = executeCodeRabbitAutoFixAndApprove({
      prNumber: 77,
      prTitle: 'fix(core): resolve lint and type errors',
      branch: 'fix/type-errors',
      sender: 'junior-dev',
      customErrorDescriptions: customErrors,
    });

    expect(record.verdict).toBe('APPROVED');
    expect(record.errorsFound).toBe(2);
    expect(record.errorsFixed).toBe(2);
    expect(record.findings.every((f) => f.status === 'FIXED')).toBe(true);
    expect(record.autoMerged).toBe(true);
    expect(record.reviewComment).toContain('CodeRabbit Bot Automated Review');
    expect(record.reviewComment).toContain('Verdict: APPROVED');
  });

  it('accurately updates CodeRabbit review stats after auto-fixing errors', () => {
    const initialStats = getCodeRabbitStats();

    executeCodeRabbitAutoFixAndApprove({
      prNumber: 88,
      prTitle: 'refactor: PKCE verification algorithm',
      branch: 'refactor/pkce',
      sender: 'auth-dev',
    });

    const updatedStats = getCodeRabbitStats();
    expect(updatedStats.totalReviews).toBe(initialStats.totalReviews + 1);
    expect(updatedStats.totalErrorsFixed).toBeGreaterThan(initialStats.totalErrorsFixed);
    expect(updatedStats.totalFixesApproved).toBe(initialStats.totalFixesApproved + 1);
  });
});

describe('GitHub Preferred Auth & Callback Handling Suite', () => {
  it('returns valid GitHub OAuth config with preferred status and correct callback URLs', () => {
    const config = getGitHubAuthConfig();
    expect(config.preferred).toBe(true);
    expect(config.defaultScopes).toContain('read:user');
    expect(config.defaultScopes).toContain('user:email');
    expect(config.devCallbackUrl).toContain('/auth/github/callback');
  });

  it('generates an RFC-compliant GitHub OAuth authorization URL with CSRF state token', () => {
    const { url, state, redirectUri } = buildGitHubAuthorizeUrl();

    expect(url).toContain('https://github.com/login/oauth/authorize');
    expect(url).toContain('client_id=');
    expect(url).toContain(`state=${state}`);
    expect(url).toContain(encodeURIComponent(redirectUri));
    expect(state).toHaveLength(48); // 24 bytes hex
  });

  it('handles GitHub callback successfully with simulated credentials and sets session', async () => {
    const { state } = buildGitHubAuthorizeUrl();

    const result = await handleGitHubCallback({
      code: 'sim_github_test_code',
      state,
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest-Agent',
    });

    expect(result.success).toBe(true);
    expect(result.sessionToken).toBeDefined();
    expect(result.session).toBeDefined();
    expect(result.session?.userId).toContain('github_');
    expect(result.session?.roles).toContain('ROLE_GITHUB_SSO_USER');
  });

  it('strictly rejects GitHub callback if state token is invalid or missing', async () => {
    const result = await handleGitHubCallback({
      code: 'any_code',
      state: 'forged_or_expired_state',
      ipAddress: '198.51.100.4',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_state');
  });
});

describe('GitHub Pop Notifications Engine', () => {
  beforeEach(() => {
    clearAllPopNotifications();
  });

  it('emits and retrieves GitHub pop notifications with correct metadata and icons', () => {
    emitGitHubPopNotification({
      type: 'CODERABBIT_FIX',
      title: 'CodeRabbit Fix Applied',
      message: 'Automatically patched 2 type-safety issues.',
      badge: 'CodeRabbit AI',
    });

    const notifs = getRecentPopNotifications();
    expect(notifs.length).toBe(1);
    expect(notifs[0].type).toBe('CODERABBIT_FIX');
    expect(notifs[0].title).toBe('CodeRabbit Fix Applied');
    expect(notifs[0].read).toBe(false);
  });

  it('marks individual and all pop notifications as read', () => {
    const notif1 = emitGitHubPopNotification({
      type: 'CODERABBIT_APPROVAL',
      title: 'PR #10 Approved',
      message: 'Approved fix.',
    });
    emitGitHubPopNotification({
      type: 'GITHUB_AUTH_SUCCESS',
      title: 'GitHub SSO Signed In',
      message: 'User logged in.',
    });

    markPopNotificationRead(notif1.id);
    let current = getRecentPopNotifications();
    expect(current.find((n) => n.id === notif1.id)?.read).toBe(true);

    markAllPopNotificationsRead();
    current = getRecentPopNotifications();
    expect(current.every((n) => n.read)).toBe(true);
  });
});

describe('Webhook Integration with CodeRabbit Bot', () => {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || 'test_webhook_secret_for_local_development_minimum_32_chars';

  it('triggers CodeRabbit auto-fix and auto-approval when PR webhook arrives', async () => {
    const payload = {
      action: 'opened',
      number: 144,
      pull_request: {
        number: 144,
        title: 'fix(auth): correct token validation race condition',
        head: { ref: 'fix/token-race' },
      },
      sender: { login: 'contributor-alex' },
      repository: { full_name: 'enterprise/sso-platform' },
    };

    const rawBody = JSON.stringify(payload);
    const signature = createTestSignature(rawBody, webhookSecret);

    const result = await processGitHubWebhook({
      rawBody,
      signatureHeader: signature,
      deliveryId: `deliv_cr_${Date.now()}`,
      eventType: 'pull_request',
      ipAddress: '127.0.0.1',
    });

    expect(result.success).toBe(true);
    expect(result.eventRecord?.coderabbitAction).toBeDefined();
    expect(result.eventRecord?.coderabbitAction?.verdict).toBe('APPROVED');
    expect(result.eventRecord?.coderabbitAction?.errorsFixed).toBeGreaterThan(0);
  });

  it('triggers CodeRabbit auto-fix when @coderabbitai comment is received', async () => {
    const payload = {
      action: 'created',
      issue: {
        number: 155,
        title: 'Review PR 155',
        pull_request: {},
      },
      comment: {
        body: '@coderabbitai please review and auto-fix all errors',
      },
      sender: { login: 'senior-architect' },
      repository: { full_name: 'enterprise/sso-platform' },
    };

    const rawBody = JSON.stringify(payload);
    const signature = createTestSignature(rawBody, webhookSecret);

    const result = await processGitHubWebhook({
      rawBody,
      signatureHeader: signature,
      deliveryId: `deliv_cr_comment_${Date.now()}`,
      eventType: 'issue_comment',
      ipAddress: '127.0.0.1',
    });

    expect(result.success).toBe(true);
    expect(result.eventRecord?.summary).toContain('@coderabbitai command on PR #155');
  });
});
