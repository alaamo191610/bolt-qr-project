# Production Execution Plan

**Date:** 13 August 2026  
**Source documents:** `Yazan-Alaa-Production-Delivery-Plan.docx` v1.0 and
`Gap-Analysis-and-Plan-Corrections.md`  
**Status:** Execution-ready; requires Yazan + Alaa sign-off before milestones begin.

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
| POS schema disposition: park or drop | Both | Day 3 | Resolves conflict between Release 1 scope and live dormant tables. |
| Log retention, contents, and access control | Both | Day 3 | Required before structured production logs contain user/organization IDs. |
| 12-week schedule and pilot/launch dates | Both | Day 1 | Establishes the release commitment and scope-control baseline. |
| Production providers: storage, error tracking, mail, shared rate limit | Both | Day 5 | Required for M3 implementation and environment work. |

## Milestone plan

| Milestone | Timing | Primary outcome | Owner split | Exit gate |
|---|---:|---|---|---|
| M0 — Decisions and test foundation | Week 1 | Decisions recorded; CI, isolated test DB, fixtures, HTTP harness, E2E skeleton, and staging baseline exist. | Yazan: CI/test DB/contract. Alaa: golden E2E skeleton and UI-state inventory. | Build, lint, Prisma validation, unit tests, one HTTP integration test, and one E2E smoke run in CI/staging. |
| M1 — Tenant and safety baseline | Weeks 2–3 | Tenant phase-2 expansion includes modifiers/combos; observability/error fundamentals are live; frontend has safe error handling. | Yazan: mechanical route extraction, request IDs/logging, safe errors/redaction, limiter eviction, migration. Alaa: `ApiError`, error boundaries, stale cleanup. | Two users share one tenant; cross-tenant modifier/combo read/write tests fail closed; safe error and correlation-ID tests pass. |
| M2 — Bounded customer order cycle | Weeks 4–5 | Customer order creation is authenticated/scoped, idempotent, and fully covered by the golden journey. | Yazan: table-session token, order idempotency, socket/order security. Alaa: customer order, tracking expiry state, EN/AR/mobile UX. | No valid session token means no order; token cannot cross restaurant/table boundary; golden journey passes on mobile and desktop. |
| M3 — Production infrastructure | Weeks 6–7 | Durable uploads, shared rate limiting, hosted monitoring, alerts, backups, and production/staging separation. | Yazan: storage, shared limiter, monitoring, restore. Alaa: frontend telemetry, performance/accessibility fixes. | Secure upload tests, alert from synthetic failure, timed restore rehearsal, stable staging. |
| M4 — Quality hardening | Weeks 8–10 | Full regression, migration rehearsal, performance/security checks, and P0/P1 closure. | Yazan: API/integration/security/performance. Alaa: E2E/browser/device/accessibility and UX defects. | No P0/P1; migration rehearsal succeeds; SLO evidence is measured and accepted. |
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

### M1: make unsafe foundations safe

- Extract routes mechanically from `server/index.js` before substantive P0 changes.
- Centralize error handling; return safe client errors and log redacted diagnostic detail.
- Generate/return request IDs and write structured request logs.
- Evict expired in-memory rate-limit buckets immediately; replace the limiter with a shared
  store in M3.
- Add direct tenant ownership to modifier/combo data through expand → backfill → verify →
  enforce → contract. Scope every relevant read and write by tenant.
- Add `ApiError` with HTTP status and request ID, plus independent customer and admin error
  boundaries. Remove stale schema/hook files.

### M2: remove the release-blocking public write

- Issue a short-lived signed table-session token when a QR table is resolved. Bind it to
  restaurant and table IDs.
- Require that token for dine-in order creation; derive restaurant identity from its claims,
  never from the request body.
- Implement the approved takeaway approach before enabling takeaway ordering.
- Add idempotency to order submission and other sensitive public writes.
- Keep tracking credentials scoped and expiring according to the recorded D1 decision.

### M3/M4: make production supportable and prove it

- Move uploads to managed object storage with signed rules and ownership-safe deletion.
- Add a shared production rate-limit store, hosted errors, dashboards, alert rules, and
  retention controls.
- Implement pagination and bounded analytics queries before load testing.
- Rehearse restore, migration, failed-deploy, socket-reconnect, and rollback paths.

## Required test evidence

| Layer | Minimum evidence | Required at |
|---|---|---|
| Unit | Rate-limit eviction, redaction, error normalization, tenant/session claims, totals, roles, and transitions. | Every affected PR |
| API integration | Auth, tenant isolation, public-order token enforcement, idempotency, catalog, promotions, uploads, and sockets. | Every backend PR |
| Migration | Fresh database, production-like backfill, rerun safety, verification counts, and query scoping. | Every migration PR |
| Component | API error states, customer/admin error boundaries, loading, empty, 401/403, RTL. | Every frontend PR |
| E2E | Signup → menu → QR/table → customer order → tracking/status; role matrix; cross-tenant denial. | M0 smoke; full suite by M2/M4 |
| Security/performance/recovery | IDOR/auth-bypass/rate-limit tests; latency/load report; restore and rollback rehearsal. | M3/M4 gates |

## Definition of done

A work item becomes **Done** only when its implementation is reviewed, deployed to staging,
has its applicable test evidence passing, has documented migration/rollback impact, and is
recorded in the completion register. “Code is written” is not a completion state.

| Item | Status | PR / commit | Tests/evidence | Verified by | Date |
|---|---|---|---|---|---|
| D1 decisions | Blocked | — | Signed decisions | — | — |
| M0 test foundation | Not started | — | — | — | — |
| M1 safety baseline | Not started | — | — | — | — |
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
