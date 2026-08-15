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

## Tracking update — 15 August 2026 (local database migration repair)

The local `restaurant_db` was still three migrations behind the generated Prisma Client, which
caused tenant login to fail with `P2022` while loading `branches.ordering_state`. Applied the
pending public-order idempotency, table-session capacity, and ordering-availability migrations
with `prisma migrate deploy`; no database reset or destructive cleanup was used.

Post-deploy verification reports all 19 migrations current, confirms both
`branches.ordering_state` and `branches.ordering_state_updated_at`, and successfully executes the
login-shaped `OrganizationUser` query with its organization and default branch. Existing local
data resolves with default branch ordering state `OPEN`. The runtime schema mismatch is cleared;
the next implementation point remains order/realtime integrity.

## Tracking update — 15 August 2026 (order/realtime integrity started)

Published the [order realtime and authoritative refetch contract](contracts/order-realtime-integrity.md).
This slice derives private socket rooms from verified credentials, database-revalidates tracking
scope, adds safe join acknowledgements and versioned event envelopes, makes status/table changes
one transaction, and treats sockets as hints over authoritative REST state. Customer and admin
clients must rejoin and refetch after reconnect/resume; persisted `Order.version` rejects stale
events. Tracking credentials now expire after six hours, are persisted by `jti`, and support
server-side revocation; the separate expired-link recovery UI remains the client contract.

## Tracking update — 15 August 2026 (order/realtime implementation complete)

Implemented a dedicated order-realtime boundary with tenant-qualified rooms, server-derived admin
scope, database-backed tracking authorization, generic failure acknowledgements, and protocol-v1
event envelopes. New tracking tokens bind order, organization, restaurant, purpose, audience,
issuer, expiry, and subject. The public status endpoint now returns minimal versioned state with
`Cache-Control: no-store` and separates credential failures from database failures.

Status/version mutation and terminal table release now commit in one serializable transaction;
no-op updates emit nothing. Customer clients accept only newer matching order versions and refetch
on connect/resume/pageshow. Restaurant clients rejoin and authoritatively refetch orders after
reconnect. Legacy event names/rooms remain temporarily for Alaa compatibility, while new clients
consume only `.v1` events. Focused unit/frontend checks and all 26 disposable-PostgreSQL integration
tests pass; full regression verification is in progress.

## Tracking update — 15 August 2026 (order/realtime integrity complete)

Final verification passes 37 backend unit tests, 26 disposable-PostgreSQL integration tests, 45
frontend tests, 8 desktop/mobile browser E2E tests, ESLint, TypeScript, Prisma validation, and the
production build. The integration suite runs against the real Socket.IO server and proves
credential-derived joins, cross-order denial, committed version delivery, no-op suppression,
missed-event recovery through authoritative refetch, and atomic terminal table release. No
temporary test databases remain. The existing large-chunk warning is unchanged.

Yazan's local M2 backend order cycle, real-backend golden customer E2E, secure TableManagement QR
routing, and local final tenant-enforcement rehearsal are complete. M2 release closure still
requires Alaa's admin-controls/client handoff and staging evidence. The next unblocked Yazan
implementation area is M3 production infrastructure; provider choices and RPO/RTO are required
before durable storage, shared limiting, hosted monitoring, and restore work can be finalized.

## Tracking update — 15 August 2026 (Phase 1 pilot infrastructure selected)

Yazan selected the low-complexity M3 pilot path recorded in
[ADR 0008](adr/0008-single-vps-pilot-infrastructure.md): one VPS, one `systemd`-managed Node
process, localhost PostgreSQL, local uploads, the bounded in-memory limiter, nginx, Sentry, and
external uptime monitoring. Managed storage, Redis, managed PostgreSQL, horizontal scaling, and
high availability are deferred until documented business/capacity triggers occur.

This is explicitly a pilot-only single failure domain with accepted maintenance downtime. Required
hardening includes least-privilege services, localhost-only PostgreSQL, firewall/TLS/SSH controls,
protected secrets/uploads, log rotation, disk alerts, versioned rollback, and migration checks.
No-backup/manual-only operation is acceptable for disposable demos only. A real M5 restaurant
pilot remains blocked until an automated encrypted off-VPS database/upload backup and successful
restore rehearsal exist. Proposed minimum: daily backup, seven-day retention, RPO 24 hours, RTO 4
hours; Yazan must accept or replace those recovery targets.

## Tracking update — 15 August 2026 (M3 single-VPS runtime baseline started)

Yazan accepted ADR 0008's RPO 24 hours and RTO 4 hours. M3 implementation starts with the hardened
runtime baseline: production binds Node to loopback behind nginx, `systemd` runs one unprivileged
process with restart/sandbox controls, uploads move to a configurable persistent path outside
release directories, health exposes a non-secret release identifier, and SIGTERM performs graceful
socket/HTTP/database shutdown. Versioned deployment and rollback artifacts plus automated
configuration tests are included in this point. Backup/restore and Sentry are the next separately
tested M3 points.

## Tracking update — 15 August 2026 (M3 single-VPS runtime baseline implemented)

Implemented `server/runtimeConfig.js` and production runtime controls: loopback is the default
production bind, `UPLOAD_DIR` must be an absolute dedicated persistent path, release IDs are
validated and exposed by health probes, and SIGTERM/SIGINT close Socket.IO and Prisma within the
systemd deadline. Local development retains explicit safe defaults.

Added hardened nginx and systemd templates, a secrets-free production environment template,
versioned release deployment and application-only rollback scripts, and the
[single-VPS pilot runbook](operations/single-vps-pilot-runbook.md). Deployments exclude `.env`,
uploads, Git metadata, dependencies, and prior builds; apply backward-compatible migrations before
an atomic symlink switch; and verify readiness after restart. Focused runtime/configuration tests,
shell syntax, ESLint, TypeScript, diff checks, and a production-mode PostgreSQL health/graceful-
shutdown smoke test pass. Full application regression is in progress.

## Tracking update — 15 August 2026 (M3 single-VPS runtime baseline complete)

Final verification passes 44 backend unit/configuration tests, 26 disposable-PostgreSQL integration
tests, 45 frontend tests, 8 desktop/mobile browser E2E tests, ESLint, TypeScript, Prisma validation,
production build, shell syntax checks, and a production-mode startup/readiness/SIGTERM smoke test.
No temporary test databases remain. The existing large frontend chunk warning is unchanged.

The first M3 point is complete in code and documentation; real VPS installation/TLS verification
remains environment evidence, not local code work. The next M3 point is automated encrypted
off-VPS PostgreSQL/upload backup with daily scheduling, seven-day retention, failure monitoring,
and a timed isolated restore proving the accepted RPO 24 hours/RTO 4 hours.

## Tracking update — 15 August 2026 (Alaa merge accepted and plans reconciled)

Reviewed merged `main` at `01b5c45` against the QR/session, order-idempotency, ordering-state,
tenant, upload, and realtime contracts. The local handoff is accepted: checkout keeps its
idempotency key across reload/mobile resume, restaurant admins can manage branch ordering state,
the capability-less table-card QR is gone, and the real Express/Socket.IO/PostgreSQL golden flow
passes on desktop. The merged mocked capability/reload suite covers mobile, and the separate
single-worker real-backend golden suite also passes on desktop.

The merge also closes the previously listed local backend security gaps: uploads have durable
tenant/uploader ownership, tracking credentials use six-hour persisted/revocable identifiers,
membership changes disconnect affected admin sockets, organization switching/member lifecycle has
database-backed integration coverage, the predictable public table lookup is removed, and the
final tenant-enforcement migration passes a clean/corrupt disposable-database rehearsal. The final
enforcement migration remains deliberately unapplied until the ADR 0006 staging verification
reports zero issues.

Current merged verification: 44 backend unit/configuration tests, 31 disposable-PostgreSQL
integration tests, 53 frontend tests, 11 standard browser tests passed with one intentional mobile
duplicate skipped, one separate real-backend golden test, ESLint, TypeScript, Prisma validation,
and the production build. No known P0/P1 Release 1 order-business-logic work remains locally.
Outstanding backend work is either staging/production-gated or hardening: SuperAdmin MFA/re-auth
and session-lifetime decisions, a written organization/member API contract, pagination and bounded
analytics queries, the D1.5 analytics-rollup design, final tenant enforcement after staging, and
the remaining M3 backup/restore, Sentry/uptime, VPS/TLS, and capacity evidence.

## Tracking update — 15 August 2026 (SuperAdmin security and organization contract started)

Started the next two local backend points. The SuperAdmin policy will require password plus RFC
6238 TOTP, encrypt the TOTP seed at rest, issue one-time recovery codes as hashes, use a
database-revalidated session version, keep the browser credential in an HttpOnly SameSite cookie,
and issue a non-refreshable 30-minute session. Platform-changing writes require an MFA
authentication event no older than 10 minutes; otherwise the administrator completes the full
password-plus-MFA login again. Existing password-only 24-hour SuperAdmin sessions will fail closed.

In parallel, the organization/member contract point will document organization listing and
switching, member listing/creation/update, role and last-owner invariants, tenant scoping, stable
errors, session/socket revocation, and test fixtures. Runtime behavior will be corrected where a
contract assertion exposes an ambiguity; no new organization privilege is being introduced.

## Tracking update — 15 August 2026 (SuperAdmin policy and member contract implemented)

Implemented ADR 0009 and the SuperAdmin authentication contract. Password verification now returns
only a five-minute MFA challenge; existing accounts enroll RFC 6238 TOTP before receiving access.
Seeds use AES-256-GCM with a dedicated production key, authenticator steps cannot replay, eight
one-time recovery codes are stored only as keyed hashes, five failures lock verification for 15
minutes, and enrollment/recovery updates are serializable. Thirty-minute sessions require MFA and
the current database session version on every request, live only in an HttpOnly SameSite cookie, and
logout revokes all outstanding sessions. Subscription changes require authentication within 10
minutes and no longer return the restaurant password field.

Published the organization/member contract and linked it from the HTTP baseline. The contract
covers list/switch/member endpoints, exact OWNER/MANAGER/STAFF authority, limits, conflict and
non-disclosure behavior, database-revalidated HTTP authorization, and socket revocation. Empty
membership patches now fail validation. Integration coverage now includes real multi-organization
switching, manager denial of OWNER grants, duplicate members, self-suspension, sole-owner
protection, cross-tenant denial, and post-suspension HTTP/socket revocation.

Focused evidence passes: Prisma generation/validation, 52 backend unit/security tests, 54 frontend
tests, 32 disposable-PostgreSQL integration tests, ESLint, and TypeScript. Full browser/build and
final regression evidence are in progress before these points are marked complete.

## Tracking update — 15 August 2026 (SuperAdmin and member-contract points complete locally)

Final review tightened the SuperAdmin browser boundary from session storage to an HttpOnly,
SameSite=Strict cookie scoped to the platform API and marked Secure in production. JavaScript never
receives the platform credential; CORS credential mode remains namespace-isolated from the
restaurant bearer. Failed MFA counting is atomic under concurrent requests, and the integration
suite proves five simultaneous invalid factors produce four denials and one 15-minute lock.

Final regression passes 52 backend unit/security/configuration tests, 32 disposable-PostgreSQL
integration tests, 55 frontend tests, 11 standard desktop/mobile browser tests with one intentional
duplicate-mobile skip, one separate real-backend golden test, ESLint, TypeScript, Prisma
validation, and production build. The existing large frontend chunk warning is unchanged.

Both requested points are locally complete. Deployment requires migration
`20260815150000_super_admin_mfa_session_policy` plus a separately generated
`SUPER_ADMIN_MFA_ENCRYPTION_KEY`. Existing SuperAdmins receive no password-only access and enroll
TOTP on first post-deploy login. Staging/TLS enrollment evidence remains before production-Done.
The next unblocked Yazan point returns to M3 encrypted off-VPS backup and timed restore for RPO 24
hours/RTO 4 hours.

## Tracking update — 15 August 2026 (M3 backup and restore started)

Started the next M3 recovery point using a provider-neutral `restic` repository so the pilot can
target S3-compatible storage or SFTP without coupling recovery logic to one vendor. The planned
backup is a locked, consistent staging snapshot containing a PostgreSQL custom-format dump,
uploads, and a non-secret integrity manifest; `restic` encrypts the snapshot before off-VPS
transfer. Repository credentials, the restic password, application secrets, and the SuperAdmin MFA
encryption key remain outside the backup payload.

This point includes a hardened one-shot systemd service and twice-daily timer, seven daily/four
weekly/six monthly retention defaults, integrity checking, a non-secret success marker plus
dead-man monitoring, and a destructive-guarded restore into an explicitly confirmed
empty non-production database and upload directory. A local automated rehearsal will verify the
scripts and timing/report contract; real off-VPS credentials and VPS execution remain deployment
evidence. The accepted targets remain RPO 24 hours and RTO 4 hours.

## Tracking update — 15 August 2026 (M3 backup and restore implemented)

Implemented the recovery automation in `ops/bin`: backup now acquires an overlap lock, rejects
upload symlinks, stages only a custom-format PostgreSQL dump, uploads, and a versioned checksum
manifest, then runs encrypted `restic` backup, retention pruning, repository checking, an atomic
success marker, and dead-man monitor pings. A dedicated init unit, hardened backup service, and
02:00/14:00 UTC persistent timer run under `boltqrbackup`; the new `boltqruploads` group gives it
read-only upload access without access to the application secret environment. Restic and database
passwords use systemd credentials.

The isolated restore command requires explicit non-production confirmation, refuses the production
upload path, compares resolved PostgreSQL source/target fingerprints, requires empty targets,
checks the dump manifest/hash, rejects restored symlinks, verifies application tables, and writes a
timed RTO report. ADR 0010 and the single-VPS runbook now document remote storage/versioning,
credential handling, installation, monitoring, rehearsal, and growth triggers. Seven recovery
tests plus four existing pilot-infrastructure tests pass, including a controlled end-to-end backup
and restore orchestration rehearsal, stale-marker rejection, destructive guards, and shell syntax.
Full regression is in progress; real encrypted off-VPS and under-four-hour VPS restore evidence is
still required before M5.

## Tracking update — 15 August 2026 (M3 backup and restore locally complete)

Final regression passes 59 backend unit/configuration/security/recovery tests, 32 disposable-
PostgreSQL integration tests, 55 frontend tests, 11 standard browser tests with one intentional
mobile golden skip, and one separately isolated real-backend golden test. ESLint, TypeScript,
Prisma validation, production build, shell syntax, and diff checks pass. The existing large
frontend chunk warning is unchanged. The standard Playwright suite now uses one worker because it
contains a shared mutable real-backend fixture; its default `npm run test:e2e` command passes
deterministically.

The local M3 recovery implementation is complete. It also supports disaster conditions where the
live source database is unavailable: each backup manifest stores the resolved source database
fingerprint, and restore compares the isolated target to that captured value before mutation.
Production-Done remains blocked until a selected repository outside the VPS completes a real
encrypted backup and a timed isolated restore with newest data under 24 hours old and recovery
under four hours. The next local M3 implementation point is Sentry application telemetry and
external uptime/alert validation.

## Tracking update — 15 August 2026 (M3 Sentry and uptime started)

Started the next M3 observability point. Backend and React failures will use separate Sentry DSNs,
the existing validated release ID, and the `pilot`/production environment tag. Collection is
privacy-minimized: no default PII, request bodies, authorization/cookie headers, session replay,
local variables, or customer basket/note data; a final event scrubber removes credentials, email
addresses, sensitive query parameters, and excess context before transport. Existing request IDs
and pseudonymous organization IDs provide correlation without sending names or email addresses.

The frontend integration will report render-boundary and unhandled failures and conditionally
upload hidden source maps during an authenticated production build, deleting map files from the
deployed artifact afterward. The Node integration will initialize before Express, report only
unhandled/5xx failures, and flush during graceful shutdown. External uptime monitors the public
HTTPS readiness endpoint; a local operator-only script—not a public API route—will verify readiness
and send a tagged synthetic Sentry exception. Real DSNs, provider monitor configuration, alert
delivery, and retention/access settings remain environment evidence.

## Tracking update — 15 August 2026 (M3 Sentry and uptime implemented)

Implemented privacy-minimized Sentry telemetry for the Node API and React application. Node now
preloads instrumentation before Express, captures unhandled and generic 5xx failures once, excludes
health-probe noise, and flushes on graceful shutdown. React initializes before lazy application
imports, uses Sentry's global error handling, and reports both customer/admin render boundaries.
Both paths fail closed on malformed production release/environment/DSN values and apply an explicit
deny list plus final scrubber for users, cookies, headers, bodies, query secrets, credentials, email,
notes, local variables, and excessive context. Performance tracing remains disabled by default and
session replay is absent.

Production builds now attach the immutable release to both applications and conditionally upload
hidden browser source maps with a build-only token; uploaded map files are deleted from `dist`.
The operator-only `ops/bin/verify-observability.js` command verifies public HTTPS readiness and
database state, checks the active release, and sends a release-fingerprinted `synthetic=true` event
without adding a public trigger endpoint. ADR 0011 and the single-VPS runbook define 60-second
external checks, two-failure/two-success alerting, two delivery destinations, least-privilege/MFA
access, short retention, and induced outage/recovery evidence.

Focused evidence passes nine backend/infrastructure checks and four frontend telemetry/error-
boundary checks, plus ESLint and TypeScript. Full regression is in progress. Real hosted Sentry
receipt and notification, external-monitor failure/recovery delivery, provider access/retention,
and redacted evidence remain deployment gates; SDK flush alone is intentionally not treated as
proof of provider delivery.

## Tracking update — 15 August 2026 (M3 Sentry and uptime locally complete)

Final local regression passes 64 backend unit/configuration/security/recovery/telemetry tests, 32
disposable-PostgreSQL integration tests, 57 frontend tests, 11 standard browser tests with one
intentional mobile golden skip, and one separately isolated real-backend golden test. ESLint,
TypeScript, Prisma validation, production build, executable/script checks, diff checks, and an
instrumented production-start-path readiness smoke pass. The normal build contains no source-map
files. `npm audit --omit=dev` reports zero production dependency advisories; the pre-existing
Vite/Vitest development toolchain reports five advisories that require a separate major-version
upgrade and is not used as a public production service.

The observability code, security policy, ADR, environment templates, deployment wiring, operator
validator, and runbook are locally complete. Production-Done still requires two real Sentry
projects, restricted MFA-protected access/retention settings, a source-map upload, matching hosted
synthetic event and two-destination alert receipt, plus an externally observed induced failure and
recovery. The next local Yazan M3 point is pagination/bounded analytics and query-plan/capacity
evidence; VPS/TLS and hosted-provider execution remain environment work.

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
| Session-storage threat model and token classes — SuperAdmin resolved by ADR 0009 HttpOnly cookie; restaurant compatibility bearer remains separately bounded | M1 auth/session | Both | Platform decision complete 15 Aug; restaurant review remains |
| RLS versus documented compensating controls — Yazan selected ADR 0006 B; Alaa/staging pending | M1 tenant integrity | Both | Sign-off/staging required |
| POS disposition: **Park** | Schema/migration scope | Both | Day 3 |
| Phase 1 hosting/providers — single VPS/nginx/systemd/local PostgreSQL/uploads/in-memory limiter/Sentry/uptime selected in ADR 0008 | M3 pilot operations | Yazan | Runtime, recovery, and observability automation local; hosted Sentry/uptime and VPS evidence pending |
| Backup method, RPO/RTO, and retention — restic off-VPS; RPO 24h/RTO 4h accepted in ADR 0010 | M3 recovery and M5 gate | Yazan | Automation/rehearsal contract local; real remote restore evidence pending |

## Work sequence

### Y0 — M0 foundation (Week 1) — In progress

| Task | Deliverable / handoff | Evidence |
|---|---|---|
| Repair reproducible local/CI install | **Complete 14 Aug:** CI pins Node 22; local `npm ci` succeeds after Prisma generation. | Unit, lint, Prisma validate, typecheck, frontend tests, build, and E2E smoke pass. |
| Test database and HTTP harness | **Complete 14 Aug:** disposable PostgreSQL database, migration setup, deterministic fixtures, safe cleanup, HTTP harness, and database-backed authentication/tenant characterization. | `npm run test:integration` passes 2 tests; created ephemeral database is removed after the run. |
| ADRs | **Foundation ADRs published 14 Aug:** errors/request context, release gates, and token classes. Joint sign-off and remaining tenant/POS/RLS/recovery decisions remain pending. | ADRs 0001–0003 published; approval record pending. |
| API contract baseline | **Release 1 local baseline complete 15 Aug:** request IDs, errors, limiter responses, token classes, table capability/session, durable retry semantics, SuperAdmin MFA/session, and organization switching/member lifecycle are implemented and documented. | Published contracts and unit/integration/client tests cover all listed boundaries; staging evidence remains. |
| CI baseline | **Complete 14 Aug:** `.github/workflows/ci.yml` added for install, Prisma, lint, typecheck, tests, and build. | Workflow authored; hosted CI execution evidence pending. |

### Y1 — M1 tenant, errors, and observability (Weeks 2–3)

| Task | Backend scope | Required test / Alaa handoff |
|---|---|---|
| Request context | **Complete 14 Aug:** generate/return `X-Request-Id`; structured request line includes route/status/duration/tenant/user IDs. | HTTP test and contract documentation pass. |
| Safe error contract | **Complete 14 Aug:** stable `code`, safe `message`, `requestId`, optional `retryAfter`, centralized 5xx redaction. | Internal diagnostic and stack redaction tests pass. |
| Bounded local limiter | **Complete 14 Aug:** expiry sweep, hard entry cap, bounded eviction, deterministic reset, trusted-proxy setting, and `Retry-After`. | Unit tests and contract documentation pass. |
| Incremental extraction | **Complete 14 Aug:** active tenant session resolution and access policies extracted into dependency-injected modules; `server/index.js` composes them without route/contract changes. | 19 unit and 8 database-backed characterization tests pass; ADR 0005 documents boundaries and rollback. |
| Tenant phase 2 | **Local expand/backfill/verify/enforce rehearsal complete 15 Aug:** direct ownership is populated; seven-root verification and the fail-closed final constraint migration pass on clean data and reject corrupt data. Legacy compatibility fields remain during transition. | ADR 0004/0006 fixtures, cross-tenant negatives, and final migration rehearsal pass; run the zero-issue report on staging before applying enforcement there. |
| Session hardening | **Release 1 local lifecycle complete 15 Aug:** explicit restaurant/table/tracking classes, six-hour tracking revocation, membership socket revocation, and ADR 0009 mandatory SuperAdmin TOTP with encrypted seeds, recovery codes, HttpOnly 30-minute sessions, database revocation, and recent-auth writes. | Token, RFC vector, encryption, replay, lockout, cookie, PostgreSQL, client, and browser negatives pass; staging/TLS enrollment evidence remains. |

### Y2 — M2 trustworthy order cycle (Weeks 4–5)

| Task | Backend scope | Required test / Alaa handoff |
|---|---|---|
| QR/table capability | **Local joint implementation accepted 15 Aug:** secure generator/exchange, table bearer checkout, recovery states, capability-only TableManagement routing, mocked desktop/mobile paths, and real-backend desktop golden E2E pass. | Backend negatives and merged browser paths pass; staging and final real-device/RTL sign-off remain release evidence. |
| Idempotency | **Backend and client recovery complete 15 Aug:** required safe key, capability-version/tenant/table scope, 24-hour durable record, atomic order/effects, exact replay, changed-payload conflict, rollback, no duplicate socket emission, and reload/mobile-resume key persistence. | Concurrent integration and browser timeout/reload tests prove one order and one promotion mutation. |
| Abuse controls | **Local joint controls complete 15 Aug:** session/organization/IP limits, transactional three-open-order cap, branch pause/closed/overload, fail-closed table availability, audited management, redacted telemetry, and restaurant-admin state UI. Shared limiting remains deferred by ADR 0008 while the pilot uses one Node process. | Capacity concurrency plus state/role/tenant/no-mutation/replay/telemetry integration tests and ordering-state component tests pass. |
| Order/realtime integrity | **Local backend/client integrity complete 15 Aug:** credential-derived tenant rooms, database-revalidated six-hour tracking scope and revocation, protocol-v1 events, monotonic versions, atomic status/table transitions, authoritative reconnect/resume refetch, and membership socket revocation. | 44 unit, 31 PostgreSQL integration, 53 frontend, 11 standard browser plus one separate real-backend golden test pass; staging evidence remains. |

### Y3 — M3 production infrastructure (Weeks 6–8)

- **Selected Phase 1 topology:** one hardened VPS with nginx, one `systemd` Node process,
  localhost PostgreSQL, protected local uploads, bounded in-memory limiting, Sentry, and external
  uptime monitoring.
- **Locally implemented:** versioned deployment/rollback, hardened runtime/nginx/systemd, encrypted
  off-VPS backup and guarded restore automation, separate privacy-minimized server/browser Sentry,
  build-only source-map upload/removal, and host-only readiness/synthetic-alert validation.
- Add deployment scripts/configuration, TLS renewal, firewall/SSH/service hardening, secret
  permissions, release rollback, log rotation, disk/database/process alerts, and runbooks.
- Keep pagination/bounded analytics filters and query-plan/load evidence before pilot.
- Add automated encrypted off-VPS PostgreSQL/upload backup, retention monitoring, and timed restore
  rehearsal before real restaurant data; manual-only remains a blocker.
- Defer managed object storage, Redis/shared limiting, managed PostgreSQL, and high availability to
  ADR 0008 growth triggers.

**Pilot exit evidence:** secure local-upload tests, TLS/systemd/nginx hardening checks, synthetic
Sentry/uptime alert, clean-server rebuild, off-VPS restore within approved RPO/RTO, and measured API
p95/error rate/capacity on the selected VPS.

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
