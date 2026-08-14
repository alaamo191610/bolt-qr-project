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

## Authentication classes

Restaurant endpoints require a verified `restaurant-session` token. SuperAdmin endpoints
require `super-admin-session`. Customer status and the corresponding socket room require
`order-tracking`; it is read-only and cannot authenticate an admin route. All classes carry
issuer, audience, purpose, subject where applicable, and expiry claims.

## Limiting

The M1 local limiter returns `429` plus `Retry-After` and `code: RATE_LIMITED`. Its state is
bounded and expires. It is not a production horizontal-scaling solution; M3 replaces it with
a shared limiter while PostgreSQL remains the durable source for committed-order idempotency.

## Compatibility and ownership

The existing success response shapes remain unchanged in this foundation slice. New tenant,
capability, and idempotency endpoints must publish method/path, request/response types,
authorization rules, and stable error codes before frontend consumption.
