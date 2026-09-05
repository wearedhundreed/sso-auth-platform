import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { processGitHubWebhook } from '../lib/github-webhook';

describe('GitHub Webhook Verification & Processing Suite', () => {
  const secret = 'test_webhook_secret_for_local_development_minimum_32_chars';

  function createSignature(payload: string, testSecret: string = secret): string {
    const hmac = crypto.createHmac('sha256', testSecret).update(payload).digest('hex');
    return `sha256=${hmac}`;
  }

  it('successfully processes a valid signed push event', async () => {
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      sender: { login: 'dev-lead' },
      repository: { full_name: 'enterprise/sso-platform' },
    });
    const deliveryId = `test_delivery_${Date.now()}_1`;
    const signature = createSignature(payload);

    const result = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: signature,
      deliveryId,
      eventType: 'push',
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.message).toContain('push');
  });

  it('rejects webhooks with missing signature header', async () => {
    const payload = JSON.stringify({ ping: true });

    const result = await processGitHubWebhook({
      rawBody: payload,
      deliveryId: 'delivery_missing_sig',
      eventType: 'ping',
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.message).toContain('Missing required signature header');
  });

  it('rejects webhooks with invalid HMAC signatures', async () => {
    const payload = JSON.stringify({ test: 'tampered' });
    const tamperedSignature = createSignature(payload, 'wrong-attacker-secret-key-12345');

    const result = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: tamperedSignature,
      deliveryId: `delivery_bad_sig_${Date.now()}`,
      eventType: 'push',
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.message).toContain('Invalid webhook signature');
  });

  it('detects duplicate events using delivery IDs (idempotency)', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      sender: { login: 'octocat' },
      repository: { full_name: 'enterprise/sso-platform' },
    });
    const deliveryId = `unique_delivery_id_${Date.now()}`;
    const signature = createSignature(payload);

    // First call: successfully processed
    const firstResult = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: signature,
      deliveryId,
      eventType: 'pull_request',
    });
    expect(firstResult.success).toBe(true);
    expect(firstResult.message).toContain('pull_request');

    // Second call with same delivery ID: deduplicated
    const duplicateResult = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: signature,
      deliveryId,
      eventType: 'pull_request',
    });
    expect(duplicateResult.success).toBe(true);
    expect(duplicateResult.message).toContain('Duplicate event ignored');
  });

  it('rejects malformed JSON payloads', async () => {
    const malformedBody = '{"not_valid_json":';
    const signature = createSignature(malformedBody);

    const result = await processGitHubWebhook({
      rawBody: malformedBody,
      signatureHeader: signature,
      deliveryId: `delivery_malformed_${Date.now()}`,
      eventType: 'push',
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('Malformed JSON');
  });

  it('processes CodeQL code_scanning_alert webhooks', async () => {
    const payload = JSON.stringify({
      action: 'created',
      alert: {
        rule: { description: 'Cross-Site Scripting (XSS) detected' },
      },
      sender: { login: 'github-code-scanning' },
      repository: { full_name: 'enterprise/sso-platform' },
    });
    const deliveryId = `delivery_codeql_${Date.now()}`;
    const signature = createSignature(payload);

    const result = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: signature,
      deliveryId,
      eventType: 'code_scanning_alert',
    });

    expect(result.success).toBe(true);
    expect(result.eventRecord?.summary).toContain('CodeQL Alert');
  });
});
