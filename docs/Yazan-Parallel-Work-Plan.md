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

## Tracking update — 15 August 2026 (QR and order gap re-review)

Re-reviewed fetched `main`/`Yazan-Plan-exe` at `1396b5f`. The previous core frontend blocker is
fixed: the admin QR generator rotates/revokes capabilities with explicit invalidation warnings,
customer flow exchanges `cap` for a 30-minute table session, dine-in checkout sends that bearer
token without body restaurant/table identity, and missing/invalid capability states fail closed.
The mocked browser contract suite covers valid, missing, and revoked capability paths on desktop
and mobile.

Final verification passed 24 unit tests, 14 disposable-PostgreSQL integration tests, 40 frontend
tests, 8 browser E2E tests, ESLint, TypeScript, Prisma validation, and production build.

### Remaining QR gaps

1. `TableManagement` still displays a second, legacy QR generated by the external `qrserver.com`
   service. Its URL contains only predictable `table`/`restaurant` values and no capability, so it
   opens a menu where ordering is disabled. Remove it or replace it with a link into the secured QR
   generator; no capability should be sent to a third-party QR service.
2. Browser tests mock every API call. Add one real disposable-backend golden flow proving admin
   rotate → customer exchange → order → tracking, plus rotation after exchange and revoked-session
   order denial. Add admin rotate/revoke UI coverage and Arabic/RTL assertions.
3. The customer trusts query `table`/`restaurant` for menu display without checking them against
   the authoritative exchange response. This cannot cross-tenant-create an order because the
   backend derives identity from the token, but mismatched/tampered links can display one menu and
   authorize another table. Validate/derive display identity from the exchange response.

### Remaining order gaps

1. **Durable idempotency is not implemented.** The client sends `Idempotency-Key`, but
   `POST /api/orders` never reads it and never uses `api_idempotency_keys`; timeout/retry can still
   create duplicate orders and increment a promotion twice. The client key is also memory-only, so
   reload/mobile resume creates a new key.
2. The accepted maximum-three-open-orders control is not enforced transactionally.
3. Restaurant pause/closed/overloaded/table-unavailable states are not checked before mutation and
   have no published stable backend codes; current frontend code guesses `ORDER_LIMIT_REACHED` and
   `RESTAURANT_PAUSED`.
4. Safe rejection telemetry and a production shared limiter remain pending. Current limits are
   process-local; capability-session limiting is grouped by capability ID rather than an individual
   issued JWT session.
5. Newly created tables do not receive `branch_id`, while the existing generic
   `api_idempotency_keys` model requires one. The idempotency design must either guarantee branch
   ownership at table creation/backfill or use an organization/table/capability scope that cannot
   be null.

Result: the core QR/session handoff is accepted for continued backend work, but M2 remains No-Go.
Next Yazan implementation point is the published, durable PostgreSQL order-idempotency contract and
transaction path; the legacy QR should be removed in parallel before any pilot.

## Tracking update — 15 August 2026 (durable order idempotency started)

The legacy QR is a pilot blocker but does not prevent the backend's next isolated M2 point.
[The public order-idempotency contract](contracts/order-idempotency.md) is now published before
implementation. It fixes the required header format, 24-hour retention, canonical request hash,
organization/table/capability-version scope, first/replay/conflict statuses, PostgreSQL concurrency
semantics, tracking-token behavior, and frontend reload/mobile-resume handoff.

## Tracking update — 15 August 2026 (durable order idempotency complete)

Implemented the published contract as an atomic PostgreSQL order path. The required key is bound to
organization, table capability ID, and capability version, with composite foreign keys preventing
cross-tenant/table records, a 24-hour expiry, and canonical SHA-256 request identity. The same key
and payload returns the existing order with `200`/`Idempotency-Replayed: true`; changed payloads
return `409 IDEMPOTENCY_CONFLICT`; missing or malformed keys fail before order mutation. The first
transaction alone creates the order, increments promotion usage, changes the table, and emits
socket events. Failed transactions roll back both the reservation and all order effects.

Final verification passes ESLint, TypeScript, Prisma validation, production build, 26 unit tests,
21 disposable-PostgreSQL integration tests, 40 frontend tests, and 8 desktop/mobile browser E2E
tests. The integration evidence includes concurrent duplicate submissions producing one order and
one promotion increment, rollback/key reuse after rejection, tenant scope, capability-version
rotation, and lazy key reuse after 24-hour expiry. The existing large production-bundle warning
remains tracked as performance work and is not introduced by this backend point.

Remaining after this point: Alaa must persist the key/fingerprint through reload/mobile resume. The
next Yazan implementation point is the accepted transactional maximum-three-open-orders control,
followed by stable restaurant pause/closed/overload/table-unavailable decisions and safe rejection
telemetry. The legacy external capability-less `TableManagement` QR remains a separate pilot
blocker and must be removed or routed to the secure generator.

## Tracking update — 15 August 2026 (three-open-order capacity started)

The next Yazan M2 point is now in progress. The
[public order-capacity contract](contracts/order-capacity.md) defines a maximum of three
`pending`/`preparing`/`ready` orders per individually issued table session; `served` and
`cancelled` release capacity. Enforcement will run under an exclusive PostgreSQL capability lock
inside the existing idempotent order transaction. A new order at capacity returns
`409 ORDER_LIMIT_REACHED` without mutation, while an exact idempotency replay remains successful.

## Tracking update — 15 August 2026 (three-open-order capacity complete)

Implemented a random UUID for each exchanged table session, strict claim validation, durable order
attribution, and a scoped status index. The six-attempt limiter now uses the individual session UUID
rather than the broader capability. Order creation takes an exclusive capability-row lock and,
inside the idempotency transaction, rejects a fourth `pending`/`preparing`/`ready` order with
`409 ORDER_LIMIT_REACHED`. Replay bypasses the new-order count; `served` and `cancelled` release a
slot; rejected attempts roll back the idempotency reservation and emit no business mutation. The
internal session UUID is not returned in public order responses or socket events.

Final verification passes ESLint, TypeScript, Prisma validation, production build, 28 unit tests,
23 disposable-PostgreSQL integration tests, 40 frontend tests, and 8 desktop/mobile browser E2E
tests. PostgreSQL evidence includes three-order boundary, replay while full, terminal release,
independent sessions, and two unique concurrent submissions producing one success and one stable
rejection. The migration is additive; pre-deployment table tokens intentionally require re-scan
because they lack the new claim and expire within 30 minutes.

Next Yazan point: publish and implement restaurant pause/closed/overloaded/table-unavailable
enforcement and audit-safe rejection telemetry. The production shared limiter remains M3 work.

## Tracking update — 15 August 2026 (ordering availability and telemetry started)

The [public availability contract](contracts/public-order-availability.md) is published before
implementation. Operational state is branch-scoped as `OPEN`, `PAUSED`, `CLOSED`, or `OVERLOADED`;
only `available`/`occupied` tables may order. Owner/manager state changes are tenant-scoped and
audited. New orders fail with stable `409` codes before business mutation, exact replay remains
available during closure, and rejection telemetry is restricted to request/organization/branch/
table IDs, reason code, and allowlisted counters.

## Tracking update — 15 August 2026 (ordering availability and telemetry complete)

Implemented durable branch `OPEN`/`PAUSED`/`CLOSED`/`OVERLOADED` state, timestamp and index, plus an
ownership-consistent legacy table-branch backfill. New tables now require and inherit an active
default branch. Tenant-scoped GET/PUT management requires owner/manager role; real changes and
`ORDERING_STATE_CHANGED` audit events commit together under serializable isolation. Staff and
cross-tenant requests fail closed.

The locked public-order transaction resolves exact idempotency replay first, then rejects branch or
table state before capacity, pricing, promotion, order, table, or socket mutation using stable
`409 RESTAURANT_PAUSED`, `RESTAURANT_CLOSED`, `RESTAURANT_OVERLOADED`, or `TABLE_UNAVAILABLE`.
Structured `public_order_rejected` telemetry includes only request/tenant/branch/table IDs, reason,
and allowlisted counters; the generic request log now derives tenant identity from table sessions.
Frontend error utilities consume every published code, while the admin state-control UI remains
Alaa's handoff.

Final verification passes ESLint, TypeScript, Prisma validation, production build, 30 unit tests,
25 disposable-PostgreSQL integration tests, 41 frontend tests, and 8 desktop/mobile browser E2E
tests. The next Yazan point is order/realtime integrity: authorized and versioned socket events,
status/refetch authority, reconnect/server-restart behavior, and cross-tenant transition tests.

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
| API contract baseline | **Foundation + table capability + public-order idempotency complete 15 Aug** for request IDs, errors, limiter responses, token classes, capability/session endpoints, and durable retry semantics. Organization switching remains pending. | Frontend can consume stable correlation, table-session, and retry/conflict fields; remaining contracts pending. |
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
| QR/table capability | **Core backend/frontend integrated and re-reviewed 15 Aug at `1396b5f`:** secure generator, exchange, table bearer checkout, recovery states, and mocked desktop/mobile E2E pass. Legacy capability-less `TableManagement` QR and real-backend golden E2E remain. | Backend negatives and mocked browser paths pass; remove legacy QR and add real rotate/exchange/order/tracking evidence plus RTL. |
| Idempotency | **Backend complete 15 Aug:** required safe key, capability-version/tenant/table scope, 24-hour durable record, atomic order/effects, exact replay, changed-payload conflict, rollback, and no duplicate socket emission. | 26 unit and 21 PostgreSQL integration tests include concurrent retry with one order/one promotion increment. Frontend reload/mobile-resume persistence remains. |
| Abuse controls | **Local M2 controls complete 15 Aug:** individual session/organization/IP limits, transactional three-open-order cap, branch pause/closed/overload, fail-closed table availability, audited management, and redacted rejection telemetry pass. Shared limiting remains M3. | Capacity concurrency plus full state/role/tenant/no-mutation/replay/telemetry tests pass. Admin state-control UI remains Alaa's handoff. |
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
