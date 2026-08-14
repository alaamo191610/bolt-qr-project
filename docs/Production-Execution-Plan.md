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
| Takeaway ordering entry point **(blocking)** | Both | Day 2 | Determines how public order creation is authenticated/bounded. |
| Order-tracking token expiry and recovery | Both | Day 2 | Defines customer behaviour after tracking credentials expire. |
| POS schema disposition: **Park** | Both | Day 3 | Record the recommended non-destructive disposition and controls for dormant tables. |
| Log retention, contents, and access control | Both | Day 3 | Required before structured production logs contain user/organization IDs. |
| 12-week schedule and pilot/launch dates | Both | Day 1 | Establishes the release commitment and scope-control baseline. |
| Production providers: storage, error tracking, mail, shared rate limit | Both | Day 5 | Required for M3 implementation and environment work. |
| Browser session-storage strategy and threat model | Both | Day 3 | Sets the security controls for restaurant and SuperAdmin sessions. |
| PostgreSQL RLS adoption or compensating controls | Both | Day 5 | Determines the database layer of tenant isolation. |
| RPO/RTO and infrastructure budget | Both | Day 5 | Makes backup, restore, and pilot gates measurable. |
| Restaurant ordering pause and capacity behaviour | Both | Day 5 | Defines safe operation during overload or kitchen closure. |
| SuperAdmin MFA/re-authentication and session duration | Both | Day 5 | Sets the platform-admin security bar before external production use. |

## M0 baseline record — updated 14 August 2026

| Check | Result | Evidence / follow-up |
|---|---|---|
| Existing/backend foundation suite | Pass | `npm run test:unit`: 12 tests passed, including HTTP harness, limiter, error redaction, and token-class negative tests. |
| Database integration suite | Pass | `npm run test:integration`: 2 tenant/authentication characterization tests passed against a disposable PostgreSQL database; cleanup removed the database. |
| Frontend component/API suite | Pass | `npm run test:frontend`: 5 tests passed. |
| ESLint | Pass | `npm run lint` passed after `npm ci`. |
| Typecheck | Pass | `npm run typecheck` passed after Prisma Client generation. |
| Production build | Pass | `npm run build` passed; existing large-chunk warning remains for follow-up performance work. |
| Prisma validation | Pass | `npx prisma validate --schema server/prisma/schema.prisma` passed. |
| E2E smoke | Pass | `npm run test:e2e`: desktop and mobile SuperAdmin login accessibility smoke passed 2/2. |
| Dependency audit | Pass with follow-up | `npm audit --omit=dev --audit-level=moderate` found 0 production vulnerabilities. The full install audit reported 5 transitive/dev findings; no breaking `audit fix --force` was applied. |

**M0 immediate action:** complete. The dependency reinstall and baseline commands were run on
14 August 2026. Align local development to Node 20–22 before release work; CI already pins
Node 22. The remaining M0 actions are production-shaped migration rehearsal and staging/CI
execution evidence; the disposable PostgreSQL/fixture/authentication harness is complete.

## Milestone plan

| Milestone | Timing | Primary outcome | Owner split | Exit gate |
|---|---:|---|---|---|
| M0 — Decisions and test foundation | Week 1 — In progress | Decisions, CI, HTTP harness, disposable PostgreSQL test DB, fixtures, and authentication characterization are recorded; migration rehearsal and staging baseline remain. | Yazan: CI/HTTP/database/contract and session/error foundation complete; migration rehearsal next. Alaa: golden E2E smoke exists; remaining browser fixtures/UI inventory parallel. | Build, lint, Prisma validation, unit/frontend/integration tests, and local E2E smoke pass. Migration rehearsal and CI/staging evidence remain. |
| M1 — Tenant and safety baseline | Weeks 2–3 — Foundation started | Request context, safe error contract, bounded local limiter, and token-class foundation are live; aggregate-root tenant ownership, constraints, extraction, and migration remain. | Yazan: request/error/limiter/token foundation complete; tenant harness and migration next. Alaa: typed error/session UX can consume the published baseline. | Safe error/correlation/token tests pass; cross-tenant isolation and migration rehearsal remain required. |
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
| D1 decisions | Blocked | — | Signed decisions | — | — |
| M0 test foundation | In progress | — | Foundation/HTTP/CI/integration checks pass; disposable PostgreSQL database, fixtures, and auth characterization complete. Migration rehearsal and staging evidence remain. | — | 14 Aug 2026 |
| M1 safety baseline | Foundation started | — | Request context, safe errors, local limiter, token classes, and negative tests pass; tenant migration remains. | — | 14 Aug 2026 |
| M2 bounded order cycle | Blocked by D1 takeaway decision | — | — | — | — |
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
