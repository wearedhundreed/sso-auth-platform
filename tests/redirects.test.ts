import { describe, it, expect } from 'vitest';
import {
  isSafeUrl,
  validateRedirectUri,
  validateLogoutRedirectUri,
} from '../lib/redirects';

describe('Redirect Allowlisting & Anti-Open-Redirect Suite', () => {
  it('accepts legitimate HTTPS URLs and localhost in development', () => {
    expect(isSafeUrl('https://engineering.example.com/auth/callback')).toBe(true);
    expect(isSafeUrl('http://localhost:3000/auth/callback')).toBe(true);
    expect(isSafeUrl('/dashboard')).toBe(true);
  });

  it('rejects forbidden and malicious URI schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects protocol-relative and backslash obfuscation tricks', () => {
    expect(isSafeUrl('//evil.com/phish')).toBe(false);
    expect(isSafeUrl('/\\evil.com')).toBe(false);
    expect(isSafeUrl('\\evil.com')).toBe(false);
  });

  it('validates registered application callback URLs', () => {
    const valid = validateRedirectUri(
      'https://engineering.example.com/auth/callback',
      'client_eng_prod_9921'
    );
    expect(valid.isValid).toBe(true);
    expect(valid.application?.name).toBe('Engineering Portal');
  });

  it('rejects unregistered external domains even if syntactically valid HTTPS', () => {
    const invalid = validateRedirectUri(
      'https://unauthorized-attacker.example.com/callback',
      'client_eng_prod_9921'
    );
    expect(invalid.isValid).toBe(false);
    expect(invalid.reason).toContain('not present in the application allowlist');
  });

  it('rejects invalid or unknown client IDs', () => {
    const invalid = validateRedirectUri(
      'https://engineering.example.com/auth/callback',
      'non_existent_client_id_000'
    );
    expect(invalid.isValid).toBe(false);
    expect(invalid.reason).toContain('Unknown or disabled application');
  });

  it('validates registered logout redirect URLs', () => {
    const valid = validateLogoutRedirectUri(
      'https://student.example.com/auth/logout',
      'client_student_prod_4432'
    );
    expect(valid.isValid).toBe(true);
  });

  it('rejects unapproved post-logout redirect destinations', () => {
    const invalid = validateLogoutRedirectUri(
      'https://phishing-site.example.com/fake-logout',
      'client_student_prod_4432'
    );
    expect(invalid.isValid).toBe(false);
  });
});
