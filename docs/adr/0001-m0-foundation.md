# ADR 0001: M0 platform foundation

Status: Proposed for joint Yazan/Alaa sign-off

## Context

Release 1 needs a reproducible HTTP test boundary and a stable error/correlation contract
before tenant, public-order, and frontend work can be safely extended. The current server
starts listening as a side effect of importing `server/index.js`, keeps rate-limit state
without expiry cleanup or a hard cap, and emits untyped error bodies.

## Decisions

- The Express application is importable without binding a port. Production startup remains
  the responsibility of the executable entry point in `server/index.js`.
- Every HTTP response receives an `X-Request-Id`. A client-supplied ID is accepted only when
  it is a short, header-safe token; otherwise a UUID is generated.
- Error responses retain the existing `error` string for compatibility and add stable `code`
  and `requestId` fields. 5xx responses always expose a generic message; diagnostics stay in
  server logs.
- The local limiter is a bounded in-process control for M1 only. It expires entries, evicts
  oldest entries at its hard cap, returns `Retry-After`, and must be replaced by a shared
  store before horizontal production scaling (M3).
- Request logs are one JSON line per completed request and include route, status, duration,
  request ID, and available tenant/user IDs. Request bodies, credentials, tokens, and error
  stacks are never logged by this middleware.

## Consequences

The frontend can correlate failures without depending on server internals. HTTP integration
tests can create their own ephemeral listener without opening a process-level port. This ADR
does not authorize the unresolved D1 decisions (takeaway, session storage, RLS, providers,
RPO/RTO, or SuperAdmin MFA); those remain release gates.
