# Yazan — Database, Core Platform, and Operations Work Plan

**Source:** `Production-Execution-Plan.md`  
**Role:** Backend, database, tenant safety, security, infrastructure, and release operations  
**Working rule:** Keep each PR limited to one domain and publish its API contract before Alaa
depends on it. Do not change frontend-owned files except for a jointly agreed API contract.

## Tracking update — 14 August 2026

The first implementation slice is complete. This file and `Production-Execution-Plan.md` are
updated after each implementation slice so progress, evidence, and blockers remain visible.

### Completed in the current slice

- M0 install reproducibility: `npm ci`, Prisma Client generation, lint, typecheck, unit tests,
  frontend tests, Prisma validation, production build, and Playwright smoke validation passed.
  CI uses Node 22; the current local Node 24 runtime emits the expected package-engine warning
  and should be aligned to Node 20–22 before release work.
- M0 HTTP harness: `server/index.js` is importable without binding a process port, and
  `tests/serverFoundation.test.js` exercises an isolated ephemeral HTTP server.
- M1 request context/error contract: request IDs, structured request lines, stable error codes,
  `Retry-After`, and 5xx diagnostic redaction are implemented and tested.
- M1 local limiter: expiry cleanup, hard entry cap, deterministic reset, bounded eviction, and
  retry metadata are implemented and tested. It remains a local M1 control, not the M3 shared
  production limiter.
- M1 session hardening: restaurant, SuperAdmin, and order-tracking token classes enforce
  explicit issuer, audience, purpose, subject where applicable, and expiry.
- M0 contract/ADR handoff: `docs/contracts/http-api-baseline.md` and ADRs 0001–0003 are
  published as proposed/implemented foundation decisions pending joint sign-off where marked.
- CI baseline: `.github/workflows/ci.yml` runs install, Prisma generate/validate, lint,
  typecheck, unit/frontend tests, and production build.

### Still pending in M0/M1

- Disposable PostgreSQL test database, deterministic fixtures, migration rehearsal, and a
  database-backed authentication characterization test.
- Joint approval of the open D1 decisions; the ADRs deliberately do not silently decide
  takeaway policy, RLS, session storage, providers, RPO/RTO, or SuperAdmin MFA.
- Incremental auth/tenant extraction and phase-2 direct tenant ownership constraints.

### Next implementation point

Add the disposable PostgreSQL test/fixture harness, then characterize tenant-scoped reads and
writes before changing aggregate-root ownership or migrations.

## Tracking update — 14 August 2026 (next point complete)

The disposable PostgreSQL and tenant characterization point is complete.

### Completed

- Added `tests/helpers/testDatabase.js`, which creates a uniquely named `bolt_qr_test_*`
  database when `TEST_DATABASE_URL` is not supplied, applies the full Prisma migration chain,
  truncates only application tables between tests, and drops only databases created by the
  harness. Unsafe database names are rejected.
- Added deterministic Alpha/Beta tenant fixtures with organizations, branches, admin profiles,
  login identities, memberships, categories, and menu items.
- Added database-backed HTTP characterization tests for active-tenant authentication, denial of
  cross-tenant organization selection, tenant-scoped menu/category reads, and cross-tenant menu
  update denial with database verification that the other tenant was unchanged.
- Added `npm run test:integration` with automatic Prisma generation and a PostgreSQL 16 service
  in CI. The local ephemeral database was removed successfully after the passing run; no
  `bolt_qr_test_*` databases remain.

### Evidence

`npm run test:integration` passed 2 tests. The complete validation sequence also passed 12 unit
tests, 5 frontend tests, ESLint, TypeScript, Prisma validation, and the production build.

### Next implementation point

Run the production-shaped migration rehearsal and document the expand → backfill → verify →
enforce plan for direct tenant ownership before adding tenant aggregate-root columns.

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

### Y0 — M0 foundation (Week 1) — In progress

| Task | Deliverable / handoff | Evidence |
|---|---|---|
| Repair reproducible local/CI install | **Complete 14 Aug:** CI pins Node 22; local `npm ci` succeeds after Prisma generation. | Unit, lint, Prisma validate, typecheck, frontend tests, build, and E2E smoke pass. |
| Test database and HTTP harness | **Complete 14 Aug:** disposable PostgreSQL database, migration setup, deterministic fixtures, safe cleanup, HTTP harness, and database-backed authentication/tenant characterization. | `npm run test:integration` passes 2 tests; created ephemeral database is removed after the run. |
| ADRs | **Foundation ADRs published 14 Aug:** errors/request context, release gates, and token classes. Joint sign-off and remaining tenant/POS/RLS/recovery decisions remain pending. | ADRs 0001–0003 published; approval record pending. |
| API contract baseline | **Foundation contract complete 14 Aug** for request IDs, errors, limiter responses, and token classes. Organization switching, table capability, and idempotency contracts remain pending. | Frontend can consume stable error/correlation fields; remaining contracts pending. |
| CI baseline | **Complete 14 Aug:** `.github/workflows/ci.yml` added for install, Prisma, lint, typecheck, tests, and build. | Workflow authored; hosted CI execution evidence pending. |

### Y1 — M1 tenant, errors, and observability (Weeks 2–3)

| Task | Backend scope | Required test / Alaa handoff |
|---|---|---|
| Request context | **Complete 14 Aug:** generate/return `X-Request-Id`; structured request line includes route/status/duration/tenant/user IDs. | HTTP test and contract documentation pass. |
| Safe error contract | **Complete 14 Aug:** stable `code`, safe `message`, `requestId`, optional `retryAfter`, centralized 5xx redaction. | Internal diagnostic and stack redaction tests pass. |
| Bounded local limiter | **Complete 14 Aug:** expiry sweep, hard entry cap, bounded eviction, deterministic reset, trusted-proxy setting, and `Retry-After`. | Unit tests and contract documentation pass. |
| Incremental extraction | Characterization tests first, then extract auth/tenant domain only. No semantic changes in extraction PR. | Existing HTTP suite passes before/after. |
| Tenant phase 2 | Add direct `organization_id` to aggregate roots; `ModifierGroup` is tenant-owned, children inherit; constraints stop cross-tenant links. Expand → backfill → verify → enforce; no premature contract deletion. | Fresh-db + production-shaped migration rehearsal; read/write/link/delete cross-tenant tests. |
| Session hardening | **Foundation complete 14 Aug:** explicit issuer/audience/purpose/expiry for Restaurant, SuperAdmin, and order-tracking credentials; table/socket credentials and membership-change behavior remain pending. | Token unit/negative tests pass; expiry/re-auth contract still needs joint D1 approval. |

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
