# Secure Multi-Application SSO Platform

A production-ready, standards-compliant Single Sign-On (SSO) authentication platform built with OpenID Connect (OIDC) and OAuth 2.0 Authorization Code Flow with Proof Key for Code Exchange (PKCE, RFC 7636).

Provides centralized federated identity for multiple enterprise applications with automated GitHub CI/CD, CodeQL security analysis, GitHub webhook verification with HMAC-SHA256, PostgreSQL/Prisma persistence, and tamper-evident security auditing.

---

## 1. Project Overview

The **Secure Multi-Application SSO Platform** serves as an identity broker and authorization gateway. It federates multiple registered client applications (e.g., Engineering Portal, Student Portal, Finance Hub) through OpenID Connect while strictly enforcing zero-trust security standards:

- **Zero Password Interception**: The platform never collects, inspects, stores, or processes users' identity-provider passwords or credentials.
- **Strict PKCE Enforced**: High-entropy 48-byte verifiers and S256 challenges prevent authorization code injection and interception.
- **Anti-Open-Redirect Architecture**: Redirects and post-logout destinations are strictly validated against registered application records. Wildcards and unapproved external domains are unconditionally rejected.
- **Tamper-Evident Audit Trail**: Every authentication state check, token exchange, logout, and webhook delivery is recorded with automatic credential redaction.
- **Cryptographic Webhook Security**: Constant-time HMAC-SHA256 verification and delivery ID deduplication protect GitHub webhook integration.

---

## 2. Architecture

```
User
  ↓
Authorized Application (e.g., Engineering Portal)
  ↓
GET /login?client_id=...&redirect_uri=...
  ↓
Generate State, Nonce, PKCE S256 Challenge
  ↓
OIDC Authorization Endpoint (Auth0 / Okta / IdP)
  ↓
User Authentication (MFA / Biometrics / SSO)
  ↓
Authorization Code
  ↓
GET /auth/callback?code=...&state=...
  ↓
Server-Side Token Exchange (with code_verifier)
  ↓
OIDC Token Validation (Signature, Iss, Aud, Exp, Nonce, Sub)
  ↓
Secure HttpOnly, Secure, SameSite=Lax Session Cookie
  ↓
Redirect to Approved Application Callback URL
```

---

## 3. Local Installation

```bash
# 1. Clone repository
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd sso-platform

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env.local

# 4. Generate Prisma database schema
npx prisma generate

# 5. Run database migrations
npx prisma migrate dev --name init

# 6. Run automated test suite (32 unit & security tests)
npm test

# 7. Start local development server
npm run dev
```

---

## 4. Node.js Requirements

- **Node.js**: `v20.x` or `v22.x` LTS
- **npm**: `v10.x` or higher
- ES Module runtime with native crypto support

---

## 5. PostgreSQL Setup

Provision a PostgreSQL 15+ database instance:

```sql
CREATE DATABASE sso_platform;
CREATE USER sso_admin WITH ENCRYPTED PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE sso_platform TO sso_admin;
```

Connection string format:
```env
DATABASE_URL="postgresql://sso_admin:REPLACE_WITH_SECURE_PASSWORD@localhost:5432/sso_platform?schema=public&sslmode=prefer"
```

---

## 6. Prisma Setup

The platform uses Prisma ORM with models defined in `prisma/schema.prisma`:

- `User`: Sanitized identity claims (sub, email, name, roles). Strictly no passwords.
- `Application`: Federation registry with strict redirect allowlists.
- `Session`: Active server-side sessions with automatic expiration.
- `AuthenticationEvent`: Immutable security audit log.
- `WebhookEvent`: Delivery registry for idempotent webhook deduplication.

Apply schema migrations:
```bash
npx prisma migrate deploy
```

---

## 7. Environment Variables

Configure the following variables in `.env.local` or your production secret manager:

| Variable | Description | Example Placeholder |
|---|---|---|
| `APP_URL` | Base URL of SSO platform (HTTPS in prod) | `https://sso.example.com` |
| `OIDC_ISSUER` | OpenID Connect Provider Issuer URL | `https://YOUR-TENANT.auth0.com/` |
| `OIDC_CLIENT_ID` | Platform OIDC Client ID | `your-auth0-client-id` |
| `OIDC_CLIENT_SECRET` | Platform OIDC Client Secret | `your-auth0-client-secret` |
| `OIDC_CALLBACK_URL` | Platform callback handler endpoint | `https://sso.example.com/auth/callback` |
| `OIDC_ERROR_URL` | Safe error page endpoint | `https://sso.example.com/auth/error` |
| `OIDC_LOGOUT_CALLBACK_URL` | Safe post-logout destination | `https://sso.example.com/auth/logout` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `SESSION_SECRET` | Cryptographic session signing key (min 32 chars) | `generate-random-secret-key-32-chars` |
| `GITHUB_WEBHOOK_SECRET` | HMAC-SHA256 secret for GitHub webhooks | `generate-random-webhook-secret` |
| `NODE_ENV` | Environment identifier | `production` |

---

## 8. OIDC Provider Configuration (Auth0 / Enterprise IdP)

In your Auth0 or OIDC Identity Provider Dashboard:

1. **Create Application**: Select **Regular Web Application**.
2. **Token Endpoint Authentication Method**: `POST` (or Private Key JWT).
3. **Allowed Callback URLs**:
   ```
   https://YOUR-DOMAIN.example/auth/callback
   ```
4. **Allowed Logout URLs**:
   ```
   https://YOUR-DOMAIN.example/auth/logout
   ```
5. **Allowed Web Origins**:
   ```
   https://YOUR-DOMAIN.example
   ```
6. **Grant Types Enabled**: Authorization Code, Refresh Token.
7. **Proof Key for Code Exchange (PKCE)**: Enforced.

---

## 9. Callback Configuration

The callback endpoint is located at `GET /auth/callback`.

Security verification performed upon every callback:
1. `state` validation against stored in-flight state (prevents CSRF).
2. State consumption (deleted after first use to prevent replay).
3. Server-to-server token exchange with `code_verifier`.
4. Token header verification: algorithm cannot be `none`.
5. Cryptographic signature verification.
6. `iss` must match configured `OIDC_ISSUER`.
7. `aud` must contain configured `OIDC_CLIENT_ID`.
8. `exp` must be strictly in the future (with 60-second skew tolerance).
9. `nonce` must exactly match the nonce generated at login initiation.
10. `sub` must be present and valid.

---

## 10. Error Callback Configuration

The error page is located at `GET /auth/error`.

Safe error categories supported:
- `access_denied`: User canceled or lacking required permissions.
- `login_required`: Upstream session expired.
- `interaction_required`: Additional MFA or biometric verification needed.
- `consent_required`: OAuth scopes require authorization.
- `invalid_request`: Missing state or replay attack intercepted.
- `server_error`: Upstream identity service failure.

**Security Rule**: Never outputs tokens, authorization codes, secrets, or internal stack traces.

---

## 11. Logout Configuration

Endpoint: `GET /auth/logout?post_logout_redirect_uri=...&client_id=...`

1. Destroys active session record in database.
2. Clears HttpOnly session cookies across `/`.
3. Validates `post_logout_redirect_uri` against the registered application allowlist.
4. Returns user strictly to the approved destination or default login page.

---

## 12. Multi-Application SSO Configuration

Applications are registered in PostgreSQL with explicit callback allowlists:

```json
{
  "name": "Engineering Portal",
  "client_id": "client_eng_prod_9921",
  "redirect_uris": [
    "https://engineering.example.com/auth/callback"
  ],
  "logout_redirect_uris": [
    "https://engineering.example.com/auth/logout"
  ],
  "allowed_origins": [
    "https://engineering.example.com"
  ],
  "enabled": true
}
```

Wildcards (`*`), `javascript:`, `data:`, and unregistered external domains are strictly prohibited.

---

## 13. GitHub Repository Configuration

Initialize and push to your private or organization GitHub repository:

```bash
git init
git add .
git commit -m "Initial secure SSO platform"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

Branch protection rules for `main`:
- Require pull request reviews before merging.
- Require status checks to pass:
  - `Build, Lint, Test & Audit` (`.github/workflows/ci.yml`)
  - `CodeQL Security Scan` (`.github/workflows/codeql.yml`)
- Require branches to be up to date before merging.

---

## 14. GitHub Deploy Key Configuration

For automated server deployments:

```bash
# Generate dedicated Ed25519 deploy key
ssh-keygen -t ed25519 -C "sso-deployment" -f ~/.ssh/sso_deployment
```

- Add **ONLY** `sso_deployment.pub` to **GitHub &rarr; Settings &rarr; Deploy Keys**.
- Keep **Allow write access** unchecked (least-privilege read-only).
- **NEVER** commit or upload the private key `sso_deployment`.

---

## 15. GitHub Webhook Configuration

Endpoint:
```
https://YOUR-DOMAIN.example/api/github/webhook
```

1. **Payload URL**: `https://YOUR-DOMAIN.example/api/github/webhook`
2. **Content type**: `application/json`
3. **Secret**: Generated 32+ character random secret (matching `GITHUB_WEBHOOK_SECRET`).
4. **Events**: `push`, `pull_request`, `workflow_run`, `code_scanning_alert`.
5. **Security**: Verifies `X-Hub-Signature-256` via `crypto.timingSafeEqual`. Stores `X-GitHub-Delivery` to deduplicate replayed events.

---

## 16. CodeQL Configuration

Configured in `.github/codeql/codeql-config.yml` and `.github/workflows/codeql.yml`:

- Runs on `push` to `main`, `pull_request`, and weekly scheduled scans.
- Query suite: `security-extended`.
- Scans `app/`, `lib/`, `components/`, and `tests/`.

---

## 17. CI/CD Pipeline

Configured in `.github/workflows/ci.yml`:
1. `npm ci` (deterministic dependency installation)
2. `npm run lint` (TypeScript compilation checks)
3. `npm audit --audit-level=high` (vulnerability audit)
4. `npm test` (32 unit, security, and integration tests)
5. `npm run build` (production asset compilation)

---

## 18. Testing

Run automated tests:

```bash
# Run all Vitest security, auth, redirect, and webhook suites
npm test
```

Test coverage includes:
- PKCE S256 code challenge calculation verification
- Constant-time HMAC signature checks
- Rejection of unsigned tokens (`alg: none`)
- Rejection of tampered signatures
- Rejection of mismatched nonces (replay prevention)
- Rejection of expired tokens
- Rejection of unauthorized callback URLs
- Rejection of open redirect attacks (`javascript:`, `data:`, `file:`, `//attacker.com`)
- Delivery ID deduplication (webhook idempotency)
- Redaction of sensitive fields in audit logs

---

## 19. Production Deployment

Deployable to AWS, Azure, Google Cloud Run, Vercel, or custom Docker container:

```bash
# Build production assets and CommonJS bundle
npm run build

# Start production server
npm run start
```

Ensure reverse proxy sets `X-Forwarded-For` and `X-Forwarded-Proto: https`.

---

## 20. Security Model & Defensive Controls

1. **RFC 7636 PKCE**: S256 code challenge generation and verification prevents code injection.
2. **Strict Cookie Flags**: `HttpOnly; Secure; SameSite=Lax; Path=/` protects session cookies from XSS and CSRF.
3. **Security Headers**: Restrictive Content-Security-Policy (CSP), Strict-Transport-Security (HSTS 1 year with preload), X-Content-Type-Options (`nosniff`), X-Frame-Options (`SAMEORIGIN`), Referrer-Policy (`strict-origin-when-cross-origin`).
4. **Rate Limiting**: Sliding-window rate limiter protects `/login`, `/auth/callback`, and `/api/github/webhook`.
5. **No Credential Harvesting**: Passwords are never collected, logged, or processed.

---

## 21. Troubleshooting

- **`Issuer mismatch`**: Verify that `OIDC_ISSUER` has a trailing slash matching your IdP (e.g. `https://tenant.auth0.com/`).
- **`Invalid state`**: Occurs if the callback was initiated without a corresponding `/login` session or state expired (>10 minutes).
- **`Nonce mismatch`**: The ID token nonce did not match the login session nonce. Replay attack blocked.
- **`Webhook 401 Invalid signature`**: Check that `GITHUB_WEBHOOK_SECRET` on your server exactly matches the secret configured in GitHub.
