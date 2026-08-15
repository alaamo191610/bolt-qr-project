# Public order availability and rejection telemetry contract

Status: Backend implemented and fully verified 15 August 2026. Admin control UI remains a frontend
handoff.

## Durable operational state

Ordering state is branch-scoped because closure and kitchen overload are location-specific. Every
branch has one of four durable states:

- `OPEN`: capability-authorized dine-in ordering may proceed.
- `PAUSED`: staff temporarily stopped new customer orders.
- `CLOSED`: the location is closed to new customer orders.
- `OVERLOADED`: the kitchen cannot safely accept more work.

Only tables with status `available` or `occupied` may place an order. `reserved`, null, unknown,
unassigned, cross-tenant-branch, and inactive-branch states fail closed. A table without a valid
branch assignment is unavailable; new tables inherit the authenticated user's active default
branch, while the migration backfills only ownership-consistent default branches.

## Management API

`GET /api/branches/:branchId/ordering-state` reads the current state and
`PUT /api/branches/:branchId/ordering-state` changes it. Both require a restaurant session and
active `OWNER` or `MANAGER` organization role. PUT request body:
`{ "state": "OPEN|PAUSED|CLOSED|OVERLOADED" }`.

The target branch must belong to the active organization; another tenant's branch is returned as
not found. A real state change and its `ORDERING_STATE_CHANGED` audit event commit atomically under
serializable isolation. The
event records actor, organization, branch, previous/new states, and request ID, but no token or
request body.

## Public-order enforcement

Inside the existing exclusively locked order transaction, exact idempotency replay is resolved
first. A new order then checks branch and table availability before capacity, pricing, promotion,
order, table, or socket mutation:

| Condition | HTTP/code |
|---|---|
| Branch `PAUSED` | `409 RESTAURANT_PAUSED` |
| Branch `CLOSED` or inactive | `409 RESTAURANT_CLOSED` |
| Branch `OVERLOADED` | `409 RESTAURANT_OVERLOADED` |
| Missing/mismatched branch or non-orderable table | `409 TABLE_UNAVAILABLE` |

Rejected new requests roll back their idempotency reservation. A previously committed exact replay
still returns the original order during pause/closure so timeout recovery does not falsely report
failure.

## Safe rejection telemetry

Operational/capacity/rate rejections emit one structured `public_order_rejected` line containing
only request ID, organization ID, branch ID, table ID, stable reason code, and allowlisted numeric
counters. Basket contents, notes, promotions, customer/session/capability tokens, hashes, IPs, and
raw errors are never included. The normal HTTP request log also derives tenant identity from the
resolved table session.

## Verification evidence

Final verification passes ESLint, TypeScript, Prisma validation, production build, 30 unit tests,
25 disposable-PostgreSQL integration tests, 41 frontend tests, and 8 desktop/mobile browser E2E
tests. Tests cover the complete branch/table state matrix, owner/manager authorization, staff and
cross-tenant denial, serializable audit creation, idempotent state writes, active-default-branch
table assignment, exact replay during pause, no-mutation rejection, telemetry wiring/redaction,
stable customer messages, and migration deployment on a fresh database.
