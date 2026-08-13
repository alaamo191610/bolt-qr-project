# Production Execution Plan

**Date:** 13 August 2026  
**Source documents:** `Yazan-Alaa-Production-Delivery-Plan.docx` v1.0,
`Gap-Analysis-and-Plan-Corrections.md`, and
`Senior-Architecture-Review-and-Revised-Plan.md`
**Status:** M0 in progress; requires Yazan + Alaa sign-off before milestones begin.

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

## M0 baseline record — 13 August 2026 (updated 13 August 2026, post-frontend-harness)

| Check | Result | Evidence / follow-up |
|---|---|---|
| Existing unit suite (backend) | Pass | `npm test` (`node --test tests/*.test.js`): 5 assertions across 2 files (`tenantAccess.test.js`, `orderTransitions.test.js`). Still pure unit coverage only — zero HTTP integration, migration, or database tests. |
| Frontend unit/component suite | Pass (new) | `npm run test:frontend` (Vitest + jsdom + Testing Library): 5 assertions across 2 files (`api.test.ts` for the `ApiError` contract, `ErrorBoundary.test.tsx`). |
| E2E smoke | Pass (new) | `npm run test:e2e` (Playwright + `@axe-core/playwright`): 1 smoke spec (SuperAdmin login, desktop + mobile-chrome projects), including a zero-violations accessibility assertion. |
| TypeScript | Pass | `npm run typecheck` (`tsc -b`) is clean. |
| ESLint | Pass | `npm run lint` is clean. No longer blocked; the earlier "cannot find eslint" report was a broken local install, not a repo defect. |
| Production build | Pass | `npm run build` succeeds (Vite). No longer blocked; the earlier `qr-code-styling` resolution failure was the same broken local install. |
| Prisma validation | Pass | `npx prisma validate --schema server/prisma/schema.prisma`: schema is valid. |

**Still zero at M0, unchanged from the original baseline:** HTTP/API integration tests,
migration tests, and any test evidence for tenant isolation, capability enforcement, or
idempotency. The E2E suite above is one smoke spec, not the golden customer-order journey
required by the M0 exit gate — that remains open (see Alaa-Parallel-Work-Plan.md A0/A1).

**Resolved this pass:** the frontend/E2E test harness now exists (Vitest, Playwright,
Testing Library, MSW, axe), the typed `ApiError`/error-boundary work from A1 landed early,
and stale schema/hook files (E1) are deleted. See
`docs/Gap-Analysis-and-Plan-Corrections.md` Part 6 completion register for item-level status.

## Milestone plan

| Milestone | Timing | Primary outcome | Owner split | Exit gate |
|---|---:|---|---|---|
| M0 — Decisions and test foundation | Week 1 | Decisions recorded; CI, isolated test DB, fixtures, HTTP harness, E2E skeleton, and staging baseline exist. | Yazan: CI/test DB/contract and session/error design. Alaa: golden E2E skeleton, stale cleanup, and UI-state inventory. | Build, lint, Prisma validation, unit tests, initial HTTP authentication characterization test, and E2E smoke run in CI/staging. |
| M1 — Tenant and safety baseline | Weeks 2–3 | Aggregate-root tenant ownership, database constraints, observability/error fundamentals, and safe frontend error/session handling are live. | Yazan: request context/error/logging, bounded limiter, incremental auth/tenant extraction, migration. Alaa: typed API contracts, `ApiError`, error boundaries, session UX. | Cross-tenant read/write/link/delete tests fail closed; migration rehearsal succeeds; safe error and correlation-ID tests pass. |
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
| M0 test foundation | In progress | `codex/tenant-transition` @ `cd03ed9`, `codex/api-response-typing` @ `de31099` | Backend: 5 unit assertions (`npm test`). Frontend: 5 unit/component assertions (`npm run test:frontend`). E2E: 1 smoke spec, 2 projects (`npm run test:e2e`). Typecheck/lint/build/Prisma-validate all pass. Still missing: HTTP integration harness, migration tests, golden E2E journey. | Claude (frontend), pending Yazan review | 13 Aug 2026 |
| M1 safety baseline | In progress (frontend half only) | `codex/tenant-transition` @ `cd03ed9` | Typed `ApiError` (status/code/requestId/retryAfter) + separate customer/admin error boundaries, unit-tested. Backend half (route extraction, centralized error handler, request IDs, rate-limiter eviction, tenant columns) not started — see Gap-Analysis-and-Plan-Corrections.md Part 6. | Claude (frontend), pending Yazan | 13 Aug 2026 |
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
