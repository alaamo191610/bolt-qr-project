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

## Tracking update — 14 August 2026 (migration rehearsal complete)

The production-shaped tenant migration rehearsal is complete. No production schema or
aggregate-root ownership columns were changed in this point.

### Completed

- Applied every migration before `20260813010000_tenant_identity_transition` to an isolated
  PostgreSQL database.
- Seeded two legacy-shaped admin profiles with null organization/branch ownership and dependent
  categories, menus, tables, orders, and promotions.
- Applied the existing tenant transition SQL and verified exactly two organizations, branches,
  users, memberships, and fully linked child records.
- Verified cross-tenant query boundaries for both legacy admins and replayed the idempotent
  backfill statements without duplicate identities or memberships.
- Published [ADR 0004](adr/0004-tenant-migration-rehearsal.md) documenting the
  expand → backfill → verify → enforce → contract sequence and rollback constraints.

### Evidence

`npm run test:integration` passed 4 tests. The full validation sequence passed 12 unit tests,
5 frontend tests, ESLint, TypeScript, Prisma validation, and the production build. Ephemeral
database cleanup completed with no `bolt_qr_test_*` databases left behind.

### Next implementation point

Design and implement the expand-only migration for direct organization ownership on the first
aggregate roots, with nullable columns, indexes, compatibility reads/writes, verification SQL,
and an explicit rollback note. Do not enforce non-null or remove legacy columns yet.

## Tracking update — 14 August 2026 (expand migration complete)

The expand-only direct organization ownership point is complete. No production database was
migrated; all migration assertions ran against isolated disposable PostgreSQL databases.

### Completed

- Added migration `20260814090000_expand_tenant_ownership` with nullable, indexed
  `organization_id` and organization foreign keys (`ON DELETE SET NULL`) for `Category`,
  `Ingredient`, `Menu`, `Table`, `Order`, `Promotion`, and `ModifierGroup`.
- Added the corresponding Prisma relations while preserving legacy `admin_id`/`user_id` and
  `branch_id` compatibility fields. The expand step does not backfill, enforce non-null, or remove
  legacy columns.
- Updated compatibility writes for authenticated category, ingredient, menu, table, and
  promotion creation. Public order creation derives organization ownership from the server-selected
  target admin; request-body tenant identity is not trusted.
- Extended integration coverage for tenant-owned writes, migration column/index/FK behavior,
  legacy nullability, cross-tenant boundaries, and rerunnable transition backfill semantics.

### Evidence

The complete validation sequence passed: 12 unit tests, 4 PostgreSQL integration/rehearsal tests,
5 frontend tests, ESLint, TypeScript, Prisma validation, and production build. No
`bolt_qr_test_*` databases remain after cleanup.

### Next implementation point

Prepare the bounded backfill migration for the seven new ownership columns, including unresolved
row detection, before/after counts, idempotent rerun checks, and a stop-the-line rule for ambiguous
or cross-organization data. Do not add non-null/composite enforcement until verification passes and
the RLS-versus-compensating-controls decision is approved.

## Tracking update — 14 August 2026 (bounded backfill complete)

The bounded direct organization ownership backfill is complete. No production database was
migrated; the migration and failure-path assertions ran against isolated disposable PostgreSQL
databases.

### Completed

- Added migration `20260814100000_backfill_tenant_ownership` for the six admin-derived roots:
  `Category`, `Ingredient`, `Menu`, `Table`, `Order`, and `Promotion`.
- Derived `ModifierGroup` ownership only through linked menus. Orphan groups, missing menu
  ownership, and groups linked across organizations stop the migration with a check violation.
- Added unresolved-row detection for missing admins/organizations, missing or cross-tenant
  branches, conflicting pre-existing organization values, and ambiguous modifier ownership.
- Made the backfill idempotent by updating only null organization values after validation; no
  non-null, composite, or destructive legacy-field enforcement was added.

### Evidence

`npm run test:integration` passed 5 tests: authentication/tenant characterization, direct owner
backfill, index/FK verification, idempotent rerun, and cross-tenant modifier-group rejection.
The failed-run cleanup path was corrected and no `bolt_qr_test_*` databases remain.

### Next implementation point

Run the verify phase: produce before/after ownership counts, validate branch/root agreement and
cross-tenant link/delete negatives across all seven roots, and prepare the enforcement decision.
Non-null/composite constraints remain blocked until verification and the RLS-versus-compensating-
controls decision are approved.

## Tracking update — 14 August 2026 (verify phase complete)

The local tenant-ownership verify phase is complete. It establishes enforcement readiness for the
isolated rehearsal data only; no production database or constraints were changed.

### Completed

- Added read-only `server/prisma/verification/tenant_ownership.sql`, returning per-root totals,
  missing/inactive organizations, legacy-owner mismatches, branch mismatches, relationship
  mismatches, combined issue counts, and an enforcement-readiness flag.
- Expanded the migration fixture to two records for every root (14 direct ownership values) and
  verified all seven roots return zero issues after backfill.
- Added deliberate-corruption coverage proving every root fails readiness when ownership or links
  cross tenants.
- Added HTTP negatives for cross-tenant category/ingredient/modifier links and menu/table/order/
  promotion mutations, with database checks that the other tenant remains unchanged.
- Corrected modifier compatibility writes and backfill sequencing so new groups receive the active
  organization and legacy group ownership can be derived before menu rows are updated.

### Evidence and enforcement decision

`npm run test:integration` passed 8 tests. The reusable report returned 7/7 roots ready with zero
issues for the clean fixture and 7/7 roots not ready after deliberate corruption.

Enforcement is **not approved yet**. It requires a zero-issue report from a staging copy of target
data and joint approval of PostgreSQL RLS versus documented compensating controls.

### Next implementation point

While enforcement is blocked on that decision/evidence, proceed with the behavior-neutral
auth/tenant domain extraction under characterization tests. Do not add non-null/composite tenant
constraints or remove compatibility fields in that extraction.

## Tracking update — 14 August 2026 (auth/tenant session extraction complete)

The first behavior-neutral extraction point is complete.

- Added `server/tenantSession.js` for active identity/membership/organization resolution,
  compatibility Admin selection, restaurant-session token issuance, and tenant response assembly.
- Dependencies are explicit (`db` and token secret), so the security path is testable without
  starting Express or connecting to PostgreSQL.
- Preserved active-user, active-membership, active-organization, first-membership, compatibility
  Admin, branch fallback, token claim, and response behavior.
- Added unit coverage for query scope, invalid identity rejection, missing compatibility profile,
  token claims, and response identity mapping.

## Tracking update — 14 August 2026 (access-policy extraction complete)

The second requested point is complete.

- Added `server/accessControl.js` for authentication middleware, SuperAdmin and organization-role
  gates, and catalog ownership assertions.
- `server/index.js` now composes the extracted services while retaining the same routes, status
  codes, response bodies, and current PostgreSQL-backed membership checks.
- Added focused tests for tenant request-context mapping, missing credentials, inactive tenant
  access, platform/organization role denial, and category/ingredient ownership rejection.
- Published [ADR 0005](adr/0005-auth-tenant-domain-boundary.md) with boundaries, security
  invariants, compatibility guarantees, and structural rollback.

### Evidence and next point

Final validation passed 19 unit tests, 8 PostgreSQL integration tests, 5 frontend tests, ESLint,
TypeScript, Prisma validation, and the production build. No schema, migration, frontend, or public
API contract changed in either extraction.

The next tenant enforcement step remains blocked on a zero-issue staging report and the signed
RLS-versus-compensating-controls decision. The next production-order milestone also remains blocked
on the takeaway/anti-abuse decision; obtain those decisions before implementation crosses either
security boundary.

## Tracking update — 14 August 2026 (blocking decision package ready)

The next planning point is complete: both immediate security blockers are now concrete proposed
ADRs rather than open-ended questions. No application or database behavior changed.

- [ADR 0006](adr/0006-tenant-enforcement-strategy.md) compares Release 1 RLS with mandatory
  database/service compensating controls. It recommends constraints and least-privilege scoping for
  Release 1, then RLS after runtime-role separation and transaction-bound tenant context exist.
- [ADR 0007](adr/0007-public-order-entry-and-abuse-policy.md) defines capability, idempotency,
  rate-limit, open-order, pause, and telemetry defaults. It recommends disabling takeaway for
  Release 1; verified-contact takeaway is the preferred alternative if takeaway is required.
- Both ADRs include exact approval syntax and the implementation consequences of each choice.

### Decision required from Yazan and Alaa

1. Choose tenant enforcement ADR 0006 Option A or B.
2. Choose takeaway ADR 0007 Option A, B, or C and accept or replace the proposed limits/lifetimes.
3. Tenant enforcement additionally requires the existing report to return zero issues on a staging
   copy before the selected migration can run.

Recommended approval: `Tenant enforcement: B` and
`Takeaway: A — disabled for Release 1; abuse defaults accepted`.

## Tracking update — 14 August 2026 (Yazan decisions recorded and first control shipped)

Yazan selected tenant enforcement Option B and takeaway Option A. Yazan accepted the proposed
dine-in abuse-limit/session defaults on 14 August 2026. Alaa sign-off remains required by the joint
plan.

### Completed

- Updated ADR 0006 to record constraints/compensating controls for Release 1 and RLS after safe
  runtime-role/transaction-context work.
- Updated ADR 0007 and the HTTP baseline contract to record takeaway disabled for Release 1.
- `POST /api/orders` now returns `403 ORDER_TYPE_DISABLED` for takeaway before opening a transaction;
  an integration test verifies the order count is unchanged.
- Added `npm run verify:tenant-ownership`, a read-only staging preflight that reports only root-level
  counts and exits non-zero when any root is not enforcement-ready.

### Evidence and next point

Final validation passed 21 unit tests, 10 PostgreSQL integration tests, 5 frontend tests, ESLint,
TypeScript, Prisma validation, and production build. The verification command passed against the
clean disposable deployment fixture.

Next: obtain Alaa sign-off and run `npm run verify:tenant-ownership` against a staging copy of target
data. In parallel, the accepted dine-in table-capability contract is now being implemented.

## Tracking update — 14 August 2026 (dine-in defaults accepted; capability contract published)

Yazan accepted ADR 0007's 30-minute table session, exchange/order limits, three-open-order cap, and
50-line-item maximum. [The table-capability contract](contracts/table-capability.md) now fixes the
security boundary, endpoints, token claims, stable errors, rotation/revocation behavior, and Alaa
handoff before runtime implementation. Alaa's joint sign-off remains pending.

## Tracking update — 14 August 2026 (table capability slice complete)

The first M2 public-order security point is implemented and final-tested.

### Completed

- Added a dedicated `table_capabilities` model/migration with hash-only secret storage, table and
  organization binding enforced by a composite foreign key, positive versions, and hash-format
  constraints.
- Added tenant-authenticated rotate/revoke endpoints. A 256-bit raw secret is returned only on
  rotation; rotation/revocation immediately invalidate prior 30-minute table sessions through
  database version revalidation.
- Added public capability exchange with the accepted 20/IP and 10/capability per 10-minute limits.
- Dine-in order creation now requires a `table-session`, revalidates it under a capability-row lock
  inside the transaction, derives organization/restaurant/branch/table from the capability, ignores
  body identity for authorization, enforces the accepted 50-line-item maximum, and applies the
  accepted 6/session and 120/organization attempt limits.
- Published the stable endpoint/token/error/frontend contract. No frontend files were changed;
  Alaa's QR exchange/recovery/E2E handoff remains explicit.

### Evidence and next point

Final validation passed 24 unit tests, 14 disposable-PostgreSQL integration tests, 5 frontend tests,
2 browser E2E tests, ESLint, TypeScript, Prisma validation, and production build. Tests prove
hash-only storage, tenant-scoped management, database cross-organization rejection, required
session, body-identity substitution resistance, rotation/revocation invalidation, and exchange
limiting.

Next M2 point: durable PostgreSQL idempotency for order creation. After that, implement the accepted
three-open-order cap and pause/closed/overload controls with safe rejection telemetry. Production
horizontal scaling still requires the M3 shared limiter.

## Tracking update — 14 August 2026 (Alaa QR/session merge review — not accepted)

Reviewed the clean, fetched `main` at `4701771` against the published table-capability contract.
General frontend health passes (ESLint, TypeScript, 38 frontend tests, and production build), but the
QR/session handoff is not present and therefore does not meet M2 security requirements:

- Generated, copied, downloaded, and table-card QR URLs still contain only predictable
  `table`/`restaurant` query values; no authenticated capability rotation result is embedded.
- The frontend has no client methods for capability rotation/revocation or
  `POST /api/public/table-session` exchange.
- `orderService.createOrder` still posts body `tableCode` and `adminId` through the restaurant-token
  transport and cannot send a table-session bearer token.
- `CustomerMenu` does not exchange the QR capability, retain the 30-minute token for the active
  flow, or route `TABLE_SESSION_REQUIRED`/`TABLE_SESSION_INVALID` to a re-scan/expired-QR state.
- There is no QR → exchange → order E2E test, nor invalid/expired/rotated/revoked recovery coverage.

Result: Alaa handoff/sign-off remains pending and the current customer checkout receives
`401 TABLE_SESSION_REQUIRED` from the secured backend. Do not mark the QR/table capability row
jointly complete or release dine-in ordering yet. Acceptance requires all five items above plus
mobile/RTL coverage and a warning that QR rotation invalidates earlier printed/displayed codes.

The next Yazan point, durable PostgreSQL idempotency, remains ready but was not started in this
review because the user's instruction made progression conditional on the merged QR/session work
meeting the contract.

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
| Takeaway entry and anti-abuse policy — Yazan selected ADR 0007 A and accepted defaults; Alaa pending | Public order M2 | Both | Alaa sign-off required |
| Session-storage threat model and token classes | M1 auth/session | Both | Day 3 |
| RLS versus documented compensating controls — Yazan selected ADR 0006 B; Alaa/staging pending | M1 tenant integrity | Both | Sign-off/staging required |
| POS disposition: **Park** | Schema/migration scope | Both | Day 3 |
| RPO/RTO, providers, retention, ordering pause/capacity | M3 operations and M2 abuse controls | Both | Day 5 |

## Work sequence

### Y0 — M0 foundation (Week 1) — In progress

| Task | Deliverable / handoff | Evidence |
|---|---|---|
| Repair reproducible local/CI install | **Complete 14 Aug:** CI pins Node 22; local `npm ci` succeeds after Prisma generation. | Unit, lint, Prisma validate, typecheck, frontend tests, build, and E2E smoke pass. |
| Test database and HTTP harness | **Complete 14 Aug:** disposable PostgreSQL database, migration setup, deterministic fixtures, safe cleanup, HTTP harness, and database-backed authentication/tenant characterization. | `npm run test:integration` passes 2 tests; created ephemeral database is removed after the run. |
| ADRs | **Foundation ADRs published 14 Aug:** errors/request context, release gates, and token classes. Joint sign-off and remaining tenant/POS/RLS/recovery decisions remain pending. | ADRs 0001–0003 published; approval record pending. |
| API contract baseline | **Foundation + table capability complete 14 Aug** for request IDs, errors, limiter responses, token classes, table capability/session endpoints, and handoff. Organization switching and idempotency contracts remain pending. | Frontend can consume stable error/correlation fields and table-session contract; remaining contracts pending. |
| CI baseline | **Complete 14 Aug:** `.github/workflows/ci.yml` added for install, Prisma, lint, typecheck, tests, and build. | Workflow authored; hosted CI execution evidence pending. |

### Y1 — M1 tenant, errors, and observability (Weeks 2–3)

| Task | Backend scope | Required test / Alaa handoff |
|---|---|---|
| Request context | **Complete 14 Aug:** generate/return `X-Request-Id`; structured request line includes route/status/duration/tenant/user IDs. | HTTP test and contract documentation pass. |
| Safe error contract | **Complete 14 Aug:** stable `code`, safe `message`, `requestId`, optional `retryAfter`, centralized 5xx redaction. | Internal diagnostic and stack redaction tests pass. |
| Bounded local limiter | **Complete 14 Aug:** expiry sweep, hard entry cap, bounded eviction, deterministic reset, trusted-proxy setting, and `Retry-After`. | Unit tests and contract documentation pass. |
| Incremental extraction | **Complete 14 Aug:** active tenant session resolution and access policies extracted into dependency-injected modules; `server/index.js` composes them without route/contract changes. | 19 unit and 8 database-backed characterization tests pass; ADR 0005 documents boundaries and rollback. |
| Tenant phase 2 | **Expand + backfill + local verify complete 14 Aug:** direct nullable ownership is populated and the reusable report proves all seven fixture roots clean. Legacy fields remain during transition. Enforcement awaits staging evidence and the RLS/control decision. | ADR 0004, 14 ownership fixtures, 7/7 clean/corrupt report checks, and cross-tenant link/delete negatives pass; staging verification, enforcement, and RLS decision remain. |
| Session hardening | **Foundation + table session complete 14 Aug:** explicit issuer/audience/purpose/expiry for Restaurant, SuperAdmin, order-tracking, and 30-minute table credentials; membership-change/socket behavior remains pending. | Token unit/negative tests and database-backed rotation/revocation checks pass; restaurant expiry/re-auth contract still needs joint D1 approval. |

### Y2 — M2 trustworthy order cycle (Weeks 4–5)

| Task | Backend scope | Required test / Alaa handoff |
|---|---|---|
| QR/table capability | **Backend complete 14 Aug; frontend review rejected at main `4701771`:** hash-only 256-bit revocable capability, composite tenant binding, and 30-minute database-revalidated session are available, but QR generation/exchange/checkout integration is absent. Alaa handoff/sign-off pending. | Backend negatives pass; frontend must add capability QR, exchange, table bearer token, recovery states, and golden E2E. |
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
