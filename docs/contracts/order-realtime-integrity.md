# Order realtime and authoritative refetch contract

Status: M2 implementation complete — 15 August 2026

## Authority and compatibility

PostgreSQL-backed HTTP responses are authoritative. Socket.IO events are authenticated,
best-effort notification hints: clients must tolerate a missed, duplicated, delayed, or
out-of-order event. `Order.version` is the persisted monotonic sequence for an order and
`updated_at` is its server timestamp.

This slice adds versioned events while retaining the existing event names temporarily for
compatibility. New clients consume only the `.v1` events. Legacy event removal requires a
separate Alaa handoff and is not part of this backend slice.

## Room authorization

### Restaurant administration

The client emits `join-admin` with `{ token }`; the server derives the active organization and
compatibility admin profile from the verified `restaurant-session`. A client-provided admin or
organization identifier is never room authority. Inactive users, memberships, organizations,
wrong token classes, and expired credentials fail closed.

### Customer order tracking

The client emits `join-order` with `{ orderId, trackingToken }`. The server verifies the
`order-tracking` issuer, audience, purpose, expiry, order, organization, and restaurant scope,
then confirms that the order still exists in that scope and that its persisted tracking-token
record is active before joining the private room. A valid credential for another order, tenant,
or revoked token cannot join. Join acknowledgement is one of:

```json
{ "ok": true, "protocolVersion": 1 }
```

```json
{ "ok": false, "protocolVersion": 1, "code": "SOCKET_AUTHORIZATION_FAILED" }
```

The failure acknowledgement deliberately does not reveal whether a token, tenant, order, or
revocation record was wrong. Tracking tokens expire after six hours and have no refresh endpoint.

## Versioned events

All `.v1` order events use this envelope:

```json
{
  "protocolVersion": 1,
  "eventId": "uuid",
  "occurredAt": "ISO-8601 timestamp",
  "order": {
    "id": 123,
    "status": "preparing",
    "version": 2,
    "updated_at": "ISO-8601 timestamp"
  }
}
```

- `order.created.v1` is sent only to the authenticated restaurant room after the creating
  transaction commits. Its envelope may include `orderRepresentation` for immediate display.
- `order.status.v1` is sent to the authenticated restaurant and customer order rooms only after
  the status/table transaction commits.
- Idempotency replay and no-op status requests emit no new event.
- Consumers ignore events for another order, with an unsupported protocol version, or with a
  version not newer than their current representation.

## Authoritative recovery

`GET /api/public/orders/:id/status` requires its matching `order-tracking` bearer and returns:

```json
{
  "id": 123,
  "status": "preparing",
  "version": 2,
  "updated_at": "ISO-8601 timestamp"
}
```

The response is `Cache-Control: no-store`. Invalid, expired, or revoked credentials return a safe
`401`; an order/scope mismatch is indistinguishable from a missing order. Database failures
remain `5xx` and are not mislabeled as token expiry.

Customers rejoin and refetch on socket connect/reconnect, visible-page resume, and browser
`pageshow`. Restaurant clients rejoin and refetch `GET /api/orders` on socket reconnect. This
recovers authoritative state after sleep, packet loss, process restart, or horizontal failover.

## Required evidence

- Unit tests for room derivation, token-class rejection, database-backed tracking authorization,
  safe acknowledgements, room isolation, and event envelopes.
- PostgreSQL integration tests for status version increments, no-op behavior, cross-tenant/order
  denial, authoritative refetch, committed table release, and real socket delivery/reconnect.
- Frontend tests for stale-event rejection and reconnect/visibility refetch.

## Completion evidence — 15 August 2026

The contract is implemented with 37 backend unit tests, 29 disposable-PostgreSQL integration
tests, 45 frontend tests, and 8 desktop/mobile browser E2E tests passing. The integration suite
uses the real application Socket.IO server and proves authorized acknowledgements, cross-order
denial, post-commit protocol-v1 delivery, no-op suppression, disconnected-event recovery through
HTTP refetch, monotonic version increments, and atomic terminal table release. ESLint, TypeScript,
Prisma validation, and the production build also pass; the existing large-chunk build warning
remains a later performance item.
