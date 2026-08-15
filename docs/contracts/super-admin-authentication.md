# SuperAdmin authentication contract

Status: implemented and locally tested for Release 1

## Password step

`POST /api/super-admin/login`

```json
{ "email": "platform@example.com", "password": "secret" }
```

A valid password never returns a platform session. It returns a five-minute MFA challenge:

```json
{
  "mfaRequired": true,
  "enrollmentRequired": false,
  "challengeToken": "signed-mfa-challenge"
}
```

For an account not yet enrolled, `enrollmentRequired` is `true` and `enrollment` contains a Base32
setup secret plus an `otpauthUri`. These values are returned only during that enrollment attempt
and must not be logged or persisted by the client.

Invalid email/password uses the same `401 AUTHENTICATION_REQUIRED` response. A currently locked
second factor returns `429 SUPER_ADMIN_MFA_LOCKED` with `Retry-After`.

## MFA step

`POST /api/super-admin/mfa/verify`

Authenticator request:

```json
{ "challengeToken": "signed-mfa-challenge", "code": "123456" }
```

Recovery request:

```json
{ "challengeToken": "signed-mfa-challenge", "recoveryCode": "XXXXX-XXXXX-XXXXX-XXXXX" }
```

Exactly one factor value is used. The six-digit TOTP is accepted only once for its matched time
step. A recovery code is accepted once and removed transactionally. Invalid/replayed values return
`401 SUPER_ADMIN_MFA_INVALID`; five failures produce a 15-minute
`429 SUPER_ADMIN_MFA_LOCKED` response.

Success returns the 30-minute session and public administrator identity. Enrollment success also
returns eight recovery codes exactly once:

```json
{
  "user": {
    "id": "super-admin-uuid",
    "email": "platform@example.com",
    "name": "Platform Admin",
    "role": "SUPER_ADMIN"
  },
  "recoveryCodes": ["XXXXX-XXXXX-XXXXX-XXXXX"]
}
```

## Protected session

The verification response sets the 30-minute session as an `HttpOnly`, `SameSite=Strict` cookie
scoped to `/api/super-admin` and marked `Secure` in production. Frontend JavaScript never receives
the credential. SuperAdmin requests use cookie credential mode and never attach the restaurant
bearer. The API revalidates `active`, `mfa_enabled_at`, and `session_version` against PostgreSQL on
every request. Password-only, wrong-audience, stale-version, inactive, or unenrolled credentials
fail closed.

`POST /api/super-admin/logout` requires the current session, increments the account session
version, revokes every outstanding SuperAdmin session, expires the cookie, and returns
`{ "success": true }`.

`PUT /api/super-admin/restaurants/:id/plan` additionally requires `authTime` within the preceding
10 minutes. Otherwise it returns `401 SUPER_ADMIN_REAUTH_REQUIRED`; the client clears the session
and restarts password plus MFA. There is no refresh endpoint.

## Operational requirements

- Production startup requires a dedicated `SUPER_ADMIN_MFA_ENCRYPTION_KEY` containing exactly 64
  hexadecimal characters. Generate it independently from `JWT_SECRET`.
- TLS is mandatory before enrollment or login traffic leaves localhost.
- Backups must contain the encrypted database state, while the encryption key is stored in the
  protected environment/secret backup. Neither TOTP values, setup secrets, recovery codes,
  passwords, challenge tokens, nor session tokens may enter logs or monitoring context.
- Factor reset is an operator-only recovery procedure for Release 1 and must rotate
  `session_version`. No remote bypass endpoint exists.
