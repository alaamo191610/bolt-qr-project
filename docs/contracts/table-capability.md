# Table capability and session contract

Status: Accepted by Yazan and backend implemented on 14 August 2026; Alaa handoff and joint sign-off
pending.

## Security boundary

The QR capability is a 256-bit random bearer secret bound to exactly one organization and table.
Only its SHA-256 hash is stored. The raw capability is returned only by an authenticated rotation
request and must not be logged, persisted in analytics, or returned by ordinary table endpoints.
Predictable table codes and request-body `adminId`/`tableCode` values are not proof of presence and
are never used to authorize order creation.

Rotating or revoking a capability increments its version. Every table session is checked under a
shared capability-row lock inside order creation, so rotation/revocation cannot race between the
authorization decision and transaction commit; previously issued sessions then fail closed.
Deleting the table deletes its capability.

## Endpoints

### `POST /api/tables/:id/capability/rotate`

Requires an authenticated restaurant session for the table's organization. Creates or replaces the
capability and returns the raw secret once:

```json
{
  "capability": "base64url-encoded-secret",
  "tableId": 42,
  "tableCode": "A-01",
  "version": 2
}
```

### `DELETE /api/tables/:id/capability`

Requires the same restaurant authorization. Revokes the current capability and invalidates its
sessions. Returns `{ "success": true }`. Repeating a revoke is safe.

### `POST /api/public/table-session`

Request: `{ "capability": "base64url-encoded-secret" }`.

Successful response:

```json
{
  "token": "jwt",
  "expiresIn": 1800,
  "restaurantId": "uuid",
  "organizationId": "uuid",
  "table": { "id": 42, "code": "A-01" }
}
```

The JWT has issuer `bolt-qr-api` (or configured issuer), audience `table-ordering`, purpose
`table-session`, a 30-minute expiry, a random per-exchange `sessionId`, and
capability/table/organization/restaurant/version claims.
The exchange is limited to 20 attempts per IP and 10 attempts per capability hash per 10 minutes.

### `POST /api/orders`

`type: dine_in` requires `Authorization: Bearer <table-session>`. The server derives restaurant,
organization, branch, and table identity from the revalidated capability. Body identity fields are
ignored for authorization. Release 1 accepts 1–50 line items. The accepted session/organization
order-attempt limits are enforced by the current bounded local limiter, with the six-attempt limit
keyed to the individually issued `sessionId`. A 16–128-character
`Idempotency-Key` is required and is durably scoped to this capability and version; see the
[public order-idempotency contract](order-idempotency.md). The three-open-order cap is implemented as
defined by the [public order-capacity contract](order-capacity.md). Ordering pause and the production
shared store remain the next bounded M2/M3 points.

`type: take_away` remains disabled for Release 1 and returns `403 ORDER_TYPE_DISABLED` before any
order mutation.

## Stable capability errors

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Order input is malformed. |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | A dine-in order is missing its idempotency key. |
| 401 | `TABLE_SESSION_REQUIRED` | A dine-in request has no table-session bearer token. |
| 403 | `TABLE_SESSION_INVALID` | Capability/session is malformed, invalid, expired, rotated, revoked, or inconsistent. |
| 404 | `VALIDATION_ERROR` | Authenticated table rotation/revocation target does not exist in the tenant. |
| 409 | `IDEMPOTENCY_CONFLICT` | The scoped key was already used for a different order payload. |
| 409 | `ORDER_LIMIT_REACHED` | This table session already has three open orders. |
| 409 | `RESTAURANT_PAUSED` | The branch temporarily paused new orders. |
| 409 | `RESTAURANT_CLOSED` | The branch is closed or inactive. |
| 409 | `RESTAURANT_OVERLOADED` | The branch cannot safely accept additional orders. |
| 409 | `TABLE_UNAVAILABLE` | The table/branch assignment or table status is not orderable. |
| 429 | `RATE_LIMITED` | Exchange limit exceeded; `Retry-After` is present. |

All errors also contain `requestId`. Error responses and logs must not reveal whether a supplied
capability hash exists.

## Frontend handoff

Alaa's QR/checkout flow must exchange the capability once, hold the table-session token only for
the active customer flow, send it as the dine-in order bearer token, and handle required/invalid/
expired states by returning to QR scan. It must not depend on `adminId` or `tableCode` as order
authorization. QR regeneration must warn that earlier printed/displayed QR values stop working.
