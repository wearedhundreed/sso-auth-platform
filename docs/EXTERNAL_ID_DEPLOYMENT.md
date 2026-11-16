# Microsoft Entra External ID deployment runbook

This project targets a **customer/external tenant**. Do not substitute a workforce tenant authority.

## Application registration

Create an app registration in the External ID tenant for the web application.

- Supported account type: accounts in this external tenant.
- Platform: Web (confidential server-side application).
- Redirect URI: `https://AUTH_HOST/auth/callback`
- Post-logout redirect: `https://AUTH_HOST/` (configure the matching Entra logout URL as applicable).
- Use Authorization Code flow with PKCE (S256).
- Create a client credential only if the server-side confidential-client configuration requires it. Store it only in the host's secret manager; never in Wix, browser JavaScript, source control, or a mobile binary.
- Configure the customer sign-up/sign-in user flow and the identity providers required by the product.

## External tenant authority

Use the tenant's CIAM authority:

`https://TENANT_SUBDOMAIN.ciamlogin.com/`

The tenant-specific discovery document is:

`https://TENANT_SUBDOMAIN.ciamlogin.com/TENANT_ID/v2.0/.well-known/openid-configuration`

Use the exact issuer, authorization endpoint, token endpoint, and JWKS URI published by that document. Do not synthesize token endpoint paths or issuer strings in production code.

## Host environment variables

Set these in the hosting provider's secret manager:

- `APP_URL`: canonical HTTPS authentication-app URL
- `OIDC_ISSUER`: exact issuer from discovery metadata
- `OIDC_DISCOVERY_URL`: exact discovery document URL
- `OIDC_CLIENT_ID`: app registration client ID
- `OIDC_CLIENT_SECRET`: server-only credential when using a confidential web client
- `OIDC_CALLBACK_URL`: exact registered callback URL
- `SESSION_SECRET`: cryptographically random secret of at least 32 bytes
- `DATABASE_URL`: production PostgreSQL connection string

Never commit real values. Do not use placeholder or demo values in production.

## Verification

1. Fetch the discovery URL and verify its issuer equals the configured issuer exactly.
2. Verify the callback URL matches the app registration byte-for-byte.
3. Test a real sign-in and verify state, nonce, PKCE S256, issuer, audience, signature, and expiry.
4. Verify logout clears the local session and performs the provider logout flow when configured.
5. Verify the app never logs authorization codes, tokens, cookies, client secrets, or passwords.
6. Verify unregistered redirect URIs and expired/replayed states are rejected.

## Features and boundaries

- Password reset and account recovery are provided by the configured External ID user flow; this app must redirect users to that flow rather than collect passwords.
- Passkeys are configured as an identity-provider authentication method where supported by the tenant and its user-flow capabilities.
- TOTP/MFA is controlled by the identity provider. A separate authenticator vault is a different product feature and needs its own threat model and encrypted storage.
- WebAuthn passkeys for this application's own relying-party origin are separate from Entra sign-in.
- Native iOS Face ID is not required for the PWA. The PWA can use WebAuthn/passkeys where supported by iOS Safari and the relying party.
- Device linking requires short-lived, one-time pairing challenges, authenticated approval by the primary device, and server-side replay prevention. It is not implemented merely by enabling device authorization in Entra.

## Release gate

Do not label the deployment production-ready until persistent state/session storage, distributed rate limiting, real tenant sign-in, logout, account recovery, RLS/authorization tests, and deployment smoke tests have passed.
