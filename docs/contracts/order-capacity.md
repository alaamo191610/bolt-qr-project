# Public order capacity contract

Status: Backend implemented and fully verified 15 August 2026.

## Scope

Each successful table-capability exchange issues a cryptographically random table-session UUID in
the signed 30-minute token. Public dine-in orders persist that UUID. A table session may have at
most three open orders for its authenticated organization and table.

Open statuses are `pending`, `preparing`, and `ready`. Terminal `served` and `cancelled` orders do
not consume capacity. Legacy/admin-created orders without a table-session UUID do not consume this
session-specific allowance.

## Enforcement and concurrency

The server revalidates the table session and takes an exclusive PostgreSQL lock for the capability
before checking capacity. The count and order insertion occur in the same transaction. Different
idempotency keys submitted concurrently for the same table therefore cannot both observe stale
capacity and exceed three.

Idempotency replay is evaluated first inside that transaction. Replaying an already committed
order remains successful even when the session is at capacity and does not consume another slot.
A rejected new order rolls back its idempotency reservation and all order effects.

## Response

When three open orders already exist, a new order returns `409` with
`code: ORDER_LIMIT_REACHED`, the standard safe error body, and `requestId`. It performs no order,
order-item, promotion, table-status, idempotency, or socket mutation. No `Retry-After` is returned
because capacity clears through an authoritative restaurant order transition rather than elapsed
time.

The client should retain the basket and display its existing wait-for-service message. It may retry
with the same idempotency key after an order becomes `served` or `cancelled`.

## Deployment and verification

The migration adds a nullable UUID and a scoped status index, so legacy/admin-created orders remain
compatible. Deploy the migration before the application version. Table-session tokens issued by an
older application version do not contain the new session UUID and intentionally fail closed;
customers must re-scan/re-exchange the QR. Their maximum lifetime is 30 minutes.

Unit tests cover the exact count scope and stable conflict. Disposable-PostgreSQL integration tests
cover the third-order boundary, exact replay while full, no-mutation rejection, idempotency rollback,
terminal release, two unique concurrent submissions at the boundary, and isolation between two
sessions issued for the same table.

Final regression passes ESLint, TypeScript, Prisma validation, production build, 28 unit tests, 23
disposable-PostgreSQL integration tests, 40 frontend tests, and 8 desktop/mobile browser E2E tests.
