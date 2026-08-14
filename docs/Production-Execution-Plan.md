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
| Takeaway ordering entry point **(Yazan selected ADR 0007 A; defaults accepted)** | Both | Alaa sign-off pending | Takeaway is disabled; dine-in defaults are fixed for implementation. |
| Order-tracking token expiry and recovery | Both | Day 2 | Defines customer behaviour after tracking credentials expire. |
| POS schema disposition: **Park** | Both | Day 3 | Record the recommended non-destructive disposition and controls for dormant tables. |
| Log retention, contents, and access control | Both | Day 3 | Required before structured production logs contain user/organization IDs. |
| 12-week schedule and pilot/launch dates | Both | Day 1 | Establishes the release commitment and scope-control baseline. |
| Production providers: storage, error tracking, mail, shared rate limit | Both | Day 5 | Required for M3 implementation and environment work. |
| Browser session-storage strategy and threat model | Both | Day 3 | Sets the security controls for restaurant and SuperAdmin sessions. |
| PostgreSQL RLS adoption or compensating controls **(Yazan selected ADR 0006 B)** | Both | Alaa/staging sign-off pending | Release 1 uses constraints/controls; RLS follows safe runtime-role work. |
| RPO/RTO and infrastructure budget | Both | Day 5 | Makes backup, restore, and pilot gates measurable. |
| Restaurant ordering pause and capacity behaviour | Both | Day 5 | Defines safe operation during overload or kitchen closure. |
| SuperAdmin MFA/re-authentication and session duration | Both | Day 5 | Sets the platform-admin security bar before external production use. |

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
| M3 — Production infrastructure | Weeks 6–8 | Durable uploads, shared rate limiting, hosted monitoring, alerts, backups, data lifecycle, and production/staging separation. | Yazan: storage, shared limiter, monitoring, RPO/RTO restore, retention/runbooks. Alaa: frontend telemetry, resilient uploads/pagination, performance/accessibility fixes. | Secure upload tests, alert from synthetic failure, restore meets approved RPO/RTO, stable isolated staging. |
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

- Move uploads to managed object storage with signed rules and ownership-safe deletion.
- Add a shared production rate-limit store, hosted errors, dashboards, alert rules, and
  retention controls.
- Implement pagination and bounded analytics queries before load testing.
- Define and meet the approved RPO/RTO; rehearse restore, migration, failed-deploy,
  socket-reconnect, secret-rotation, and rollback paths.

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
| D1 decisions | Partially approved | ADRs 0006–0007 selected by Yazan | Tenant B, takeaway A, and dine-in defaults recorded; Alaa sign-off remains | Yazan | 14 Aug 2026 |
| M0 test foundation | In progress | — | Foundation/HTTP/CI/integration/rehearsal checks pass; disposable PostgreSQL database, fixtures, auth characterization, and production-shaped migration rehearsal complete. Staging evidence remains. | — | 14 Aug 2026 |
| M1 safety baseline | Foundation implemented | — | Request context, safe errors, limiter, tokens, expand/backfill, compatibility writes, 7-root local verification, auth/tenant extraction, and cross-tenant negatives pass; staging verify/enforce remain. | — | 14 Aug 2026 |
| M2 bounded order cycle | Backend capability implemented; frontend handoff rejected | — | Backend capability controls pass. Main `4701771` lacks capability QR/exchange/bearer/recovery/E2E, so checkout returns `TABLE_SESSION_REQUIRED`; idempotency/capacity/pause/shared limiting also remain. | Yazan review; Alaa action | 14 Aug 2026 |
| M3 production infrastructure | Not started | — | — | — | — |
| M4 quality hardening | Not started | — | — | — | — |
| M5 pilot | Not started | — | — | — | — |
| M6 launch | Not started | — | — | — | — |

## Weekly operating rhythm

- Monday: agree tickets, owners, acceptance criteria, blockers, and changes to the risk log.
- Daily: post done / next / blocked, escalating an unreviewed security or migration blocker.
- Wednesday: contract and staging integration checkpoint.
- Friday: demo, regression results, metrics, risk update, and completion-register update.
- Before any release: both owners review Go/No-Go evidence and name the rollback owner.
