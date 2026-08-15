# ADR 0009: SuperAdmin MFA and session policy

Status: Accepted and implemented locally for Release 1

## Context

The platform SuperAdmin can inspect every restaurant and change subscription limits. The previous
password-only JWT lasted 24 hours, persisted across browser restarts, and had no database revocation
state. That risk is materially higher than an individual restaurant-admin session.

The Phase 1 pilot intentionally avoids another hosted identity provider, so the control must work
with one Node process and local PostgreSQL while retaining a migration path to WebAuthn or a managed
identity provider later.

## Decision

- Every SuperAdmin login requires a password and RFC 6238 TOTP. Existing accounts enroll after
  their next successful password check; password verification never returns an API session.
- TOTP uses a 160-bit random seed, SHA-1 interoperability, six digits, 30-second steps, ±1 step
  clock tolerance, and a persisted last-used step to reject replay.
- The seed is encrypted with AES-256-GCM under a dedicated 32-byte production key. That key is
  separate from the JWT secret and is supplied as 64 hexadecimal characters through
  `SUPER_ADMIN_MFA_ENCRYPTION_KEY`.
- Enrollment returns eight high-entropy one-time recovery codes once. PostgreSQL stores only keyed
  hashes, and successful recovery consumes one code transactionally.
- Five failed second-factor attempts lock the account's MFA verification for 15 minutes. The
  existing bounded IP login limiter remains an additional control.
- A five-minute `super-admin-mfa-challenge` can complete MFA but cannot authenticate an API route.
- A completed `super-admin-session` lasts 30 minutes, has no refresh path, carries `mfa`,
  `authTime`, and `sessionVersion`, and is delivered only in an `HttpOnly`, `SameSite=Strict`
  cookie (`Secure` in production). Frontend JavaScript never receives or stores it.
- Every SuperAdmin request checks active status, MFA enrollment, and current database
  `session_version`. Logout increments that version and revokes all outstanding sessions.
- Platform-changing writes require an MFA authentication event no older than 10 minutes. After
  that window, the administrator performs the full password-plus-MFA login again.
- There is no self-service factor reset in Release 1. Recovery uses a remaining recovery code;
  complete factor loss requires a controlled operator/database recovery procedure and session
  version rotation. A reset endpoint must not be added without a separate reviewed recovery ADR.

## Consequences

The first login after deployment is an enrollment event and must happen over verified TLS. The
operator must save recovery codes before entering the dashboard and back up the MFA encryption key
separately from the encrypted database backup. Losing both authenticator/recovery codes or losing
the encryption key requires manual recovery.

This TOTP design is phishing-susceptible and is not the final high-assurance architecture. Adopt
WebAuthn/passkeys or a managed identity provider when the team or threat profile grows.

## References

- [RFC 6238 — TOTP](https://www.rfc-editor.org/info/rfc6238/)
- [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [NIST SP 800-63B session guidance](https://pages.nist.gov/800-63-4/sp800-63b.html)
