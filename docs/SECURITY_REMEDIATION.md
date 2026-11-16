# Security remediation and release blockers

The current `main` branch contains demonstration functionality and must not be exposed as a production identity service without remediation.

## Confirmed from source inspection

- `/auth/login-consent` renders a username/password form and dummy credentials. This must be removed; the application must never collect upstream passwords.
- The login route can generate simulated callback codes and a simulated ID token.
- `handleCallback` accepts `sim_code_*` and `test_auth_code` as successful authentication paths.
- `lib/oidc.ts` stores pending OIDC state in process memory and synthesizes authorization/token/JWKS endpoints from the issuer URL.
- `lib/session.ts` uses a hard-coded default session secret and in-memory session/revocation maps.
- `/api/test/simulate-sso-login` can create a session from a demo authorization code.
- Some management and test endpoints in `server.ts` do not show an authentication/authorization middleware at the route definition.
- The README's production-ready wording is not supported by the inspected runtime behavior.

## Required before production

1. Remove demo credential form and simulated login/callback code paths from production builds. Test-only helpers must be isolated from production routing and disabled by default.
2. Use OIDC discovery metadata and a maintained JWT/JWKS validation library. Validate exact issuer, audience, nonce, expiry, authorized party where applicable, and allowed signing algorithms.
3. Use a durable shared store for state, sessions, revocation, audit records, and device-pairing challenges. Do not rely on process memory in multi-instance deployments.
4. Fail closed when required production secrets are absent. Remove hard-coded fallback secrets.
5. Add authentication and role/ownership authorization to every protected API. Enforce admin grants server-side; never trust UI state or user-editable metadata.
6. Use distributed rate limiting and CSRF protection for state-changing cookie-authenticated endpoints.
7. Configure secure cookie attributes and ensure production HTTPS; validate proxy trust configuration for the actual host.
8. Review CORS, CSP, iframe policy, and OAuth callback behavior for the final domains.
9. Run the full CI suite, dependency audit, security tests, and real-tenant end-to-end tests.
10. Review audit logging and ensure no codes, tokens, secrets, passwords, or session cookies are logged.

## Release status

This branch's PWA and deployment documentation are preparatory work. They do not, by themselves, complete or validate the authentication backend.
