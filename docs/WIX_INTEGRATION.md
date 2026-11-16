# Wix + MOREDESA Authentication Integration

## Recommended boundary

Wix is the public website and content-management layer. The SSO application remains a separately hosted security application. Do not implement token exchange, client secrets, session signing, authorization decisions, or privileged API calls in Wix browser code or Velo frontend code.

## Public website

1. Create the Wix site and use it for marketing pages, product information, help, and public navigation.
2. Add a clearly labelled **Sign in** link pointing to the deployed SSO application, for example `https://auth.YOUR-DOMAIN/`.
3. Add a **Create account** link pointing to the External ID user-flow entry point through the SSO application's login route.
4. Do not embed the sign-in page in an iframe. Use a top-level redirect so Microsoft-hosted authentication, passkeys, MFA, and browser security controls work normally.
5. Configure the SSO app's exact callback URL in the Microsoft Entra External ID app registration. Do not use wildcard redirect URLs.

## Wix member experience

Wix Members and Microsoft Entra External ID are separate identity systems. Do not assume that a Wix member session is an Entra session. If Wix needs authenticated profile data, use a backend-to-backend integration with a narrowly scoped API and validate the SSO application's session on the server. Never send Entra access tokens or refresh tokens to Wix page code.

## Domain layout

- Public site: `www.YOUR-DOMAIN` (Wix)
- Authentication application: `auth.YOUR-DOMAIN` (dedicated Node application)
- API: same-origin server routes initially; separate API hostname only if required later

Use DNS records and TLS settings recommended by Wix for the public hostname. Keep the authentication hostname pointed at the application host, not Wix.

## Acceptance checks

- Wix sign-in link opens the dedicated authentication app.
- Authentication uses a top-level Microsoft redirect, not a password form hosted by Wix.
- Callback URL exactly matches the Entra app registration.
- Unauthenticated users cannot access protected SSO APIs.
- Wix pages never receive server-side secrets, session signing keys, or refresh tokens.
