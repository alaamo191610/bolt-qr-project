# Production Execution Plan

**Date:** 13 August 2026  
**Source documents:** `Yazan-Alaa-Production-Delivery-Plan.docx` v1.0,
`Gap-Analysis-and-Plan-Corrections.md`, and
`Senior-Architecture-Review-and-Revised-Plan.md`
**Status:** M0 in progress; requires Yazan + Alaa sign-off before milestones begin.

## Implementation tracking — 14 August 2026

The first implementation slice is complete and is recorded here immediately after validation.
The release plan remains active: items marked complete below are foundation work, not a claim
that the full 12-week release is complete.

### Completed evidence

- Repaired the local dependency install with `npm ci` and added automatic Prisma Client
  generation before unit tests. CI is pinned to Node 22. The local Node 24 runtime works but
  emits the declared `>=20 <23` engine warning; release development should use Node 20–22.
- Added an importable Express app and isolated HTTP harness. Backend foundation tests cover
  live health, request correlation, unknown-route errors, limiter behavior, bounded storage,
  and server-error redaction.
- Added stable error metadata (`code`, `requestId`, optional `retryAfter`) while preserving the
  existing `error` field for compatibility. Server diagnostics are not returned to clients.
- Added explicit restaurant-session, super-admin-session, and order-tracking token classes with
  issuer/audience/purpose/expiry verification and cross-class negative tests.
- Added CI workflow, API baseline contract, and ADRs 0001–0003.
- Validation on 14 August: 12 backend tests passed, 5 frontend tests passed, desktop/mobile
  Playwright smoke passed 2/2, lint passed, typecheck passed, Prisma validation passed, build
  passed, and production-only `npm audit` reported 0 vulnerabilities.

### Current blockers and next point

- M0 is still in progress because the disposable PostgreSQL test database, deterministic
  fixtures, migration rehearsal, and database-backed authentication characterization test are
  not yet implemented.
- D1 joint decisions remain required for takeaway ordering, tracking recovery/expiry, session
  storage, RLS versus compensating controls, providers, RPO/RTO, ordering pause/capacity, log
  retention/access, and SuperAdmin MFA/session duration.
- Next point: add the disposable PostgreSQL test/fixture harness and characterize tenant-scoped
  reads/writes before the phase-2 tenant migration.

## Implementation tracking — 14 August 2026 (next point complete)

The disposable PostgreSQL and tenant characterization point is complete.

- Added a safe disposable test database harness that uses uniquely named `bolt_qr_test_*`
  databases by default, applies all Prisma migrations, truncates only application tables between
  tests, rejects unsafe names, and drops only databases it created.
- Added deterministic Alpha/Beta organization fixtures and database-backed HTTP tests covering
  active tenant authentication, cross-tenant organization selection denial, tenant-scoped menu
  and category reads, and cross-tenant write denial with unchanged-database verification.
- Added `npm run test:integration` plus a PostgreSQL 16 CI service. The local ephemeral database
  was removed after the passing run and no `bolt_qr_test_*` databases remain.
- Evidence: integration tests 2/2 passed; full validation also passed 12 unit tests, 5 frontend
  tests, lint, typecheck, Prisma validation, and production build.

### Next implementation point

Run a production-shaped migration rehearsal and document the expand → backfill → verify →
enforce plan for direct tenant ownership before adding tenant aggregate-root columns.

## Implementation tracking — 14 August 2026 (migration rehearsal complete)

The production-shaped tenant migration rehearsal is complete. No production schema or
aggregate-root ownership columns were changed in this point.

- Applied all migrations before `20260813010000_tenant_identity_transition` to an isolated
  PostgreSQL database.
- Seeded two legacy-shaped admin profiles with null organization/branch ownership and dependent
  categories, menus, tables, orders, and promotions.
- Applied the existing transition SQL and verified organizations, branches, users, owner
  memberships, child branch links, and cross-tenant query boundaries.
- Replayed the idempotent backfill statements without duplicate identities or memberships.
- Published ADR 0004 with the expand → backfill → verify → enforce → contract sequence,
  rollback constraints, and parked-POS treatment.

### Evidence and next point

`npm run test:integration` passed 4 tests. Full validation passed 12 unit tests, 5 frontend
tests, lint, typecheck, Prisma validation, and build. No `bolt_qr_test_*` databases remain.

Next: implement the expand-only direct organization ownership migration with nullable indexed
columns, compatibility reads/writes, verification SQL, and an explicit rollback note. Do not
enforce non-null or remove legacy columns in that point.

## Implementation tracking — 14 August 2026 (expand migration complete)

The expand-only direct organization ownership migration is complete. This point changed only
isolated test databases; no production database was migrated.

- Added migration `20260814090000_expand_tenant_ownership` with nullable, indexed
  `organization_id` and `organizations(id)` foreign keys using `ON DELETE SET NULL` for
  categories, ingredients, menus, tables, orders, promotions, and modifier groups.
- Added Prisma relations and compatibility writes for authenticated category, ingredient, menu,
  table, and promotion creation. Public orders derive organization ownership from the selected
  target admin.
- Kept legacy `admin_id`/`user_id` and `branch_id` fields unchanged. No backfill, non-null
  enforcement, composite cross-tenant constraint, or destructive column removal is included.
- Added migration assertions for seven columns, indexes/FK behavior, legacy nullability, tenant
  boundaries, and rerunnable transition backfill semantics. See ADR 0004 for rollback limits.

### Evidence and next point

The final local validation sequence passed 12 unit tests, 4 PostgreSQL integration/rehearsal
tests, 5 frontend tests, ESLint, TypeScript, Prisma validation, and production build. No
`bolt_qr_test_*` databases remain.

Next: design and implement the bounded backfill for these seven roots with unresolved-row
detection, measurable before/after counts, and idempotent rerun verification. Enforcement remains
blocked until verification and the RLS-versus-compensating-controls decision are approved.

## Implementation tracking — 14 August 2026 (bounded backfill complete)

The bounded direct organization ownership backfill is complete. This point changed only isolated
test databases; no production database was migrated.

- Added migration `20260814100000_backfill_tenant_ownership` for categories, ingredients, menus,
  tables, orders, and promotions using their existing admin/user-to-organization relationship.
- Derived modifier-group ownership through linked menus only. Orphan, unresolved, conflicting, or
  cross-organization ownership causes a check-violation abort before any ownership update.
- Added idempotent rerun behavior by validating existing values and updating only null ownership
  fields. Legacy fields remain available, and no non-null/composite enforcement was introduced.
- Fixed test-database cleanup to preserve the original migration error and remove only harness-owned
  ephemeral databases.

### Evidence and next point

`npm run test:integration` passed 5 tests, including direct ownership counts, zero mismatch
verification, idempotent rerun, and cross-tenant modifier-group rejection. `git diff --check`
passed and no `bolt_qr_test_*` databases remain.

Next: execute the verify phase across all seven roots, including branch agreement and
cross-tenant link/delete negatives, before proposing non-null or composite enforcement.

## Implementation tracking — 14 August 2026 (verify phase complete)

The local tenant-ownership verify phase is complete. No production data or constraints changed.

- Added a reusable read-only verification report for all seven aggregate roots. It exposes total,
  missing/inactive organization, legacy-owner, branch, and relationship mismatch counts plus an
  enforcement-readiness flag.
- Expanded production-shaped fixtures to cover two of every root and 14 direct ownership values.
  Clean data reports 7/7 roots ready; deliberate cross-tenant corruption reports 7/7 not ready.
- Added API negatives for category, ingredient, and modifier links plus menu/table/order/promotion
  destructive mutations against another tenant, verifying the target tenant remains unchanged.
- Fixed modifier-group compatibility writes and pre-write backfill resolution discovered by the
  expanded verification coverage.

### Evidence, decision, and next point

`npm run test:integration` passed 8 tests. Enforcement remains blocked until the same report is
zero on a staging copy of target data and the RLS-versus-compensating-controls decision is signed.

Next unblocked work: behavior-neutral auth/tenant domain extraction under the existing
characterization suite. Do not combine extraction with tenant enforcement or contract removal.

## Implementation tracking — 14 August 2026 (auth/tenant session extraction complete)

The first behavior-neutral extraction point is complete.

- Moved active identity/membership/organization resolution, compatibility Admin selection,
  restaurant token creation, and tenant response assembly into `server/tenantSession.js`.
- Kept database and token dependencies explicit and preserved all route, claim, branch fallback,
  membership ordering, response, and compatibility-profile behavior.
- Added focused unit tests for active query scope and fail-closed invalid/missing identity paths.

## Implementation tracking — 14 August 2026 (access-policy extraction complete)

The second requested extraction point is complete.

- Moved authentication middleware, SuperAdmin/organization role gates, and catalog ownership
  assertions into `server/accessControl.js`.
- Kept `server/index.js` as the composition/route layer with no public API or frontend contract
  change.
- Added focused request-context, credential, inactive-tenant, role-denial, and catalog ownership
  tests. Published ADR 0005 for the domain boundary and rollback.

### Evidence and next point

Final validation passed 19 unit tests, 8 PostgreSQL integration tests, 5 frontend tests, ESLint,
TypeScript, Prisma validation, and production build. Tenant enforcement is still blocked by staging
verification and the RLS/control decision; M2 public-order work is blocked by the takeaway/anti-abuse
decision. These decisions are the next required inputs.

## Implementation tracking — 14 August 2026 (blocking decision package ready)

The next planning point is complete; no runtime or schema behavior changed.

- Proposed ADR 0006 with two implementable tenant-enforcement choices. Recommendation: Release 1
  non-null/composite ownership constraints, mandatory organization scoping, least-privilege runtime
  role, verification gates, and tenant-negative tests; introduce RLS after safe runtime-role and
  transaction-context support exists.
- Proposed ADR 0007 with three takeaway choices and concrete capability/idempotency/abuse defaults.
  Recommendation: disable takeaway for Release 1; if takeaway is mandatory, require verified contact.
- Both records include exact approval syntax, security consequences, and the work unlocked by each
  decision.

### Required approvals

Choose ADR 0006 A or B, choose ADR 0007 A/B/C, and accept or replace its limits and lifetimes.
The recommended approval is tenant Option B plus takeaway Option A with the proposed defaults.

## Implementation tracking — 14 August 2026 (Yazan decisions recorded and takeaway disabled)

Yazan selected ADR 0006 Option B and ADR 0007 Option A, then accepted ADR 0007's dine-in
abuse/session defaults. Alaa sign-off remains pending under the joint decision rule.

- Takeaway now fails before order mutation with stable `403 ORDER_TYPE_DISABLED`.
- Integration coverage verifies the tenant's order count is unchanged after a takeaway attempt.
- Added `npm run verify:tenant-ownership` for read-only staging preflight. It emits root-level counts
  only and exits non-zero unless all seven roots are ready.
- Tenant non-null/composite enforcement is not yet applied: staging must first return zero issues.
- Dine-in remains a No-Go public write until the table capability, idempotency, and accepted abuse
  controls are implemented.

Final validation passed 21 unit tests, 10 PostgreSQL integration tests, 5 frontend tests, ESLint,
TypeScript, Prisma validation, and production build.

## Implementation tracking — 14 August 2026 (dine-in defaults accepted)

Yazan accepted the proposed 30-minute table session, exchange/order rate limits, three-open-order
cap, and 50-line-item maximum. The table-capability API/security contract is published before code,
including hashed-at-rest capability storage, rotation/revocation, database revalidation, stable
errors, and the frontend handoff. Runtime implementation and evidence are now in progress; Alaa's
joint sign-off remains pending.

## Implementation tracking — 14 August 2026 (table capability slice complete)

- Added hash-only, 256-bit, tenant/table-bound QR capability storage with PostgreSQL constraints and
  tenant-authenticated rotation/revocation.
- Added 30-minute `table-session` exchange and database version revalidation. Rotation/revocation
  fail closed for already-issued sessions.
- Dine-in orders no longer trust body restaurant/table identity: ownership and branch are derived
  from the capability and revalidated under a capability-row lock inside the order transaction.
  The 50-item maximum and accepted exchange/session/organization local limits are active.
- Published the endpoint/token/error contract and Alaa handoff. Frontend work was deliberately not
  changed in Yazan's backend slice.
- Final evidence: 24 unit, 14 disposable-PostgreSQL integration, 5 frontend regression, and 2
  browser E2E tests pass with lint, typecheck, Prisma validation, and production build.

This closes the backend QR/table-capability row, not M2. Durable idempotency, the three-open-order
cap, ordering pause/closed/overload behavior, rejection telemetry, shared production limiting, and
Alaa's QR/checkout E2E remain release gates.

## Implementation tracking — 14 August 2026 (merged QR/session review failed)

Fetched and reviewed `main` at `4701771`. ESLint, TypeScript, all 38 current frontend tests, and the
production build pass, but those gates do not exercise the required QR/table-session journey.

The merged frontend still generates predictable `?table=...&restaurant=...` QR URLs, has no
capability rotation/exchange client, sends `adminId`/`tableCode` in order bodies without a
table-session bearer token, has no invalid/expired/rotated QR recovery state, and has no golden QR
E2E. Against the secured backend, dine-in checkout therefore fails with
`401 TABLE_SESSION_REQUIRED` before mutation.

Decision: QR/session frontend handoff is **not accepted**; M2 remains No-Go. Alaa must implement the
published contract and tests, or the work must be explicitly reassigned. Durable PostgreSQL
idempotency remains the next Yazan task but was not started because progression was conditional on
this review passing.

## Implementation tracking — 15 August 2026 (QR/order gap re-review)

The core frontend table-capability handoff is now present at `1396b5f`: authenticated QR
rotation/revocation with invalidation warning, public exchange, session-only customer state,
table-session bearer checkout without body identity, and missing/invalid recovery UI. Verification
passes 24 unit, 14 PostgreSQL integration, 40 frontend, and 8 desktop/mobile browser tests plus all
static/build gates.

M2 is still No-Go for these concrete gaps:

- `TableManagement` exposes a legacy external, capability-less QR that opens a non-orderable menu;
  remove it or route users to the secure generator.
- Browser QR tests fully mock the API; real disposable-backend rotate → exchange → order → tracking,
  post-exchange rotation/revocation, and RTL evidence remain.
- Server order creation ignores the client's `Idempotency-Key`; retries can create duplicate orders
  and duplicate promotion usage. The client key also does not survive reload/mobile resume.
- Three-open-order capacity, restaurant pause/closed/overload checks, stable error codes, and safe
  rejection telemetry are not implemented.
- Production shared limiting remains M3 work, and new tables currently lack the branch ownership
  required by the existing generic idempotency table.

Decision: accept the core QR/session handoff for Yazan to continue with durable PostgreSQL order
idempotency, while keeping pilot/release blocked on the legacy QR and remaining controls.

## Implementation tracking — 15 August 2026 (durable order idempotency started)

The legacy capability-less QR remains a parallel pilot blocker; it does not block the isolated
backend transaction work. The public order-idempotency contract is published with a required
`Idempotency-Key`, 24-hour retention, canonical request hashing, capability-version tenant scope,
atomic create/replay/conflict semantics, PostgreSQL concurrency behavior, and the remaining
frontend persistence handoff. Schema/service implementation and evidence are in progress.

## Implementation tracking — 15 August 2026 (durable order idempotency complete)

The backend now requires and validates `Idempotency-Key` for capability-authorized dine-in orders
and persists a 24-hour PostgreSQL record scoped to organization, table capability ID, and capability
version. Composite foreign keys fail closed on tenant/table/capability mismatch. Reservation, order,
items, promotion usage, table status, and completion are one transaction. Exact replays return the
same order with `200`; changed payloads return `409 IDEMPOTENCY_CONFLICT`; failed transactions leave
no reservation or partial effects; replay does not emit duplicate socket events.

Final evidence passes ESLint, TypeScript, Prisma validation, production build, 26 unit tests, 21
disposable-PostgreSQL integration tests, 40 frontend tests, and 8 desktop/mobile browser E2E tests.
Database cases include concurrent same-key requests, one promotion increment, rollback/key reuse,
cross-tenant scope, QR capability rotation scope, and 24-hour expiry reuse. M2 remains No-Go until
the legacy QR is removed, frontend keys survive reload/mobile resume, real-backend golden E2E
exists, and capacity/pause/telemetry controls are complete. The next Yazan point is the
transactional maximum-three-open-orders control.

## Implementation tracking — 15 August 2026 (three-open-order capacity started)

The public order-capacity contract is published before implementation. It fixes the scope to an
individually issued 30-minute table-session UUID, open statuses to
`pending`/`preparing`/`ready`, terminal release to `served`/`cancelled`, and the stable response to
`409 ORDER_LIMIT_REACHED`. The count and insertion will share the existing order transaction under
an exclusive PostgreSQL capability lock; idempotency replay remains valid at capacity and rejected
new orders leave no reservation or business mutation.

## Implementation tracking — 15 August 2026 (three-open-order capacity complete)

Each capability exchange now issues a random signed table-session UUID; public orders persist it
through an additive nullable migration and indexed tenant/table/session/status scope. The local
six-attempt limiter also uses this individual session identity. Inside the existing idempotent order
transaction, an exclusive capability-row lock serializes the open-order count and insertion.
`pending`/`preparing`/`ready` consume three slots; `served`/`cancelled` release capacity; a fourth new
order returns `409 ORDER_LIMIT_REACHED` with no idempotency, order, promotion, table, or socket
mutation. Exact replay still succeeds while full, and the internal UUID is omitted from public
responses/events.

Final evidence passes ESLint, TypeScript, Prisma validation, production build, 28 unit tests, 23
disposable-PostgreSQL integration tests, 40 frontend tests, and 8 desktop/mobile browser E2E tests.
The database suite proves the boundary, replay, rollback, terminal release, independent sessions,
and concurrent unique submissions. The next Yazan point is ordering
pause/closed/overloaded/table-unavailable enforcement plus audit-safe rejection telemetry.

## Implementation tracking — 15 August 2026 (ordering availability and telemetry started)

The public availability/telemetry contract is published. Branches durably own
`OPEN`/`PAUSED`/`CLOSED`/`OVERLOADED`; table status independently fails closed unless `available` or
`occupied`. An owner/manager-only tenant-scoped endpoint and audit event govern transitions. Public
enforcement will run after exact idempotency replay but before capacity or any business mutation,
with stable `409` codes and structured rejection telemetry that excludes baskets, notes, promotion
data, tokens, hashes, IPs, and raw errors.

## Implementation tracking — 15 August 2026 (ordering availability and telemetry complete)

Branches now durably store indexed `OPEN`/`PAUSED`/`CLOSED`/`OVERLOADED` state. The additive migration
backfills only ownership-consistent default branches, and new tables require an active tenant
default branch. Owner/manager GET/PUT state management is tenant-scoped; real changes and audit
events use one serializable transaction. Staff and cross-tenant access fail closed.

After exact replay resolution, the exclusively locked order transaction enforces branch and table
state with stable `409` codes before every business mutation. Rejections roll back idempotency.
Structured telemetry emits only correlation/scope IDs, reason, and allowlisted counters; customer
messages consume all published codes. Final evidence passes ESLint, TypeScript, Prisma validation,
production build, 30 unit tests, 25 PostgreSQL integration tests, 41 frontend tests, and 8
desktop/mobile browser E2E tests. Admin control UI remains a frontend handoff. The next Yazan point
is authorized/versioned order realtime and authoritative reconnect/refetch behavior.

## Implementation tracking — 15 August 2026 (local migration deployment repaired)

Local tenant login exposed an environment drift failure: the generated Prisma Client selected
`branches.ordering_state`, but `restaurant_db` had not applied the latest three M2 migrations.
Deployed `20260815100000_public_order_idempotency`,
`20260815110000_table_session_order_capacity`, and
`20260815120000_public_order_availability` in order without resetting data.

Verification shows all 19 migrations applied, both availability columns present, and the
`OrganizationUser` login relation query successfully loading its organization/default branch with
ordering state `OPEN`. This closes the local runtime blocker only; staging migration evidence is
still required by the production definition of done, and M2 work proceeds to order/realtime
integrity.

## Implementation tracking — 15 August 2026 (order/realtime integrity started)

The M2 realtime contract is published in
`docs/contracts/order-realtime-integrity.md`. PostgreSQL/HTTP state remains authoritative;
authenticated sockets carry versioned notification hints using persisted `Order.version`.
Implementation covers server-derived tenant rooms, database-backed order-room authorization,
safe join acknowledgements, atomic status/table mutation, monotonic client application, and
authoritative reconnect/resume refetch tests. Tracking-token lifetime remains at the current 24
hours until the separate D1 expiry/recovery decision is jointly approved.

## Implementation tracking — 15 August 2026 (order/realtime implementation complete)

The realtime boundary now derives tenant rooms from active credentials, revalidates customer order
scope in PostgreSQL, returns non-enumerating join failures, and emits protocol-v1 envelopes only
after commit. Persisted `Order.version` drives monotonic customer updates; no-op transitions do not
emit. Status transition and terminal table release are one serializable transaction, and the
minimal status endpoint is non-cacheable and distinguishes authentication from server failure.

Customer reconnect/resume and restaurant reconnect both perform authoritative HTTP reconciliation.
Legacy event names/rooms remain as a bounded compatibility bridge for Alaa. Focused unit/frontend
checks and 26 disposable-PostgreSQL integration tests pass, including real Socket.IO delivery,
cross-order denial, missed-event recovery, no-op suppression, and committed table release. Full
regression verification remains in progress.

## Implementation tracking — 15 August 2026 (order/realtime integrity complete)

Final evidence passes 37 backend unit tests, 26 disposable-PostgreSQL integration tests, 45
frontend tests, 8 desktop/mobile browser E2E tests, ESLint, TypeScript, Prisma validation, and the
production build. Real Socket.IO integration proves authenticated tenant/order isolation,
post-commit versioned events, no event for no-op transitions, reconnect recovery through
authoritative HTTP state, and atomic status/table release. No temporary test database remains; the
existing large-chunk warning remains assigned to later performance work.

This completes Yazan's local M2 backend order-cycle scope. The M2 milestone is not production-Done
until Alaa's legacy QR/admin-control/client handoff and real-backend golden E2E are complete, the
tracking expiry/recovery decision is approved, and staging evidence exists. Yazan's next unblocked
implementation area is M3, gated where applicable by provider and RPO/RTO decisions.

## Implementation tracking — 15 August 2026 (single-VPS pilot architecture selected)

Yazan selected ADR 0008 for the easy Phase 1 pilot: one VPS, one Node process under `systemd`,
localhost PostgreSQL, local uploads, bounded in-memory limiting, nginx, Sentry, and external uptime
monitoring. Managed object storage, Redis, managed PostgreSQL, horizontal scaling, and HA are
deferred to explicit business/capacity triggers. The environment accepts a single failure domain
and maintenance downtime; it must not be represented as highly available.

Minimum VPS security, deployment rollback, migration verification, log/disk/process/database
monitoring, and load evidence remain required. No-backup/manual-only operation is allowed only for
disposable demos. M5 with real restaurant data is blocked until automated encrypted off-VPS
database/upload backup and a restore rehearsal pass. Proposed minimum recovery targets are daily
backup, seven-day retention, RPO 24 hours, and RTO 4 hours, pending explicit acceptance or
replacement.

## Implementation tracking — 15 August 2026 (M3 single-VPS runtime baseline started)

Yazan accepted RPO 24 hours and RTO 4 hours in ADR 0008. The first M3 implementation point covers
the deployable VPS runtime boundary: nginx/TLS/WebSocket proxy configuration, one hardened
unprivileged `systemd` Node service, loopback-only application binding, persistent configurable
uploads outside releases, release-aware health responses, graceful shutdown, and versioned
deploy/rollback operations. Automated configuration tests will accompany it. Encrypted off-VPS
backup/restore and Sentry follow as separate evidence-bearing points.

## Implementation tracking — 15 August 2026 (M3 single-VPS runtime baseline implemented)

The first M3 runtime point is implemented. Production now defaults to loopback, requires a
validated absolute persistent upload directory outside releases, exposes a validated release ID
through health probes, and shuts down HTTP/Socket.IO/Prisma cleanly under SIGTERM. nginx and
systemd templates enforce TLS/WebSocket proxying, least privilege, filesystem sandboxing, restart
and stop deadlines. Versioned deploy/rollback scripts preserve mutable state and health-check every
switch; database migrations remain forward/backward-compatible across the rollback window.

The operations runbook and production environment template are published. Focused tests validate
runtime fail-closed rules, systemd/nginx controls, deployment exclusions/atomic switching, shell
syntax, and production-mode startup/readiness/graceful shutdown against PostgreSQL. ESLint and
TypeScript pass. Full regression evidence is in progress; backup/restore and Sentry remain the next
M3 implementation points.

## Implementation tracking — 15 August 2026 (M3 single-VPS runtime baseline complete)

Final evidence passes 44 backend unit/configuration tests, 26 disposable-PostgreSQL integration
tests, 45 frontend tests, 8 desktop/mobile browser E2E tests, ESLint, TypeScript, Prisma validation,
production build, deployment-script syntax checks, and a production-mode PostgreSQL
startup/readiness/graceful-shutdown smoke. No temporary test databases remain. The existing large
frontend chunk warning is unchanged.

The runtime baseline is locally complete. External evidence still requires installing the supplied
nginx/systemd/configuration on the selected VPS and validating real TLS/firewall/service behavior.
The next M3 implementation point is automated encrypted off-VPS database/upload backup, daily
scheduling, seven-day retention, failure visibility, and a timed isolated restore against RPO 24
hours/RTO 4 hours.

## Outcome and planning rule

Release a secure, observable, recoverable multi-tenant restaurant QR platform without
adding POS, native mobile, payments, or marketplace integrations to Release 1.

This is a **12-week plan**, not a ten-week plan. It moves the pilot to week 11 and launch
to week 12 so that tests, migration rehearsal, and defect closure are real gates rather than
work deferred to the end. Dates may move when a gate fails; the gate does not get waived.

## Immediate decisions — complete before M1 begins

Both owners record these in an ADR or decision log. The items marked blocking prevent the
related work from being correctly implemented.

| Decision | Owner | Required by | Why it matters |
|---|---|---:|---|
| Takeaway ordering entry point **(Yazan selected ADR 0007 A; defaults accepted)** | Both | Closed — Alaa sign-off recorded 14 Aug (ADR 0007) | Takeaway is disabled; dine-in defaults are fixed for implementation. |
| Order-tracking token expiry and recovery | Both | Day 2 | Defines customer behaviour after tracking credentials expire. |
| POS schema disposition: **Park** | Both | Day 3 | Record the recommended non-destructive disposition and controls for dormant tables. |
| Log retention, contents, and access control | Both | Day 3 | Required before structured production logs contain user/organization IDs. |
| 12-week schedule and pilot/launch dates | Both | Day 1 | Establishes the release commitment and scope-control baseline. |
| Phase 1 infrastructure: **single VPS/local storage/local PostgreSQL/in-memory limiter/nginx/systemd/Sentry/uptime selected in ADR 0008** | Yazan | Selected 15 Aug | Fixes the pilot deployment topology; managed providers defer to growth triggers. |
| Browser session strategy and threat model — SuperAdmin uses ADR 0009 HttpOnly SameSite cookie; restaurant compatibility bearer remains separately bounded | Both | Platform complete 15 Aug | Removes JavaScript access to the platform credential; restaurant-session review remains separate. |
| PostgreSQL RLS adoption or compensating controls **(Yazan selected ADR 0006 B)** | Both | Sign-off closed — Alaa recorded 14 Aug (ADR 0006); zero-issue staging report remains | Release 1 uses constraints/controls; RLS follows safe runtime-role work. |
| Backup/RPO/RTO: encrypted restic off-VPS; **RPO 24h/RTO 4h accepted** | Yazan | ADR 0010/local automation 15 Aug | Selected remote repository and real timed restore evidence remain before M5. |
| Restaurant ordering pause and capacity behaviour | Both | Day 5 | Defines safe operation during overload or kitchen closure. |
| SuperAdmin MFA/re-authentication and session duration — ADR 0009 implemented locally | Yazan, reviewed with Alaa client boundary | Complete locally 15 Aug | Mandatory TOTP, 30-minute revocable HttpOnly session, and 10-minute recent-auth write gate; staging/TLS evidence remains. |

## M0 baseline record — updated 14 August 2026

| Check | Result | Evidence / follow-up |
|---|---|---|
| Existing/backend foundation suite | Pass | `npm run test:unit`: 21 tests passed, including HTTP harness, limiter, errors, token/session/access controls, catalog ownership, and staging-report fail-closed evaluation. |
| Database integration/rehearsal suite | Pass | `npm run test:integration`: 10 tests passed, including authentication/tenant characterization, takeaway no-mutation rejection, staging-command verification, expand/backfill rehearsal, 7-root clean/corrupt verification, cross-tenant negatives, rerun, and ambiguity rejection. |
| Frontend component/API suite | Pass | `npm run test:frontend`: 5 tests passed. |
| ESLint | Pass | `npm run lint` passed after `npm ci`. |
| Typecheck | Pass | `npm run typecheck` passed after Prisma Client generation. |
| Production build | Pass | `npm run build` passed; existing large-chunk warning remains for follow-up performance work. |
| Prisma validation | Pass | `npx prisma validate --schema server/prisma/schema.prisma` passed. |
| E2E smoke | Pass | `npm run test:e2e`: desktop and mobile SuperAdmin login accessibility smoke passed 2/2. |
| Dependency audit | Pass with follow-up | `npm audit --omit=dev --audit-level=moderate` found 0 production vulnerabilities. The full install audit reported 5 transitive/dev findings; no breaking `audit fix --force` was applied. |

**M0 immediate action:** complete. The dependency reinstall and baseline commands were run on
14 August 2026. Align local development to Node 20–22 before release work; CI already pins
Node 22. The remaining M0 action is staging/CI execution evidence; the disposable
PostgreSQL/fixture/authentication harness and production-shaped migration rehearsal are complete.

## Milestone plan

| Milestone | Timing | Primary outcome | Owner split | Exit gate |
|---|---:|---|---|---|
| M0 — Decisions and test foundation | Week 1 — In progress | Decisions, CI, HTTP harness, disposable PostgreSQL test DB, fixtures, authentication characterization, and migration rehearsal are recorded; staging baseline remains. | Yazan: CI/HTTP/database/contract/session/error foundation and rehearsal complete; staging evidence next. Alaa: golden E2E smoke exists; remaining browser fixtures/UI inventory parallel. | Build, lint, Prisma validation, unit/frontend/integration tests, and local E2E smoke pass. CI/staging evidence remains. |
| M1 — Tenant and safety baseline | Weeks 2–3 — Foundation implemented | Request context, safe errors, limiter, token foundation, expand/backfill/local verification, and auth/tenant access extraction are implemented; enforcement remains. | Yazan: local M1 implementation complete except blocked enforcement/staging evidence. Alaa: typed error/session UX can consume the published baseline. | Unit/characterization/tenant verification pass; staging zero-issue report and RLS/control decision are required before enforcement. |
| M2 — Trustworthy customer order cycle | Weeks 4–5 | Public ordering is capability-scoped and abuse-resistant; duplicate/retry/reconnect behaviour is correct. | Yazan: high-entropy table capability, ordering controls/idempotency, socket/order security. Alaa: retry-safe checkout, recovery states, EN/AR/mobile UX. | Replay creates one order; capability cannot cross tenant/table; authoritative state survives refresh, mobile resume, reconnect, and server restart. |
| M3 — Phase 1 pilot infrastructure | Weeks 6–8 | Hardened single VPS, nginx/TLS, one systemd Node process, localhost PostgreSQL, protected local uploads, bounded local limiter, Sentry/uptime, rollback and backup/restore operations. | Yazan: VPS/deployment/database/security/monitoring/recovery. Alaa: frontend telemetry, resilient upload/pagination, performance/accessibility fixes. | Hardening checks, secure local-upload tests, synthetic alert, measured capacity, clean rebuild, and automated off-VPS restore within approved RPO/RTO. |
| M4 — Quality hardening | Weeks 9–10 | Full regression, migration rehearsal, performance/security checks, and P0/P1 closure. | Yazan: API/integration/security/performance. Alaa: E2E/browser/device/accessibility and UX defects. | No P0/P1; migration rehearsal succeeds; SLO evidence is measured and accepted. |
| M5 — Controlled pilot | Week 11 | One to three restaurants operate under monitored support. | Both. | Seven stable days; support, rollback, and incident runbooks proven. |
| M6 — Production launch | Week 12 | Approved production release with staffed monitoring and rollback window. | Both. | Written Go decision, healthy metrics, backup confirmation, and rollback window closed. |

## Non-negotiable work items

### M0: establish the evidence system

- Add a disposable PostgreSQL test database and deterministic fixtures/seeding.
- Add an HTTP-level harness for Express routes and an E2E runner for the golden customer
  journey. Do not defer either to M4.
- Make CI run install, Prisma validate/generate, migration test, lint, production build,
  unit tests, affected integration tests, and E2E smoke.
- Publish API contracts for organization switching, members, errors, table session, and
  order idempotency before their implementation begins.
- Record ADRs for tenant enforcement, POS Park, token/session classes, public-order
  capabilities, idempotency, RLS/compensating controls, and recovery objectives.

### M1: make unsafe foundations safe

- Start with API characterization tests, then extract only the auth/tenant and order domains
  being changed; each extraction remains behaviour-neutral and reviewable.
- Centralize typed server errors; return stable safe codes and request IDs, while logging
  redacted diagnostic detail rather than arbitrary exception messages.
- Generate/return request IDs and write structured request logs.
- Add expiry cleanup, a hard-cap, and correct proxy/IP configuration to the local limiter;
  replace it with a multi-dimensional shared limiter in M3.
- Add direct tenant ownership and constraints on tenant aggregate roots through expand →
  backfill → verify → enforce → contract. `ModifierGroup` is a tenant-owned root;
  `ModifierOption` and combo children inherit ownership unless an ADR justifies duplication.
- Add `ApiError` with HTTP status, safe code, request ID, and retry metadata, plus typed
  request/response contracts and independent customer/admin error boundaries. Share transport
  mechanics while keeping Restaurant and SuperAdmin session contexts separate. Remove stale
  schema/hook files.

### M2: remove the release-blocking public write

- Use high-entropy, revocable QR capabilities and short-lived table sessions; a predictable
  public lookup plus a JWT is not treated as proof of customer presence. Bind capability and
  session to restaurant/table identity.
- Require the scoped capability/session for dine-in order creation; derive restaurant and
  table identity server-side, never from the request body.
- Implement the approved takeaway approach before enabling takeaway ordering.
- Add client-generated idempotency keys and durable transactional idempotency records. The
  same key/payload returns the committed order; the same key/different payload returns a
  conflict. Promotion usage mutates once only.
- Add limits by IP, capability/session, table, organization, and route; cap open orders,
  provide an ordering-pause/overload control, and emit audit-safe rejection telemetry.
- Version and authorize order/socket events. On refresh, foreground, reconnect, or server
  restart, refetch authoritative order state and retain clear offline/expired/retry states.
- Keep tracking credentials scoped and expiring according to the recorded D1 decision.

### M3/M4: make production supportable and prove it

- For the ADR 0008 Phase 1 pilot, harden local uploads and the bounded in-memory limiter on one VPS;
  defer managed object storage and shared limiting until its growth triggers occur.
- Add Sentry, external uptime monitoring, release IDs, actionable alerts, and retention controls.
- Implement pagination and bounded analytics queries before load testing.
- Define and meet the approved RPO/RTO; automate an encrypted off-VPS database/upload backup and
  rehearse clean-server restore, migration, failed-deploy, socket-reconnect, secret-rotation, and
  rollback paths. Manual-only backup cannot satisfy the real-pilot gate.

## Implementation tracking — 15 August 2026 (secure uploads, revocation, and QR cleanup)

- Uploads now have durable organization/uploader ownership records. Upload validation persists
  only verified image files, and deletion is limited to the uploader or an OWNER/MANAGER in the
  same organization. Cross-tenant filenames fail closed.
- Order-tracking credentials now expire after six hours, carry a persisted `jti`, and are
  rejected after token-row revocation. Admin Socket.IO sessions retain the resolved membership
  identity and are disconnected when that membership changes or is suspended.
- The predictable `GET /api/tables/public/:code` route and unused client wrapper were removed;
  current QR clients use the capability exchange endpoint only.
- Added organization/membership, upload isolation, tracking revocation, and socket-revocation
  integration coverage. Disposable PostgreSQL integration now passes 31 tests.
- Added a fail-closed tenant enforcement migration. It is intentionally not being deployed to
  staging or production from this change: the ADR 0006 zero-issue staging report remains the
  required gate before migration application. The local production-shaped rehearsal now proves
  both corruption blocking and clean application of the final constraints on a disposable
  PostgreSQL database.
- Added a real-backend Playwright golden flow that provisions disposable PostgreSQL, starts the
  actual Express/Socket.IO server, exchanges a real QR capability, creates and tracks an order,
  and proves the old table session is rejected after capability rotation. The browser suite now
  passes 9 tests with the mobile real-backend variant intentionally covered by the existing mocked
  mobile flow. The capability-less `TableManagement` QR image was removed; the table card now
  routes operators to QR Studio for capability-backed generation.

## Implementation tracking — 15 August 2026 (post-merge acceptance and regression)

Reviewed merged `main` at `01b5c45` and accepted Alaa's local M2 handoff. The merged client now
persists checkout idempotency identity across reload/mobile resume, exposes the tenant-scoped
restaurant ordering-state control, routes table operators only to capability-backed QR Studio,
and passes the real backend QR → exchange → order → tracking → rotation-denial journey on desktop
while the merged mocked capability/reload suite covers mobile. The separate single-worker
real-backend golden suite also passes on desktop.

Merged regression passes 44 backend unit/configuration tests, 31 disposable-PostgreSQL integration
tests, 53 frontend tests, 11 standard browser tests with one intentional duplicate-mobile skip,
one separate real-backend golden test, ESLint, TypeScript, Prisma validation, and production build.
This closes the known local Release 1 order/business-logic and previously identified upload/token/
socket/legacy-QR security gaps. M2 is still not production-Done because staging, final device/RTL,
and joint release evidence remain.

The remaining backend boundary is explicit: apply final tenant enforcement only after a zero-issue
staging report, and complete pagination/bounded analytics plus the D1.5 aggregate analytics design.
SuperAdmin MFA/session policy and the organization/member API contract are now complete locally in
ADR 0009 and the published contracts. The next implementation point remains M3 encrypted off-VPS
backup and timed isolated restore for RPO 24 hours/RTO 4 hours.

## Implementation tracking — 15 August 2026 (SuperAdmin policy and member contract started)

Two local security/contract points started before the backup slice. SuperAdmin authentication is
being upgraded from a password-only 24-hour bearer to mandatory password + RFC 6238 TOTP,
encrypted seed storage, hashed one-time recovery codes, database session-version revocation, a
non-refreshable 30-minute session held in an HttpOnly SameSite cookie, and a 10-minute recent-MFA gate
for platform-changing writes. A first-login enrollment flow will bootstrap existing SuperAdmins
without allowing a password-only platform session.

The organization/member API contract is being published against the already tenant-scoped runtime
and PostgreSQL integration harness. It will fix request/response fields, OWNER/MANAGER/STAFF rules,
member limits, last-owner/self-suspension protections, organization switching, error codes, and
HTTP/socket revocation behavior. Both points require focused negative tests and full regression
before their status changes from started.

## Implementation tracking — 15 August 2026 (SuperAdmin and member contract implemented)

ADR 0009 and the SuperAdmin authentication contract are implemented. Password-only login no
longer creates a platform session: it issues a five-minute MFA challenge and first-login TOTP
enrollment. The implementation uses encrypted seeds, replay-resistant RFC 6238 verification,
hashed one-time recovery codes, account-level attempt locking, serializable recovery/enrollment,
30-minute non-refreshable HttpOnly-cookie sessions, database session-version checks,
revoking logout, and a 10-minute recent-MFA requirement for platform-changing writes. Production
now requires a separate 64-hex-character MFA encryption key. The subscription response was also
restricted so it cannot expose the restaurant credential hash.

The organization/member contract is published and linked from the HTTP baseline. Runtime now
rejects empty membership updates, and the PostgreSQL suite proves organization switching, member
list/create/update, manager/owner boundaries, duplicate and plan-safe conflicts, self-suspension
and last-owner protection, cross-tenant non-disclosure, plus immediate HTTP/socket revocation.

Focused verification passes Prisma generation/validation, 52 backend unit/security tests, 54
frontend tests, 32 PostgreSQL integration tests, ESLint, and TypeScript. Full E2E, production build,
and final regression are still running; the milestone register is unchanged until they pass.

## Implementation tracking — 15 August 2026 (SuperAdmin and member-contract final test complete)

The final security review replaced JavaScript SuperAdmin token storage with a 30-minute HttpOnly,
SameSite=Strict platform cookie (`Secure` in production). The shared transport sends cookie
credentials only for the SuperAdmin namespace and never sends the restaurant bearer there.
Concurrent failed-factor counting is atomic, TOTP/recovery replay fails closed, session versions
are checked on every platform request, and logout revokes all outstanding sessions.

Final regression passes 52 backend unit/security/configuration tests, 32 disposable-PostgreSQL
integration tests, 55 frontend tests, 11 standard browser tests with one intentional duplicate
mobile skip, one separate real-backend golden test, ESLint, TypeScript, Prisma validation, and
production build. The organization/member contract and ADR 0009 are accepted locally. Staging
migration, TLS enrollment, and release evidence remain before production-Done.

Deployment must set an independently generated 64-hex-character
`SUPER_ADMIN_MFA_ENCRYPTION_KEY`, apply
`20260815150000_super_admin_mfa_session_policy`, and have every existing SuperAdmin enroll TOTP and
save the one-time recovery codes. The next implementation point is M3 encrypted off-VPS backup and
timed isolated restore for the accepted RPO 24 hours/RTO 4 hours.

## Implementation tracking — 15 August 2026 (M3 backup and restore started)

The M3 recovery point has started with a provider-neutral encrypted `restic` repository, allowing
an S3-compatible or SFTP off-VPS destination without embedding a vendor API in the application.
Each snapshot will stage a PostgreSQL custom-format dump, uploads, and a non-secret integrity
manifest before encrypted transfer. Repository credentials, restic password, environment secrets,
and the SuperAdmin MFA encryption key are explicitly excluded from the payload.

Planned operational controls are a hardened one-shot systemd service and twice-daily timer, overlap locking,
seven daily/four weekly/six monthly retention defaults, repository integrity checks, stale/failure
visibility for external monitoring, and a restore command that refuses the configured production
database/upload targets and requires an empty isolated destination plus explicit confirmation. The
local rehearsal will test the complete command contract and emit elapsed-time evidence against RPO
24 hours/RTO 4 hours; selected remote storage execution remains VPS deployment evidence.

## Implementation tracking — 15 August 2026 (M3 backup and restore implemented)

Implemented provider-neutral encrypted recovery automation. The locked backup command rejects
upload symlinks, stages only a no-owner/no-privilege PostgreSQL custom dump, uploads, and a
versioned checksum manifest, then performs `restic` backup, seven-daily/four-weekly/six-monthly
retention pruning, repository checking, atomic success-state publication, and dead-man start/
success/failure pings. A dedicated repository-init unit, least-privilege backup service, and
persistent 02:00/14:00 UTC timer provide retry margin inside RPO 24 hours. Separate Unix identities
and a shared upload-only group prevent the backup service from reading the application environment;
repository/database passwords use systemd credentials.

The restore command refuses the configured production upload target and matching resolved database
fingerprint, requires explicit isolated confirmation and empty targets, validates payload version,
checksum, and symlink safety, restores without ownership/privilege statements, verifies application
tables, and writes elapsed-time evidence against RTO 4 hours. ADR 0010 and the deployment runbook
cover provider separation/versioning, credentials, initialization, alerting, rehearsal, and growth.
Seven focused recovery tests and four pilot-infrastructure tests pass, including controlled complete
backup/restore orchestration, stale backup detection, destructive-guard rejection, and shell syntax.
Full regression is in progress. The selected remote repository, actual encrypted transfer, and a
timed VPS isolated restore remain M5-gating environment evidence.

## Implementation tracking — 15 August 2026 (M3 backup and restore locally complete)

Final evidence passes 59 backend unit/configuration/security/recovery tests, 32 disposable-
PostgreSQL integration tests, 55 frontend tests, 11 standard browser tests with one intentional
mobile golden skip, and one separate real-backend golden test. ESLint, TypeScript, Prisma
validation, production build, shell syntax, and diff checks pass. The existing large frontend
chunk warning remains. One overloaded four-worker browser attempt timed out without assertion
regressions; the suite shares a mutable real-backend fixture, so its checked-in configuration now
runs one worker and the default command passes all runnable cases deterministically.

ADR 0010 and recovery automation are locally complete. Backup manifests now capture the resolved
source database fingerprint, allowing the destructive restore guard to work even when the live VPS
database is unavailable. M5 remains blocked until the selected off-VPS repository records an actual
encrypted snapshot and an isolated VPS rehearsal proves restored-data age below 24 hours and
end-to-end recovery below four hours. The next local M3 point is Sentry application telemetry plus
external uptime and synthetic alert evidence.

## Implementation tracking — 15 August 2026 (M3 Sentry and uptime started)

The M3 observability slice has started with separate server/browser Sentry projects, validated
release/environment tags, and explicit data-minimization controls. Default PII, request bodies,
authorization/cookie headers, replay, local variables, customer baskets, and notes are excluded;
the final event/breadcrumb scrubbers redact credentials, email addresses, and sensitive URL query
parameters. Request IDs and pseudonymous organization IDs remain the only application correlation
identifiers.

Node telemetry will initialize before Express, capture unhandled and 5xx failures, and flush on
graceful shutdown. React telemetry will cover the existing customer/admin error boundaries and
global failures. Authenticated production builds may upload hidden source maps and remove local map
artifacts after upload. External monitoring targets public HTTPS readiness, while a local
operator-only command checks readiness and emits a tagged synthetic exception without adding a
production HTTP attack surface. Hosted alert receipt, retention/access review, and monitor outage
evidence remain deployment tasks.

## Implementation tracking — 15 August 2026 (M3 Sentry and uptime implemented)

The application-side observability slice is implemented. Sentry loads before the Node API, reports
uncaught/5xx failures once, ignores health-probe failures, and flushes during graceful shutdown.
React initializes before application lazy imports and reports global plus customer/admin render-
boundary failures. Server and browser projects use the same validated immutable release but
separate DSNs. Both disable PII, users, cookies, headers, bodies, query data, database values, local
variables, replay, and default tracing; final scrubbers remove credentials, email, notes, sensitive
keys/query values, and oversized context.

The deployment build can upload hidden source maps using a root-only build token and removes map
artifacts afterward. A host-only command checks HTTPS readiness, PostgreSQL status and release,
then emits a per-release tagged synthetic Sentry issue and flushes locally. No public alert trigger
was introduced. ADR 0011 and the pilot runbook fix the external monitor at a 60-second interval,
10-second timeout, two consecutive failures/two recoveries, and two independently routed alert
destinations; they also define restricted MFA-protected Sentry access, short retention, provider
receipt verification, and a non-disruptive induced 404/recovery rehearsal.

Nine focused backend/infrastructure tests and four frontend telemetry/error-boundary tests pass,
with TypeScript and ESLint clean. Full regression is in progress. Hosted event receipt, actual
Sentry notification, external uptime failure/recovery notification, and access/retention evidence
remain environment-dependent M3/M5 gates and are not claimed by local SDK transport acceptance.

## Implementation tracking — 15 August 2026 (M3 Sentry and uptime locally complete)

Final regression passes 64 backend unit/configuration/security/recovery/telemetry tests, 32
disposable-PostgreSQL integration tests, 57 frontend tests, 11 standard browser tests with one
intentional mobile golden skip, and one separate real-backend golden flow. ESLint, TypeScript,
Prisma validation, production build, script/executable and diff checks, and an instrumented
production-start-path readiness smoke pass. The default deployed build has no source-map files.
The production dependency audit is clean; five existing Vite/Vitest-only development advisories
require a separately tested major toolchain upgrade and do not ship as a public runtime service.

ADR 0011 and application-side observability are locally complete. Environment evidence is still
mandatory: create both Sentry projects, restrict access and retention, upload one release's hidden
maps, correlate the validator event ID, prove two-destination Sentry delivery, and prove external
uptime failure/recovery notifications. The next local M3 implementation is pagination/bounded
analytics plus query-plan/load/capacity evidence. Actual VPS/TLS, off-VPS restore, and hosted
monitor execution remain pilot gates.

## Implementation tracking — 16 August 2026 (M3 pagination and capacity started)

The final local M3 performance slice has started. Current inventory identifies unbounded order
history, raw analytics history, and SuperAdmin restaurant listing as the material growth paths;
catalog, table, and member collections have subscription ceilings. The implementation will apply
tenant-scoped deterministic cursor pagination with hard maximum page sizes, move analytics to
database aggregation over a validated bounded date range, and avoid returning customer notes or
raw baskets for reporting.

Composite indexes will be accepted only with production-shaped PostgreSQL `EXPLAIN (ANALYZE,
BUFFERS, FORMAT JSON)` evidence. A repeatable authenticated HTTP capacity harness will record
latency percentiles, throughput, and error rate and fail when the agreed pilot thresholds are not
met. Local results cannot substitute for the final selected-VPS run through nginx; both evidence
sets will be retained separately.

## Implementation tracking — 16 August 2026 (M3 pagination and capacity implemented)

The bounded-query implementation is complete and final regression has started. The published
[pagination/analytics contract](contracts/pagination-and-analytics.md) defines deterministic opaque
cursor pages, hard endpoint maxima, tenant-session scope, aggregate field semantics, the default
30-day and maximum 90-day UTC window, safe errors, deployment compatibility, and rollback. Orders,
the bounded analytics export, promotions, SuperAdmin restaurants, and the legacy admin route now
return page envelopes. The admin analytics screen consumes server aggregates and both order and
SuperAdmin lists expose bounded continuation UX.

Migration `20260816090000_bounded_pagination_indexes` is additive and provides the reviewed
tenant/date/status/tie-break and restaurant-list indexes. The query-plan verifier requires every
migration index and rejects slow expected paths, missing indexed alternatives, and base-table
sequential scans. The capacity harness enforces explicit p95, p99, error-rate, throughput, timeout,
concurrency, and request-count settings without logging the bearer token.

[Retained local evidence](operations/pagination-capacity-evidence.md) covers 100,002 orders, 10,102
promotions, and 10,002 restaurant rows. All seven EXPLAIN paths were indexed with no base-table
sequential scan; slowest execution was 3.430 ms. The 300-request/concurrency-10 mixed API run
measured p95 81.25 ms, p99 89.49 ms, 343.33 requests/second, and 0% errors, passing the fixed
250 ms/750 ms/5 requests-per-second/1% pilot limits. Because the local host used direct loopback
and Node 24, this does not replace the required production Node 22 public HTTPS/nginx rerun with
VPS resource observation. Full regression is in progress.

## Implementation tracking — 16 August 2026 (M3 pagination and capacity locally complete)

Final regression passes 74 backend unit/configuration/security/performance tests, 35
disposable-PostgreSQL integration and migration tests, 60 frontend tests, and 11 browser tests with
one intentional mobile real-backend golden skip. TypeScript, ESLint, Prisma validation, the
production build, script syntax, diff checks, no-public-source-map inspection, and the production
dependency audit pass; the audit reports zero production vulnerabilities. Request-revision guards
also prevent an older page response from replacing a newer order scope or SuperAdmin search/filter.

The local pagination/bounded-analytics/query-plan/capacity point is complete. Production-Done still
requires migration deployment and the same query/load gates on the selected Node 22 VPS through
public HTTPS/nginx with representative data and retained resource observations. Actual VPS/TLS,
off-VPS restore, hosted Sentry/uptime notification, and provider-policy evidence remain open M3/M5
environment gates and are not implied by these local results.

## Implementation tracking — 16 August 2026 (Alaa: response-body typing, member/role UI, merge verification)

Merged and verified `Yazan-Plan-exe` (SuperAdmin MFA/ADR 0009, off-VPS backup/ADR 0010, Sentry/
ADR 0011, and the pagination/bounded-analytics work above) into `codex/api-response-typing`,
resolving one real conflict: kept the `globalSetup.js`-based Playwright teardown over a reverted
`workers: 1`/old-server-script version, since the latter was the exact pattern already root-caused
and fixed earlier for leaking disposable test databases. The merge itself surfaced one regression —
`GET /api/orders`'s new paginated envelope broke the golden E2E test's direct read of it — fixed and
reverified both ways.

Completed the response-body typing point from A0's typed-API-design row: every
`api.get/post/put/patch/delete/postWithToken/getWithToken/upload` call site in `src/` now has a real
type verified against `server/index.js` and the Prisma schema, replacing the implicit `any` the
client shipped with. Found and fixed three real bugs this had been hiding: a `parseInt()` on an
already-numeric id, a live bug where the Digital Menu admin category filter's
`item.category_id === selectedCategory` was always false (raw number vs. the `<select>`'s always-
string value — proven both ways with a new E2E regression test, `tests/e2e/digital-menu-category-
filter.spec.ts`), and a real-time Socket.IO new-order push that bypassed the numeric price/total
coercion the REST path already had. Also deleted several duplicate, drifted local type definitions
in favor of one real source of truth per endpoint.

Built the member/role management UI (`src/components/team/TeamManagement.tsx`) on Yazan's
organization-membership contract: OWNER gets inline role/status editing, MANAGER can add members
only, STAFF never sees the tab (matches the server's own `GET /api/organization/members` role
gate), and suspending a member goes through a confirm step first. Extended the axe-core
accessibility audit to cover it and every other authenticated admin screen (`tests/e2e/admin-
accessibility.spec.ts`), fixing every genuine violation found along the way.

Corrected two stale decision-table entries in this document and in `Yazan-Parallel-Work-Plan.md`:
both D1 sign-offs (ADR 0006 tenant enforcement, ADR 0007 takeaway/abuse policy) were recorded by
Alaa on 14 Aug in the ADR files themselves but the tracking tables still said "pending."

Full local regression: 74 backend unit/configuration/security/performance tests, 35 disposable-
PostgreSQL integration/migration tests, 77 frontend tests, and the full Playwright suite (both the
default real-backend config and the separate golden config) pass; lint, TypeScript, and the
production build are clean; zero leaked disposable test databases across the whole session.

## Implementation tracking — 16 August 2026 (invite-only provisioning started)

Release 1 restaurant access is now decided as SuperAdmin-controlled and invite-only. The local
implementation has started and will remove public signup, require recent SuperAdmin MFA for
restaurant creation and subscription changes, derive all entitlements from a backend plan catalog,
and create the organization/MAIN branch/OWNER membership/Admin compatibility profile atomically.
The owner receives a hashed-at-rest, single-use, 48-hour activation token and sets their own
password; an invited identity cannot authenticate before activation.

The same point will enforce subscription validity centrally for every restaurant session and align
public ordering with it: only non-expired `ACTIVE` and `TRIAL` access is accepted for the pilot;
`PAST_DUE`, `CANCELLED`, expired, suspended, and pre-activation access fail closed. Platform
provisioning and subscription mutations will be auditable, hard deletion will not be part of the
operator workflow, and concurrent activation/invitation attempts will be tested. This entry records
work started, not completion or deployment evidence.

### Implementation point update

The migration, backend policy, SuperAdmin provisioning/invitation UI, owner activation UI, audit
trail, socket revocation, and removal of public signup/hard delete are implemented locally. The
published [provisioning contract](contracts/super-admin-restaurant-provisioning.md) fixes endpoint,
secret-handling, lifecycle, entitlement, migration, and rollback behavior. Date-aware subscription
checks now cover restaurant REST/realtime and public ordering/catalog/tracking boundaries.

This point is **locally complete on 16 August 2026**. PostgreSQL evidence covers public-signup
denial, recent-MFA provisioning, stale-MFA rejection, server-owned limits, hash-only token storage,
inactive pre-activation login, expiry, rotation/revocation, concurrent single-use activation,
cancellation revocation, public denial, and platform audit records. Final regression passes 79
backend unit/security/operations tests, 35 disposable-PostgreSQL integration/migration/capacity
tests, 80 frontend tests, and 39 desktop/mobile browser tests with one intentional mobile
real-backend golden skip. Prisma validation, TypeScript, ESLint, diff checks, the production build,
and production dependency audit pass with zero production vulnerabilities.

Production-Done remains deployment-gated: apply migration
`20260816130000_super_admin_restaurant_invitations` before the new application, enroll/verify the
pilot SuperAdmin over TLS, perform one real invitation handoff without logging the link, and retain
staging audit/session/public-denial evidence. No production database was changed by this local work.

## Required test evidence

| Layer | Minimum evidence | Required at |
|---|---|---|
| Unit | Limiter expiry/cap/reset/`Retry-After`, redaction, typed errors, tenant/session claims, totals, roles, transitions, and idempotency decisions. | Every affected PR |
| API integration | Auth, tenant read/write/link/delete isolation, capability enforcement, idempotency, abuse controls, catalog, promotions, uploads, and sockets. | Every backend PR |
| Migration | Fresh database, production-like backfill, rerun safety, verification counts, tenant constraints, and query scoping. | Every migration PR |
| Component | Typed API errors, customer/admin error boundaries, loading, empty, 401/403, offline/retry/reconnect, and RTL. | Every frontend PR |
| E2E | Signup → menu → QR/capability → customer order → tracking/status; role matrix; cross-tenant denial; duplicate submit and mobile recovery. | M0 smoke; full suite by M2/M4 |
| Security/performance/recovery | IDOR/auth-bypass/capability/replay/rate-limit tests; latency/load report; restore, secret-rotation, and rollback rehearsal. | M3/M4 gates |

## Definition of done

A work item becomes **Done** only when its implementation is reviewed, deployed to staging,
has its applicable test evidence passing, has documented migration/rollback impact, and is
recorded in the completion register. “Code is written” is not a completion state.

| Item | Status | PR / commit | Tests/evidence | Verified by | Date |
|---|---|---|---|---|---|
| D1 decisions | Approved | ADRs 0006–0007 selected by Yazan | Tenant B, takeaway A, and dine-in defaults recorded; Alaa sign-off recorded 14 Aug in both ADRs | Yazan + Alaa | 14 Aug 2026 |
| M0 test foundation | In progress | — | Foundation/HTTP/CI/integration/rehearsal checks pass; disposable PostgreSQL database, fixtures, auth characterization, and production-shaped migration rehearsal complete. Staging evidence remains. | — | 14 Aug 2026 |
| M1 safety baseline | Local implementation complete; final enforcement staging-gated | ADR 0009 | Request context, safe errors, limiter, token/session revocation, SuperAdmin MFA/HttpOnly session, organization/member contract, expand/backfill, upload ownership, cross-tenant negatives, and clean/corrupt final-enforcement rehearsal pass; staging zero-issue verify/enforce and TLS enrollment remain. | Yazan | 15 Aug 2026 |
| M2 bounded order cycle | Local joint implementation accepted; staging/release evidence remains | `01b5c45` | QR/session, durable and reload-safe idempotency, capacity, admin availability control, telemetry, atomic transitions, six-hour tracking/revocation, authorized/versioned realtime, secure QR routing, real-backend desktop golden E2E, and mocked mobile recovery pass. | Yazan + Alaa | 15 Aug 2026 |
| M3 Phase 1 pilot infrastructure | In progress — runtime, security, recovery, observability, and bounded-performance automation locally complete | ADRs 0008–0011; pagination/analytics contract | Final local regression: 74 unit/config/security/performance, 35 PostgreSQL integration/migration, 60 frontend, and 11 browser passes with one intentional mobile golden skip; lint, TypeScript, Prisma, build, no-public-map, production dependency audit, seven indexed EXPLAIN paths, and a 300-request capacity gate pass. Hosted backup/restore, Sentry/uptime notifications, real VPS/TLS, and Node 22/nginx capacity rerun remain. | Yazan | 16 Aug 2026 |
| M4 quality hardening | Not started | — | — | — | — |
| M5 pilot | Not started | — | — | — | — |
| M6 launch | Not started | — | — | — | — |

## Weekly operating rhythm

- Monday: agree tickets, owners, acceptance criteria, blockers, and changes to the risk log.
- Daily: post done / next / blocked, escalating an unreviewed security or migration blocker.
- Wednesday: contract and staging integration checkpoint.
- Friday: demo, regression results, metrics, risk update, and completion-register update.
- Before any release: both owners review Go/No-Go evidence and name the rollback owner.
