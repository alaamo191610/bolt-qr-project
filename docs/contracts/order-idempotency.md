# Public order idempotency contract

Status: Backend implemented and database-verified 15 August 2026. Frontend header is integrated;
reload/mobile-resume persistence remains a frontend handoff.

## Scope and retention

Every capability-authorized dine-in `POST /api/orders` request requires an `Idempotency-Key`
header. A key is scoped to the authenticated organization, table capability ID, and capability
version. Rotating a QR capability creates a new idempotency scope; one tenant/table cannot replay or
conflict with another tenant/table's key.

Accepted keys are 16–128 characters using ASCII letters, digits, `.`, `_`, `:`, or `-`. Clients
should use a cryptographically random UUID. Keys and request bodies are not logged. Records expire
after 24 hours and may be lazily removed when the same scoped key is reused after expiry.

## Request identity

The server computes a SHA-256 hash over a canonical representation of the effect-bearing order
input: order type, items and customizations, promotion code, and tip percentage. Authorization,
request IDs, ignored body restaurant/table identity, and transport metadata are not part of the
hash.

## Responses

- First valid request: atomically creates the idempotency record, order, order items, promotion
  usage, and table mutation; returns `201` with `Idempotency-Replayed: false`.
- Same scoped key and same request hash: performs no mutation, returns the original order identity
  and current representation with `200` and `Idempotency-Replayed: true`. A fresh tracking
  credential may be issued for that same order.
- Same scoped key and different request hash: performs no mutation and returns
  `409 IDEMPOTENCY_CONFLICT`.
- Missing or malformed key: performs no order mutation and returns
  `400 IDEMPOTENCY_KEY_REQUIRED` or `400 VALIDATION_ERROR` respectively.

Concurrent requests with the same key are serialized by PostgreSQL's unique constraint. Exactly
one transaction creates the order; contenders replay the committed order or receive the payload
conflict. A failed transaction leaves neither an idempotency reservation nor a partial order.

`Idempotency-Replayed` and `X-Request-Id` are exposed through CORS so browser clients may inspect
them. Replays do not emit a second `new-order` or `table-updated` socket event.

## Database invariants

The durable record is bound by foreign keys to organization, table, capability, and order. Composite
foreign keys prevent cross-organization table/capability records. The unique scope is
`(capability_id, capability_version, key)` and each successful record references at most one unique
order.

## Frontend handoff

The current client sends `Idempotency-Key` and reuses it for an unchanged retry in the same page
lifecycle. Alaa still needs to persist the key and matching checkout fingerprint in session storage
until a definitive success or changed basket, so timeout → reload/mobile-resume uses the same key.

## Verification evidence

Unit tests cover canonical hashing, retention, and key validation. Disposable-PostgreSQL
integration tests cover missing/malformed keys, exact replay, changed-payload conflict, concurrent
submission, one promotion increment, transaction rollback, tenant/capability isolation, capability
rotation, and lazy reuse after expiry.
