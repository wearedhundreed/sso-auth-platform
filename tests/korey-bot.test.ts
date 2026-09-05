import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { processGitHubWebhook } from '../lib/github-webhook';
import { getKoreyBotStats, getKoreyBotHistory, executeKoreyBotRun, updateKoreyBotConfig } from '../lib/korey-bot';

describe('Korey AI Assistant Bot CI/CD & Auto-Approval Suite', () => {
  const secret = 'test_webhook_secret_for_local_development_minimum_32_chars';

  function createSignature(payload: string): string {
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${hmac}`;
  }

  it('provides initial bot configuration with auto-run and auto-approve enabled', () => {
    const stats = getKoreyBotStats();
    expect(stats.botHandle).toBe('@Korey');
    expect(stats.autoRunEnabled).toBe(true);
    expect(stats.autoApproveEnabled).toBe(true);
  });

  it('executes a complete automated CI/CD job and auto-approves a pull request', () => {
    const record = executeKoreyBotRun({
      eventType: 'pull_request',
      prNumber: 99,
      prTitle: 'feat(pkce): enforce strict S256 code challenge verification',
      branch: 'feat/pkce-s256',
      sender: 'auth-eng',
    });

    expect(record.verdict).toBe('APPROVED');
    expect(record.checksRun.length).toBeGreaterThan(0);
    expect(record.checksRun.every((c) => c.status === 'PASSED')).toBe(true);
    expect(record.approvalComment).toContain('@Korey');
    expect(record.approvalComment).toContain('APPROVE');
    expect(record.autoMerged).toBe(true);
  });

  it('triggers @Korey auto-run and auto-approval upon receiving pull_request opened webhook', async () => {
    const payload = JSON.stringify({
      action: 'opened',
      number: 104,
      pull_request: {
        number: 104,
        title: 'fix(cookie): secure SameSite=Lax session flags',
        head: { ref: 'fix/samesite-cookies' },
      },
      sender: { login: 'dev-lead' },
      repository: { full_name: 'enterprise/sso-platform' },
    });
    const deliveryId = `korey_deliv_pr_${Date.now()}`;
    const signature = createSignature(payload);

    const result = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: signature,
      deliveryId,
      eventType: 'pull_request',
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.eventRecord?.koreyAction).toBeDefined();
    expect(result.eventRecord?.koreyAction?.verdict).toBe('APPROVED');
    expect(result.eventRecord?.summary).toContain('@Korey');
  });

  it('triggers @Korey auto-run and auto-approval when mentioned in an issue/PR comment', async () => {
    const payload = JSON.stringify({
      action: 'created',
      issue: {
        number: 108,
        title: 'Refactor OAuth state nonce validation',
        pull_request: {},
      },
      comment: {
        body: 'Hey @Korey please run all CI/CD jobs and auto-approve this pull request',
      },
      sender: { login: 'senior-engineer' },
      repository: { full_name: 'enterprise/sso-platform' },
    });
    const deliveryId = `korey_deliv_comment_${Date.now()}`;
    const signature = createSignature(payload);

    const result = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: signature,
      deliveryId,
      eventType: 'issue_comment',
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.eventRecord?.koreyAction).toBeDefined();
    expect(result.eventRecord?.koreyAction?.verdict).toBe('APPROVED');
    expect(result.eventRecord?.summary).toContain('@Korey');
  });

  it('triggers @Korey auto-approval when CI workflow_run completes successfully', async () => {
    const payload = JSON.stringify({
      action: 'completed',
      workflow: { name: 'SSO Platform CI/CD Pipeline' },
      workflow_run: {
        conclusion: 'success',
        head_branch: 'main',
        pull_requests: [{ number: 112 }],
      },
      sender: { login: 'github-actions[bot]' },
      repository: { full_name: 'enterprise/sso-platform' },
    });
    const deliveryId = `korey_deliv_workflow_${Date.now()}`;
    const signature = createSignature(payload);

    const result = await processGitHubWebhook({
      rawBody: payload,
      signatureHeader: signature,
      deliveryId,
      eventType: 'workflow_run',
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.eventRecord?.koreyAction).toBeDefined();
    expect(result.eventRecord?.koreyAction?.verdict).toBe('APPROVED');
  });

  it('supports updating bot configuration toggles dynamically', () => {
    const updated = updateKoreyBotConfig({ autoMergeEnabled: false });
    expect(updated.autoMergeEnabled).toBe(false);

    // Reset back to true
    updateKoreyBotConfig({ autoMergeEnabled: true });
    expect(getKoreyBotStats().autoMergeEnabled).toBe(true);
  });
});
