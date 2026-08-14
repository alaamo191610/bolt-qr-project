# ADR 0007: Public order entry and abuse policy

Status: Option A and dine-in defaults selected by Yazan; capability slice implemented 14 August
2026 — Alaa sign-off and remaining M2 controls pending

## Recorded decision

Yazan selected **Option A: disable takeaway for Release 1** and subsequently accepted all mandatory
dine-in session, rate-limit, line-item, and open-order defaults in this ADR. The server now rejects
takeaway before opening the order transaction with `403 ORDER_TYPE_DISABLED`; integration evidence
verifies no order is created. Alaa's sign-off remains tracked by the joint execution plan.

## Current risk

The capability slice removes request-body tenant/table trust and disables anonymous takeaway, but
the public write is not release-ready until durable idempotency, open-order capacity, ordering
pause/overload behavior, rejection telemetry, and a production shared limiter are complete. The
current in-process limiter cannot coordinate horizontally scaled instances.

## Mandatory controls for every option

- Dine-in identity comes from a 256-bit random, revocable QR capability bound to one organization
  and table; request-body restaurant/table identity is ignored.
- The QR capability is exchanged for a 30-minute table session and can be revoked by disabling or
  rotating the table capability.
- Order creation requires a client-generated idempotency key retained for 24 hours. Same key and
  payload returns the original result; same key with changed payload returns
  `409 IDEMPOTENCY_CONFLICT`.
- Default limits: 20 capability exchanges per IP per 10 minutes, 10 per capability per 10 minutes,
  6 order attempts per table session per 10 minutes, and 120 per organization per 10 minutes.
- Maximum 3 open orders per table session and 50 line items per order.
- Restaurant-controlled ordering pause and closed/overloaded state reject before order mutation.
- Rejections emit request ID, organization/table identifiers, reason code, and counters without
  logging basket contents or customer secrets.
- Production limits use a shared store; PostgreSQL remains authoritative for idempotency.

## Takeaway decision required

### Option A — Disable takeaway in Release 1

Only capability-scoped dine-in ordering is enabled. `type: take_away` returns a stable disabled
error until a verified takeaway entry flow is released.

Benefits: smallest secure Release 1 scope and removes the anonymous unbounded write immediately.

Cost: customers cannot submit takeaway orders during Release 1.

### Option B — Enable takeaway with verified contact

Require a one-time code sent by an approved email/SMS provider. A successful challenge creates a
15-minute restaurant-bound takeaway session. Recommended limits are 5 code requests per contact per
hour, 10 per IP per hour, and 5 order attempts per verified session per 15 minutes.

Benefits: meaningful anti-automation proof and a recovery/contact channel.

Cost: provider cost, privacy/retention decisions, delivery failures, and additional frontend states.

### Option C — Anonymous takeaway with managed challenge

Issue a restaurant-bound session only after a managed CAPTCHA/challenge, then apply the mandatory
limits and idempotency controls.

Benefits: no contact collection.

Cost/risk: weaker proof, accessibility/privacy/vendor concerns, and determined automation can still
obtain sessions. A public token issued solely from predictable restaurant input is not sufficient.

## Recommendation

Choose **Option A for Release 1**. Build the dine-in capability, idempotency, pause control, and
shared abuse controls first. If takeaway is a launch requirement, choose **Option B** rather than C.

## Approval syntax

Record one choice and whether the proposed defaults are accepted:

- `Takeaway: A — disabled for Release 1; abuse defaults accepted`
- `Takeaway: B — verified contact; abuse defaults accepted`
- `Takeaway: C — managed challenge; abuse defaults accepted`

Any changed limit or session lifetime must be written explicitly with the choice.

## Implementation evidence — table capability slice

- A dedicated `table_capabilities` record stores only a SHA-256 hash and is protected by a
  composite table/organization foreign key, positive-version check, and hash-format check.
- Authenticated rotation returns a new 256-bit secret once; rotation and revocation increment the
  version used to invalidate already-issued sessions.
- Public exchange issues only a 30-minute `table-session`, with accepted 20/IP and 10/capability
  exchange limits. Order creation also applies the accepted 6/capability-session and
  120/organization attempt limits in the current bounded local limiter.
- Dine-in creation requires and transactionally revalidates the session under a capability-row
  lock, derives all ownership identity from it, ignores body identity for authorization, and
  enforces 1–50 line items.
- Unit, PostgreSQL integration, frontend regression, and E2E suites pass. Invalid, rotated,
  revoked, cross-tenant, cross-organization-constraint, and body-substitution cases fail closed.

Idempotency, durable three-open-order enforcement, pause/closed/overload behavior, safe rejection
telemetry, and the production shared limiter remain separate mandatory M2/M3 points.
