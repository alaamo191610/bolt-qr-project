# ADR 0002: Release 1 scope and security gates

Status: Proposed for joint Yazan/Alaa sign-off

## Decisions to record before M1/M2

- POS remains parked for Release 1; dormant POS tables and migrations are not deleted.
- Public ordering must use a high-entropy, revocable, restaurant/table-bound capability and
  a short-lived table session. A predictable table lookup is discovery only, not authorization.
- Restaurant and SuperAdmin credentials are separate token classes with explicit purpose,
  issuer, audience, expiry, and re-authentication rules. Order tracking is a third minimal
  credential class and is never accepted for mutation.
- Durable order idempotency is scoped to tenant and session. A replay of the same key and
  payload returns the original committed result; a changed payload is a conflict.
- Tenant enforcement is defense in depth: application query scoping plus database ownership
  constraints, with the RLS decision recorded before production data is exposed.

## Open approvals

Takeaway entry, tracking-token recovery, log retention/access, storage/error/mail/rate-limit
providers, browser session storage, RLS versus compensating controls, RPO/RTO and budget,
ordering pause/capacity behavior, and SuperAdmin MFA/session duration require both owners'
sign-off. Implementation must not silently invent these policies.
