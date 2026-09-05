import { verifyHmacSha256 } from './security';
import { recordAuditEvent } from './auth';
import { executeKoreyBotRun, getKoreyBotConfig, KoreyBotActionRecord } from './korey-bot';
import {
  executeCodeRabbitAutoFixAndApprove,
  CodeRabbitReviewRecord,
} from './coderabbit-bot';
import { emitGitHubPopNotification } from './notifications';
import { z } from 'zod';

export interface ProcessedWebhookEvent {
  id: string;
  deliveryId: string;
  event: string;
  sender: string;
  repository?: string;
  action?: string;
  summary: string;
  status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED';
  koreyAction?: KoreyBotActionRecord;
  coderabbitAction?: CodeRabbitReviewRecord;
  receivedAt: Date;
}

// In-memory processed deliveries cache to prevent duplicate replays
const processedDeliveryIds = new Set<string>();
const recentWebhookEvents: ProcessedWebhookEvent[] = [];

// Zod schema for general GitHub webhook payloads
const BaseWebhookPayloadSchema = z.object({
  action: z.string().optional(),
  sender: z
    .object({
      login: z.string().optional(),
    })
    .optional(),
  repository: z
    .object({
      full_name: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

function getWebhookSecret(): string {
  return process.env.GITHUB_WEBHOOK_SECRET || 'test_webhook_secret_for_local_development_minimum_32_chars';
}

/**
 * Verifies and processes incoming GitHub webhooks with HMAC-SHA256 signature verification,
 * delivery ID deduplication, and event routing for CI/CD and security monitoring.
 */
export async function processGitHubWebhook(params: {
  rawBody: string | Buffer;
  signatureHeader?: string;
  deliveryId?: string;
  eventType?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  success: boolean;
  statusCode: number;
  message: string;
  deliveryId?: string;
  eventRecord?: ProcessedWebhookEvent;
}> {
  const { rawBody, signatureHeader, deliveryId, eventType, ipAddress, userAgent } = params;

  // 1. Validate signature presence
  if (!signatureHeader) {
    recordAuditEvent({
      type: 'WEBHOOK_REJECTED',
      ipAddress,
      userAgent,
      details: { reason: 'Missing X-Hub-Signature-256 header' },
    });
    return {
      success: false,
      statusCode: 401,
      message: 'Missing required signature header',
    };
  }

  // 2. Constant-time HMAC-SHA256 signature verification
  const secret = getWebhookSecret();
  const isValidSignature = verifyHmacSha256(rawBody, signatureHeader, secret);

  if (!isValidSignature) {
    recordAuditEvent({
      type: 'WEBHOOK_REJECTED',
      ipAddress,
      userAgent,
      details: { reason: 'Invalid HMAC-SHA256 signature' },
    });
    return {
      success: false,
      statusCode: 401,
      message: 'Invalid webhook signature',
    };
  }

  // 3. Validate delivery ID presence
  if (!deliveryId) {
    recordAuditEvent({
      type: 'WEBHOOK_REJECTED',
      ipAddress,
      userAgent,
      details: { reason: 'Missing X-GitHub-Delivery header' },
    });
    return {
      success: false,
      statusCode: 400,
      message: 'Missing delivery ID header',
    };
  }

  // 4. Duplicate event detection (Idempotency)
  if (processedDeliveryIds.has(deliveryId)) {
    return {
      success: true,
      statusCode: 200,
      message: 'Duplicate event ignored (already processed)',
      deliveryId,
    };
  }

  // 5. Parse and validate JSON payload safely
  let payload: Record<string, unknown>;
  try {
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    payload = JSON.parse(bodyStr);
  } catch {
    recordAuditEvent({
      type: 'WEBHOOK_REJECTED',
      ipAddress,
      userAgent,
      details: { reason: 'Malformed JSON payload' },
    });
    return {
      success: false,
      statusCode: 400,
      message: 'Malformed JSON payload',
    };
  }

  const parsed = BaseWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    recordAuditEvent({
      type: 'WEBHOOK_REJECTED',
      ipAddress,
      userAgent,
      details: { reason: 'Payload schema validation failed' },
    });
    return {
      success: false,
      statusCode: 422,
      message: 'Payload does not match expected webhook schema',
    };
  }

  // 6. Handle supported events
  const supportedEvents = [
    'push',
    'pull_request',
    'workflow_run',
    'code_scanning_alert',
    'issue_comment',
    'pull_request_review',
  ];
  const event = eventType || 'unknown';

  if (!supportedEvents.includes(event)) {
    // Acknowledge receipt quickly for non-critical events
    return {
      success: true,
      statusCode: 200,
      message: `Event '${event}' acknowledged (no handler required)`,
      deliveryId,
    };
  }

  // Generate event summary based on event type & invoke @Korey AI Assistant Bot
  let summary = `Received ${event}`;
  const senderLogin = parsed.data.sender?.login || 'unknown';
  const repoName = parsed.data.repository?.full_name || 'sso-platform';
  let koreyAction: KoreyBotActionRecord | undefined;
  let coderabbitAction: CodeRabbitReviewRecord | undefined;

  const koreyConfig = getKoreyBotConfig();

  if (event === 'push') {
    const ref = (payload.ref as string) || 'refs/heads/main';
    summary = `Push to ${ref} by ${senderLogin}`;
  } else if (event === 'pull_request') {
    const prObj = payload.pull_request as { number?: number; title?: string; head?: { ref?: string } } | undefined;
    const prNumber = prObj?.number || (payload.number as number) || 42;
    const prTitle = prObj?.title || 'Single Sign-On Security & PKCE update';
    const branch = prObj?.head?.ref || 'feature/auth-hardening';
    const action = parsed.data.action || 'opened';

    // Auto-fix errors and auto-approve fixes with CodeRabbit Bot
    coderabbitAction = executeCodeRabbitAutoFixAndApprove({
      prNumber,
      prTitle,
      branch,
      sender: senderLogin,
      ipAddress,
      userAgent,
    });

    if (koreyConfig.autoRunEnabled && ['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(action)) {
      koreyAction = executeKoreyBotRun({
        eventType: 'pull_request',
        prNumber,
        prTitle,
        branch,
        sender: senderLogin,
        ipAddress,
        userAgent,
      });
      summary = `PR #${prNumber} (${action}): CodeRabbit auto-fixed errors & @Korey auto-approved workflow`;
    } else {
      summary = `PR #${prNumber} (${action}): CodeRabbit auto-fixed errors & approved`;
    }
  } else if (event === 'issue_comment') {
    const commentObj = payload.comment as { body?: string } | undefined;
    const commentBody = commentObj?.body || '';
    const issueObj = payload.issue as { number?: number; title?: string; pull_request?: object } | undefined;
    const prNumber = issueObj?.number || 42;
    const isPr = Boolean(issueObj?.pull_request || (payload.issue as any)?.pull_request);

    if (commentBody.toLowerCase().includes('@coderabbit') || commentBody.toLowerCase().includes('coderabbit')) {
      coderabbitAction = executeCodeRabbitAutoFixAndApprove({
        prNumber,
        prTitle: issueObj?.title || `PR #${prNumber} review`,
        sender: senderLogin,
        ipAddress,
        userAgent,
      });
      summary = `@coderabbitai command on PR #${prNumber}: auto-fixed all errors and auto-approved fix`;
    } else if (commentBody.toLowerCase().includes('@korey') || commentBody.toLowerCase().includes('korey')) {
      koreyAction = executeKoreyBotRun({
        eventType: 'issue_comment',
        prNumber,
        prTitle: issueObj?.title || `PR #${prNumber} CI/CD workflow`,
        sender: senderLogin,
        commandText: commentBody,
        ipAddress,
        userAgent,
      });
      summary = `@Korey command on PR #${prNumber}: auto-ran jobs and auto-approved`;
    } else {
      summary = `Comment on ${isPr ? 'PR' : 'Issue'} #${prNumber} by ${senderLogin}`;
    }
  } else if (event === 'workflow_run') {
    const workflow = payload.workflow as { name?: string } | undefined;
    const workflowRun = payload.workflow_run as { conclusion?: string; head_branch?: string; pull_requests?: { number?: number }[] } | undefined;
    const prNumber = workflowRun?.pull_requests?.[0]?.number || 42;

    if (koreyConfig.autoApproveEnabled && (workflowRun?.conclusion === 'success' || parsed.data.action === 'completed')) {
      koreyAction = executeKoreyBotRun({
        eventType: 'workflow_run',
        prNumber,
        branch: workflowRun?.head_branch || 'main',
        sender: senderLogin,
        ipAddress,
        userAgent,
      });
      summary = `Workflow '${workflow?.name || 'CI/CD'}' passed: @Korey auto-approved PR #${prNumber}`;
    } else {
      summary = `Workflow '${workflow?.name || 'CI'}' ${parsed.data.action || 'status update'}`;
    }
  } else if (event === 'code_scanning_alert') {
    const alert = payload.alert as { rule?: { description?: string } } | undefined;
    summary = `CodeQL Alert: ${alert?.rule?.description || 'security finding'}`;
  } else if (event === 'pull_request_review') {
    summary = `PR review ${parsed.data.action || 'submitted'} by ${senderLogin}`;
  }

  // Mark delivery ID as processed
  processedDeliveryIds.add(deliveryId);

  // Dispatch GitHub pop notification for valid webhook event
  emitGitHubPopNotification({
    type: 'GITHUB_WEBHOOK',
    title: `GitHub Event: ${event.toUpperCase()}`,
    message: summary,
    badge: repoName,
    icon: event === 'pull_request' ? 'rabbit' : 'git',
    linkTab: 'webhooks',
  });

  const eventRecord: ProcessedWebhookEvent = {
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    deliveryId,
    event,
    sender: senderLogin,
    repository: repoName,
    action: parsed.data.action,
    summary,
    status: 'PROCESSED',
    koreyAction,
    coderabbitAction,
    receivedAt: new Date(),
  };

  recentWebhookEvents.unshift(eventRecord);
  if (recentWebhookEvents.length > 50) {
    recentWebhookEvents.pop();
  }

  recordAuditEvent({
    type: 'WEBHOOK_ACCEPTED',
    ipAddress,
    userAgent,
    details: {
      deliveryId,
      event,
      repository: repoName,
      sender: senderLogin,
      koreyApproved: Boolean(koreyAction),
    },
  });

  return {
    success: true,
    statusCode: 200,
    message: `Successfully processed ${event} event`,
    deliveryId,
    eventRecord,
  };
}

export function getRecentWebhookEvents(): ProcessedWebhookEvent[] {
  return recentWebhookEvents;
}
