# Yazan — Database, Core Platform, and Operations Work Plan

**Source:** `Production-Execution-Plan.md`  
**Role:** Backend, database, tenant safety, security, infrastructure, and release operations  
**Working rule:** Keep each PR limited to one domain and publish its API contract before Alaa
depends on it. Do not change frontend-owned files except for a jointly agreed API contract.

## Fair-split agreement

Ownership is not a measure of effort. Each milestone is planned as an approximately equal
share of implementation, automated testing, evidence, and review work. When Yazan has a
database/security-heavy deliverable, Alaa owns the corresponding user journey, typed client
contract, and E2E evidence; neither waits for the other to finish a whole milestone.

| Milestone | Yazan’s primary half | Alaa’s parallel half | Joint completion rule |
|---|---|---|---|
| M0 | Test DB/HTTP harness, CI backend checks, server contracts/ADRs. | E2E runner, browser fixtures/mocks, typed client design, UI-state inventory. | Both make one smoke test run in CI. |
| M1 | Tenant constraints/migration, errors/logging, limiter, auth-domain extraction. | Typed transport/error UI, session contexts, boundaries, organization/role UI. | Both add negative tenant/error tests and cross-review. |
| M2 | Capabilities, idempotency, abuse controls, socket/status contract. | Checkout/retry/recovery, order screens, mobile/RTL behaviour, golden E2E. | Both prove one order per checkout and tenant isolation. |
| M3 | Storage/shared limiter/backups/operational telemetry. | Upload/pagination/recovery UX, frontend telemetry, performance/accessibility remediation. | Both execute restore/alert/user-failure evidence. |
| M4–M6 | API/migration/security/recovery regression and operations. | Device/browser/a11y/E2E regression and pilot support UX. | Both own P0/P1 closure and Go/No-Go. |

**WIP limit:** one primary implementation task and one review/test task per person at a time.
If either person is blocked for more than half a day, they take the next shared test,
documentation, fixture, or regression task instead of waiting.

## Parallel-work boundary

**Yazan owns**

- `server/`, `server/prisma/`, backend tests, CI/deployment configuration, and backend ADRs.
- Tenant/data ownership, migrations, authentication/authorization, API error contract,
  request context, rate limits, public-order security, idempotency, Socket.IO authorization,
  uploads, backups, and monitoring.

**Do not edit without pairing with Alaa**

- User-facing validation text, checkout interaction rules, authentication/session UI behaviour,
  or any API response shape already consumed by the frontend.

**Publish before implementation completes**

- Endpoint method/path, request/response types, stable error codes, auth/capability rules,
  idempotency semantics, migration impact, and test fixture requirements.

## Decisions that block core implementation

| Decision | Needed for | Owner | Due |
|---|---|---|---|
| Takeaway entry and anti-abuse policy | Public order M2 | Both | Day 2 |
| Session-storage threat model and token classes | M1 auth/session | Both | Day 3 |
| RLS versus documented compensating controls | M1 tenant integrity | Both | Day 5 |
| POS disposition: **Park** | Schema/migration scope | Both | Day 3 |
| RPO/RTO, providers, retention, ordering pause/capacity | M3 operations and M2 abuse controls | Both | Day 5 |

## Work sequence

### Y0 — M0 foundation (Week 1)

| Task | Deliverable / handoff | Evidence |
|---|---|---|
| Repair reproducible local/CI install | Pair with Alaa: Yazan owns server/CI commands; Alaa verifies frontend/E2E commands. | `npm test`, lint, Prisma validate, build pass. |
| Test database and HTTP harness | Isolated database URL convention, fixture factory, cleanup strategy, first authentication characterization test. | One HTTP integration test runs without shared mutable data. |
| ADRs | Tenant model, POS Park, token/capability classes, idempotency storage, RLS decision, recovery objectives. | ADRs approved by both. |
| API contract baseline | Versioned contract for errors, request ID, auth/session, organization context, table capability, and idempotency. | Alaa can implement types/mocks without waiting for backend completion. |
| CI baseline | Pair with Alaa: Yazan wires server/migration/security jobs; Alaa owns E2E job and browser artifacts. | Required checks block a failing PR. |

### Y1 — M1 tenant, errors, and observability (Weeks 2–3)

| Task | Backend scope | Required test / Alaa handoff |
|---|---|---|
| Request context | Generate `X-Request-Id`; structured request line with route/status/duration/tenant/user IDs. | Integration test returns request ID; document header for `ApiError`. |
| Safe error contract | Typed server errors: stable `code`, client-safe `message`, `requestId`, optional `retryAfter`; centralized redaction. | Internal fault never exposes Prisma detail; provide error-code catalogue. |
| Bounded local limiter | Expiry sweep, hard entry cap, trusted-proxy configuration, deterministic reset and `Retry-After`. | Unit + HTTP tests; publish rate-limit response contract. |
| Incremental extraction | Characterization tests first, then extract auth/tenant domain only. No semantic changes in extraction PR. | Existing HTTP suite passes before/after. |
| Tenant phase 2 | Add direct `organization_id` to aggregate roots; `ModifierGroup` is tenant-owned, children inherit; constraints stop cross-tenant links. Expand → backfill → verify → enforce; no premature contract deletion. | Fresh-db + production-shaped migration rehearsal; read/write/link/delete cross-tenant tests. |
| Session hardening | Explicit issuer/audience/purpose/expiry; separate Restaurant/SuperAdmin/order/table/socket credentials; membership-change behaviour. | Contract and negative tests; Alaa receives expiry/403/re-auth states. |

### Y2 — M2 trustworthy order cycle (Weeks 4–5)

| Task | Backend scope | Required test / Alaa handoff |
|---|---|---|
| QR/table capability | High-entropy, revocable QR capability plus short table session; never trust body `adminId`/table. | Invalid, revoked, expired, and cross-tenant/table cases denied. |
| Idempotency | Client key scoped to tenant/session; durable PostgreSQL record/constraint; same payload returns original result, changed payload returns `409 IDEMPOTENCY_CONFLICT`. | Delayed-response retry proves one order and one promotion increment. |
| Abuse controls | Limits by IP, capability/session, table, organization, route; active-order cap; pause/overload state; safe rejection telemetry. | Deterministic integration tests and documented status/error codes. |
| Order/realtime integrity | Transactional totals/promotions; authorized/versioned socket rooms/events; tracking credentials are minimal and scoped. | Socket/transition/cross-tenant tests; document authoritative refetch endpoint. |

### Y3 — M3 production infrastructure (Weeks 6–8)

- Durable object storage with signed upload policy, verification, ownership-safe deletion, and
  lifecycle/retention.
- Redis/equivalent shared limiter; PostgreSQL remains the durable source for committed-order
  idempotency.
- Separate staging/production data, secrets, storage, and deployment credentials.
- Hosted error tracking, metrics, dashboards, release version, alert rules, and operational
  runbooks.
- Pagination/bounded analytics filters, query plans/indexes, approved RPO/RTO, PITR and
  timed restore rehearsal.

**Exit evidence:** secure-upload tests, synthetic alert, staging isolation proof, restore
within RPO/RTO, measured API p95/error rate.

### Y4 — M4 through launch (Weeks 9–12)

- Run migration, API, tenant, security, performance, recovery, secret-rotation, and rollback
  simulations.
- Resolve P0/P1 findings; freeze schema except release blockers.
- Support pilot telemetry and daily risk review; approve production Go/No-Go only with all
  data/security/operations evidence attached.

## PR and handoff checklist

- [ ] Contract posted before Alaa depends on it.
- [ ] Migration impact, forward verification, backfill, locks, and mitigation documented.
- [ ] Unit + HTTP integration + tenant-negative tests pass where applicable.
- [ ] Stable error codes, request ID, and retry information documented.
- [ ] Alaa reviewed any customer-visible behaviour or API contract change.
- [ ] Staging evidence and rollback note attached.

## Daily synchronization

Send Alaa a short update each day: **contract changed / endpoint ready / fixtures ready /
blocked decision / tests passing**. Raise a blocker immediately when it prevents frontend
work from using a stable mock or contract.
