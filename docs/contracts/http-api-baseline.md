# HTTP API baseline contract

Status: M0/M1 implementation baseline

## Correlation

Every response includes `X-Request-Id`. Clients may send a short header-safe
`X-Request-Id`; invalid or oversized values are replaced with a generated UUID.
The same value is returned in JSON error bodies as `requestId`.

## Error body

Existing clients may continue reading `error`. New clients should use the stable fields:

```json
{
  "error": "Human-readable, client-safe message",
  "code": "RATE_LIMITED",
  "requestId": "request-correlation-id",
  "retryAfter": 30
}
```

`retryAfter` is present only when the client should wait before retrying. Current status/code
mapping is `401/AUTHENTICATION_REQUIRED`, `403/ACCESS_DENIED`, `409/CONFLICT`,
`429/RATE_LIMITED`, other `4xx/VALIDATION_ERROR`, and `5xx/SERVER_ERROR`.
Server exception details, SQL/Prisma messages, stacks, tokens, and request bodies are not
returned or logged by the foundation boundary.

Endpoint-specific policy errors may override the generic status mapping. For Release 1,
`POST /api/orders` with `type: take_away` returns `403` with
`code: ORDER_TYPE_DISABLED` and performs no order, promotion, or table mutation.

Capability-authorized dine-in orders require a valid `Idempotency-Key`. Missing keys return
`400 IDEMPOTENCY_KEY_REQUIRED`; malformed keys return `400 VALIDATION_ERROR`; reuse with a changed
payload returns `409 IDEMPOTENCY_CONFLICT`. First creation returns `201` and
`Idempotency-Replayed: false`; an unchanged replay returns the same order with `200` and
`Idempotency-Replayed: true`. Both `Idempotency-Replayed` and `X-Request-Id` are CORS-exposed.

A table session may have at most three open (`pending`, `preparing`, or `ready`) orders. A new order
at capacity returns `409 ORDER_LIMIT_REACHED` without mutation. Exact idempotency replay remains
successful at capacity; `served` and `cancelled` orders no longer consume a slot. See the
[public order-capacity contract](order-capacity.md).

Branch ordering availability is managed through tenant-scoped owner/manager GET/PUT endpoints.
New orders return `409 RESTAURANT_PAUSED`, `409 RESTAURANT_CLOSED`,
`409 RESTAURANT_OVERLOADED`, or `409 TABLE_UNAVAILABLE` before mutation. Exact replay remains
available. See the [public order availability contract](public-order-availability.md).

## Authentication classes

Restaurant endpoints require a verified `restaurant-session` token. SuperAdmin endpoints
require `super-admin-session`. Customer status and the corresponding socket room require
`order-tracking`; it is read-only and cannot authenticate an admin route. All classes carry
issuer, audience, purpose, subject where applicable, and expiry claims.

Realtime room authority is derived from verified credentials rather than client-supplied tenant
or restaurant identifiers. Versioned socket events are best-effort hints; clients recover from
reconnect or process restart through authoritative tenant-scoped HTTP refetch. See the
[order realtime integrity contract](order-realtime-integrity.md).

Dine-in order creation requires the separate 30-minute `table-session` class with audience
`table-ordering`. It is issued only by exchanging a current high-entropy table capability and
cannot authenticate restaurant, SuperAdmin, tracking, or socket-admin routes. See the
[table-capability contract](table-capability.md) for its claims and lifecycle.

## Limiting

The M1 local limiter returns `429` plus `Retry-After` and `code: RATE_LIMITED`. Its state is
bounded and expires. It is not a production horizontal-scaling solution; M3 replaces it with
a shared limiter while PostgreSQL remains the durable source for committed-order idempotency.

## Compatibility and ownership

The existing success response shapes remain unchanged in the foundation slice. New tenant and
idempotency endpoints must publish method/path, request/response types,
authorization rules, and stable error codes before frontend consumption.

Takeaway is disabled for Release 1. Dine-in now derives organization, restaurant, branch, and table
identity from a database-revalidated table capability/session and ignores public request-body
identity for authorization. Durable backend idempotency and per-session open-order capacity are
implemented. Branch pause/closure/overload, table availability, and safe local rejection telemetry
are also implemented. A production shared limiter, frontend state-control/key-persistence work, and
real-backend E2E evidence remain launch blockers.

Authorized/versioned order realtime and authoritative reconnect/resume refetch are implemented as
documented in `order-realtime-integrity.md`. The remaining M2 launch work is the joint tracking
expiry/recovery decision, legacy QR/admin UI and client handoff, real-backend golden E2E, and
staging evidence.

The legacy `GET /api/tables/public/:code` predictable table lookup has been removed. QR clients
must use the capability embedded in the current QR and `POST /api/public/table-session`; no
public endpoint accepts a table code as proof of table identity.

Authenticated uploads are tenant-owned records. Deletion requires the current organization and
either the uploading identity or an OWNER/MANAGER membership; cross-tenant filenames return a
not-found response.
