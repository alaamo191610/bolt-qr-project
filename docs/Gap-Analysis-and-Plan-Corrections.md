# Gap Analysis and Plan Corrections

**Companion document to:** `Yazan-Alaa-Production-Delivery-Plan.docx` v1.0
**Baseline audited:** `codex/tenant-transition` @ `ac663f2`
**Date:** 13 August 2026
**Status:** Execution-ready. Requires Yazan + Alaa sign-off before it changes any milestone.

---

## Purpose of this document

The delivery plan is sound. Its ownership model, acceptance gates, migration policy
(expand → backfill → verify → enforce → contract), and release boundary are all correct and
worth keeping as written. This document does not replace it.

What this document does is reconcile the plan against the code that actually exists on
`codex/tenant-transition`. That reconciliation found three classes of problem:

1. **Factual errors** — the plan describes the codebase inaccurately in four places. Two
   overstate remaining work, two understate it. Milestones are sized against these
   descriptions, so the errors propagate into the schedule.
2. **Missing work** — defects and gaps that exist in the code and are not on any milestone.
   Several of them violate rules the plan itself sets.
3. **Sequencing problems** — work that is correctly identified but scheduled at a point
   where it costs more than it should.

**No new product features are proposed here.** Every item is either a correction to the
plan's picture of reality, a defect fix, or a resequencing. Where an item is genuinely
optional, it is marked as such.

---

## Summary of findings

| # | Finding | Type | Severity | Section |
|---|---|---|---|---|
| E1 | Frontend API boundary already exists | Factual error (overstates work) | Low | [E1](#e1) |
| E2 | `Admin.password` auth already removed | Factual error (overstates risk) | Low | [E2](#e2) |
| E3 | Test baseline is 2 unit tests, not 5 | Factual error (understates work) | **High** | [E3](#e3) |
| E4 | POS schema still present and undeclared | Factual error (understates work) | Medium | [E4](#e4) |
| G1 | Public order creation is unauthenticated and unbounded | Missing work | **P0** | [G1](#g1) |
| G2 | Rate limiter never evicts entries (memory leak) | Missing work | **P0** | [G2](#g2) |
| G3 | Modifier/combo tables have no tenant column | Missing work | P1 | [G3](#g3) |
| G4 | 40 endpoints return raw exception text | Missing work | P1 | [G4](#g4) |
| G5 | No request correlation ID | Missing work | P1 | [G5](#g5) |
| G6 | No frontend error boundary | Missing work | P1 | [G6](#g6) |
| G7 | API client discards HTTP status codes | Missing work | P1 | [G7](#g7) |
| G8 | No log redaction helper | Missing work | P2 | [G8](#g8) |
| G9 | Two parallel SuperAdmin auth paths | Missing work | P2 | [G9](#g9) |
| G10 | No pagination on any list endpoint | Missing work | P2 | [G10](#g10) |
| G11 | `ApiError` shipped but unconsumed: false logout on network/5xx errors | Missing work — found and fixed during A0 journey inventory | P1 | [Part 6](#part-6--execution-runbook-and-completion-evidence) |
| S1 | Backend modularization scheduled after the P0 edits | Sequencing | High | [S1](#s1) |
| S2 | Observability scheduled at M3, after the risky work | Sequencing | High | [S2](#s2) |
| S3 | Ten-week estimate is not defensible for M3+M4 | Sequencing | Medium | [S3](#s3) |
| D1 | Missing decisions in the §15 pre-M1 list | Gap in plan | Medium | [D1](#d1) |

---

## Part 1 — Factual errors in the plan

### <a name="e1"></a>E1. The typed frontend API boundary already exists

**Plan says** (§4, "Architecture work Alaa must complete"):
> Create a typed frontend API boundary and eliminate duplicate/stale schema files and
> unused authentication hooks.

**Code says:** `src/services/api.ts` is already a single centralized client — one `API_URL`
resolution, centralized token injection via `getHeaders()`, and a shared `handleResponse`.
There are only **2 raw `fetch()` call sites** in all of `src/` outside the service layer.

The cleanup half of the item is real but trivial:

- `src/services/schema.prisma.bak` — 0 bytes, delete
- `src/services/schema.sql` — stale duplicate of the Prisma schema, delete
- `src/hooks/useAuthhhhh.tsx` — entirely commented out, delete

**Why this matters:** this is listed as architecture work in Alaa's M1. It is a
ten-minute deletion plus one real improvement ([G7](#g7), preserving status codes).
Alaa's M1 has more slack than the plan shows, which matters because [E3](#e3) means
Alaa's M4 has considerably less.

**Correction:** reword to *"Delete stale schema/hook files; extend the existing API client
to preserve HTTP status codes and request IDs."* Move the freed capacity toward the E2E
suite.

---

### <a name="e2"></a>E2. Authentication against `Admin.password` is already gone

**Plan says** (§4):
> Make Admin a restaurant profile rather than an identity. Stop authenticating against
> Admin.password after the compatibility window and plan its removal.

**Code says:** login at `server/index.js:477` authenticates **only** against
`User.password_hash`. `Admin.password` is still written at signup (`server/index.js:1989`,
explicitly commented as a transitional copy) but is never read by any auth path.

The remaining work is dropping a column — a contract-phase migration — not an
authentication change.

**Why this matters:** the plan frames this as an auth-behaviour change requiring a
compatibility window and careful rollout. It isn't. It is a schema cleanup that can ride
along with the [G3](#g3) tenant-ownership migration at near-zero risk.

**Correction:** move from "Architecture work" to the contract phase of the tenant phase-2
migration. Note that the transitional write at `server/index.js:1989` must be deleted in
the same PR that drops the column, or signup will fail.

---

### <a name="e3"></a>E3. The test baseline is two unit tests, not five

**Plan says** (§11, "Known current risks to close"):
> Automated test coverage is still small; the current five tests are a foundation, not a
> release suite.

**Code says:** there are **two test files**, 68 lines total:

| File | Lines | What it covers |
|---|---|---|
| `tests/tenantAccess.test.js` | 48 | Pure functions in `tenantAccess.js` |
| `tests/orderTransitions.test.js` | 20 | Pure functions in `orderTransitions.js` |

Both are pure unit tests over helper modules. There are **zero** API tests, **zero**
integration tests, **zero** database or migration tests, **zero** component tests, and
**zero** E2E tests. `npm test` runs `node --test` against these two files.

**Why this matters — this is the single largest schedule risk in the plan.** §9 defines
eight test layers. Seven of them do not exist at zero percent, not at "small coverage."
The M4 exit gate is *"No P0/P1, migration rehearsal, target SLO evidence"* and the
Go/No-Go gate requires *"Isolation and role matrix pass."* Neither is reachable without
building an entire test infrastructure first: a test database, fixtures, a seeding
strategy, an HTTP-level harness, and an E2E runner (none is currently installed —
`package.json` has no Playwright, Cypress, Vitest, or Supertest).

The plan allocates this to M4 (weeks 7–8) alongside "E2E/browser/device regression and UX
defect closure." Building the harness *and* writing the suites *and* closing the defects
they find, in two weeks, with two people, is not achievable.

**Correction:**
1. Restate the baseline honestly as two unit tests.
2. Move **test infrastructure** (test DB, fixtures, HTTP harness, E2E runner install) into
   M0/M1 as a P0 deliverable. It is a prerequisite, not part of hardening.
3. Require every P0 fix from Part 2 to ship with its test. Suites grow with the work
   instead of being retrofitted in M4.
4. Reserve M4 for *running* regression and closing defects, which is what hardening
   actually means.

---

### <a name="e4"></a>E4. POS is out of scope in the plan but still in the schema

**Plan says** (§1): POS, cash drawers, till shifts, card-present payments, and receipt
hardware are explicitly outside Release 1. §15 lists scope expansion into POS/payments as a
tracked risk.

**Code says:** `server/prisma/schema.prisma` still contains **11 POS models** —
`Employee`, `PosRole`, `EmployeeBranchRole`, `PosDevice`, `Register`, `TillShift`,
`CashMovement`, `DiningSession`, `Check`, `Payment`, `Refund` — plus 7 supporting enums,
roughly 250 of the schema's 824 lines. Three POS migrations are already applied
(`20260804112146_pos_foundation`, `20260804130452_pos_transaction_controls`,
`20260804112419_link_payments_to_till_shift`).

**None of these models is referenced anywhere in `server/index.js`.** They are dead tables
carrying live foreign-key constraints.

**Why this matters:** every future migration has to reason about these tables and their FK
graph. Backup and restore rehearsals (M3) carry them. Any `Branch` or `Organization` schema
change must consider POS FKs pointing at it. The plan claims POS is out of scope while the
database says otherwise — that contradiction will resurface at the worst time, during the
M3 restore rehearsal or an M4 migration.

**Correction:** make an explicit, recorded decision before M1 closes. Two defensible options:

- **Park** — leave the tables, document them as intentionally dormant with an ADR, and add
  a migration-review checklist item so nobody edits them by accident. Zero risk now, carries
  the weight forward.
- **Drop** — a contract migration removing all 11 models. Cleaner schema, faster restores,
  smaller FK graph. Irreversible without re-running the POS migrations, so only choose this
  if POS is genuinely deferred beyond the next two releases.

Silence is the worst option. Whichever is chosen goes in the §15 decision log.

---

## Part 2 — Missing work

### <a name="g1"></a>G1. Public order creation is unauthenticated and unbounded — **P0**

**Location:** `server/index.js:1237`

`POST /api/orders` accepts `adminId` from the **request body** with no proof of session,
table possession, or QR scan. For `type: 'take_away'` no `tableCode` is required at all, so
the only input needed to create an order is a restaurant UUID — which appears in the URL of
every QR code the product generates.

The order body is validated well (server-side pricing, ownership checks on menus,
ingredients, modifiers and combos, promotion limits under transaction). That is not the
problem. The problem is that **anyone can invoke it, indefinitely**. The only barrier is a
30-requests-per-minute per-IP in-memory limiter — which is trivially bypassed by rotating
IPs and is itself defective ([G2](#g2)).

Consequences: a restaurant's kitchen display floods with fake orders; tables are forced to
`occupied` status (`server/index.js:1541`); promotion `times_used` counters are burned
against real usage limits (`server/index.js:1527`); analytics and revenue reporting are
poisoned.

**Why this is a plan-level issue, not just a bug:** §10 of the plan states —

> Launch blocker: Any reproducible cross-tenant access, authentication bypass, destructive
> migration risk, exposed secret, or **unbounded public write** is an automatic No-Go.

This *is* an unbounded public write. By the plan's own rule the current baseline is
already No-Go, and no milestone addresses it.

**What to implement:** a scoped, short-lived table session token. The customer scans a QR,
`GET /api/tables/public/:code` (which already exists at `server/index.js:1735`) issues a
signed token bound to `{adminId, tableId}` with a short expiry; `POST /api/orders` requires
it and derives `adminId` from the token rather than the body. Takeaway needs an equivalent
entry point — either a per-restaurant public token issued on menu load, or a proof-of-work
/ CAPTCHA gate if genuinely anonymous takeaway is a product requirement.

This mirrors the pattern already used correctly for order tracking (`server/index.js:1566`),
so it introduces no new concept.

**Owner:** Yazan. **Milestone:** M2 at the latest, and it must gate the M2 exit.
**Test:** order creation without a valid table token returns 401; token for restaurant A
cannot create an order for restaurant B.

---

### <a name="g2"></a>G2. The rate limiter is a memory leak — **P0**

**Location:** `server/index.js:240-258`

```js
const rateLimitBuckets = new Map();
const createRateLimiter = ({ windowMs, max }) => (req, res, next) => {
  const key = `${req.ip}:${req.path}`;
  ...
```

Entries are inserted and overwritten but **never deleted**. There is no sweep, no TTL, no
eviction. Every unique `ip:path` pair that ever hits a rate-limited route occupies memory
for the lifetime of the process. The keyspace is unbounded because `req.ip` is
attacker-controlled in aggregate.

The limiter guards `/api/auth/login`, `/api/admins` (signup), `/api/orders`, and
`/api/public/promotions/validate` — all public. On a Render instance with modest memory,
sustained traffic against any of them grows the map until the process is OOM-killed.

**Why the plan's framing is insufficient:** §4 correctly identifies this —

> Replace in-memory rate limiting with a shared production store

— but frames it as a *correctness and coordination* concern (state lost on restart, not
shared across instances) and schedules it P1 in M3. It is also an *availability* bug that
exists today, and it is exploitable in combination with [G1](#g1): the same unauthenticated
endpoint that lets an attacker create unlimited orders also lets them grow this map without
limit.

**What to implement:** two things, on different timelines.

- **Now (M1):** add eviction. A periodic sweep of expired buckets, or an LRU cap. This is a
  handful of lines and removes the crash risk immediately.
- **M3 as planned:** replace with a shared store (Redis or equivalent) for cross-instance
  coordination and restart durability.

Do not defer the eviction fix waiting on the shared store — they solve different problems.

**Owner:** Yazan. **Milestone:** eviction in M1, shared store stays in M3.
**Test:** sustained load against a rate-limited route does not grow process RSS without bound.

---

### <a name="g3"></a>G3. Modifier and combo tables have no tenant column — P1

**Location:** `schema.prisma:275-347`

`ModifierGroup`, `ModifierOption`, `ComboGroup`, and `ComboGroupItem` carry **no
`admin_id` and no `organization_id`**. Tenant ownership is inferred transitively:

```
ModifierOption → ModifierGroup → MenuModifierGroup → Menu.user_id
ComboGroupItem → ComboGroup → Menu.menu_id → Menu.user_id
```

The write paths handle this correctly today — `server/index.js:954` restricts edits to
group IDs already linked to the owned menu, and `server/index.js:1024` scopes combo groups
by `menu_id`. That is careful code, and it is the only thing standing between this schema
and an IDOR.

There is already one query that relies entirely on that indirection:
`server/index.js:1200` fetches `modifierOption` records by ID **with no tenant filter
whatsoever**. It is safe only because the IDs were read from that tenant's own order
customizations moments earlier. Any future refactor that changes where those IDs come from
turns this into a cross-tenant read.

**Why the plan misses it:** §4 lists the tenant phase-2 targets as *"catalog, tables,
orders, promotions, uploads, and audit records."* "Catalog" reasonably covers `Menu`,
`Category`, and `Ingredient` — all of which already have `admin_id`. It does not obviously
cover modifier groups, modifier options, combo groups, or combo group items, and those are
precisely the four tables that lack a tenant column.

**What to implement:** include all four tables in the phase-2 expand migration. Add
`organization_id`, backfill from the menu relationship, index it, and add it to every query
predicate. Same expand → backfill → verify → enforce → contract discipline as the rest.

**Owner:** Yazan. **Milestone:** M1, with the rest of tenant phase 2.
**Test:** the cross-tenant integration suite must include a case that attempts to read and
write another tenant's modifier group and combo group directly by ID.

---

### <a name="g4"></a>G4. Forty endpoints return raw exception text — P1

**Locations:** 40 occurrences of `res.status(500).json({ error: err.message })` across
`server/index.js`.

A Prisma failure returns its message verbatim to the caller. Prisma error messages can
include table names, column names, constraint names, and fragments of the failing query.
Several of these handlers sit on public, unauthenticated routes.

Two distinct problems:

1. **Information disclosure.** Internal schema details leak to any caller, including
   anonymous ones. §10 of the plan requires that logs exclude sensitive detail; the same
   standard should apply to responses, and currently doesn't.
2. **No stable error contract.** The frontend receives an arbitrary string it cannot branch
   on. This makes §10's requirement — *"handles 401/403 without leaking details"* —
   unimplementable, and it is why error handling in the UI can only ever display a raw
   message.

**The right pattern already exists in this codebase.** The well-handled routes
(`server/index.js:487`, `:509`, `:531`, `:546`, `:572`, `:645`, `:712`, `:1905`) log the
full error server-side and return a safe generic message. Notably, **the set of endpoints
that log and the set that leak are almost disjoint** — the good handlers don't leak, and the
leaking handlers don't log. Roughly 30 handlers do neither.

**What to implement:** one centralized Express error handler. Handlers throw; the middleware
logs the full error with its request ID ([G5](#g5)) and returns
`{ error: <safe message>, requestId }`. Errors already carrying an explicit `status` (the
`Object.assign(new Error(...), { status: 400 })` pattern used throughout) keep their
intended client-facing message.

**This is a net deletion of code** — 40 catch blocks collapse into one middleware.

**Owner:** Yazan. **Milestone:** M1. It should land *before* the P0 fixes so those
handlers are written against the final error contract.

---

### <a name="g5"></a>G5. There is no request correlation ID — P1

**Location:** absent throughout.

No request ID is generated, propagated, logged, or returned. Backend logging is 21
unstructured `console.log`/`console.error` calls. There is no request logging at all — no
line is written for a successful request.

The practical consequence: when a restaurant reports "my 8pm order vanished," there is no
query that finds it. `console.error('Error creating order:', err)` at
`server/index.js:1573` produces a stack trace with no organization ID, no user ID, no route
context, and no timestamp correlation to anything the customer can tell you. On Render,
logs are an unindexed stdout stream.

Meanwhile the *only* consistently instrumented subsystem is socket lifecycle
(`server/index.js:121-172`) — every connect, join, and disconnect writes a line. High volume,
near-zero diagnostic value, and it drowns the errors that matter.

**Why the plan's coverage is thin:** §11 correctly specifies the target —

> Structured backend logs with timestamp, request ID, route, status, duration, organization
> ID, user ID, and safe error code.

— but bundles it into a single P1 row in M3 alongside Sentry, health, alerts, and
dashboards. That row is four separate integrations plus dashboard and alert configuration.
More importantly, M3 is *after* the two highest-risk workstreams (M1 tenant transition, M2
core order cycle) are built and debugged. Observability's primary value is catching problems
during development. Landing it at M3 means building M1 and M2 blind, then having three weeks
of history at pilot instead of eight.

**What to implement (M1, roughly half a day):**
- Middleware generating a UUID per request, attached to `req`, echoed as `X-Request-Id`.
- One structured JSON line per response:
  `{requestId, method, route, status, durationMs, organizationId, userId}`.
- Demote socket lifecycle logging to debug level.

`pino` does this properly for one dependency; `JSON.stringify` over a plain object gets most
of the value with zero dependencies. Either is acceptable — the plan's §15 provider decision
can settle it.

**Keep in M3 as planned:** hosted error tracking, dashboards, alert rules, log retention.

**Owner:** Yazan. **Milestone:** M1 for correlation + structured request log; M3 for the
hosted stack.

---

### <a name="g6"></a>G6. There is no frontend error boundary — P1

**Location:** absent throughout `src/`.

Zero `componentDidCatch`, zero `getDerivedStateFromError`, zero error boundary components.
No `window.onerror` handler, no `unhandledrejection` handler. 88 stray `console.*` calls
that go nowhere in production.

A single unhandled render error unmounts the entire React tree and the user sees a white
screen — no recovery, no report, and you never learn it happened. The highest-risk files are
also the largest: `src/components/menu/DigitalMenu.tsx` (1,505 lines) and
`src/pages/CustomerMenu.tsx` (1,342 lines).

For a QR ordering product this is a revenue defect, not a polish item. The customer is
standing at a table with one attempt at ordering; a white screen ends the transaction.

**Why the plan is insufficient here:** §4 lists *"reusable route-level error boundaries,
skeletons, empty states, retry behavior"* as Alaa's architecture work, and §7 has
"Frontend reliability" as P1 with "injected failure scenarios" as evidence — both correct,
but there is no milestone anchor, and §11's "Frontend error reporting" is bundled into the
same overloaded M3 row as everything else.

**What to implement:**
- One reusable error boundary component.
- Wrap the customer menu and the admin workspace **separately**, so an admin-panel crash
  cannot take down customer ordering.
- A global `unhandledrejection` handler.
- In M3, wire both into the chosen error-tracking service with release version and route.

**Owner:** Alaa. **Milestone:** boundary in M1; reporting integration in M3.

---

### <a name="g7"></a>G7. The API client discards HTTP status codes — P1

**Location:** `src/services/api.ts:16-30`

```js
const handleResponse = async (res: Response) => {
  if (!res.ok) {
    let errorMsg = `API Error: ${res.statusText}`;
    ...
    throw new Error(errorMsg);   // status code is lost here
  }
  return res.json();
};
```

`handleResponse` throws a plain `Error` carrying only a message string. The status code is
never attached. No caller can distinguish 401 from 403 from 409 from 500 from a network
failure.

This makes several plan requirements unimplementable as written:

- §10: *"The UI never exposes controls or tenant data for unauthorized roles and handles
  401/403 without leaking details"* — the UI cannot detect 401 vs 403.
- §7: *"Error boundaries, skeletons, retries, empty/offline states"* — retry logic needs to
  distinguish retryable (5xx, network) from terminal (4xx).
- §13: session expiry handling — a 403 from an expired token is indistinguishable from a
  permission denial, so the app cannot decide whether to re-authenticate or show
  access-denied.

**What to implement:** a typed `ApiError` carrying `status`, `message`, and the `requestId`
from [G4](#g4)/[G5](#g5). Small, contained change in one file. Downstream, it unblocks
401-triggered re-auth, 403 access-denied UI, retry-on-5xx, and lets a user screenshot an
error containing a request ID that maps to an exact server log line.

**Owner:** Alaa, with Yazan reviewing the error contract. **Milestone:** M1, paired with
[G4](#g4).

---

### <a name="g8"></a>G8. There is no log redaction helper — P2

**Plan says** (§10):
> Logs exclude passwords, tokens, connection strings, customer notes where unnecessary, and
> full request bodies containing sensitive data.

That is the right rule. But with `console.error('Error creating order:', err)` dumping full
error objects, a Prisma validation error on order creation can serialize the request
parameters — which include `item.notes`, free-text customer input capped at 500 characters
(`server/index.js:1295`).

A policy in a document does not prevent this. A redaction function does.

**What to implement:** a small `redact()` helper applied in the centralized error handler
([G4](#g4)) — strip known-sensitive keys (`password`, `password_hash`, `token`,
`authorization`, `note`, `notes`) from anything serialized into a log line. Ten lines,
enforced in exactly one place because errors now flow through one handler.

**Owner:** Yazan. **Milestone:** M1, with [G4](#g4).

---

### <a name="g9"></a>G9. Two parallel SuperAdmin auth paths — P2

**Locations:** `src/services/superAdminService.ts`,
`src/components/super-admin/SuperAdminLogin.tsx:25`,
`src/components/super-admin/SuperAdminDashboard.tsx:19`

SuperAdmin uses a separate token in a separate localStorage key (`superAdminToken` vs
`auth_token`), read directly by components, with its own fetch path. Both eventually reach
the same `authenticate` middleware server-side, but the client has two independent session
lifecycles, two expiry behaviours, and two logout paths.

The Go/No-Go gate in §8 requires *"No restaurant can access platform routes."* Testing that
is easier against one auth boundary than two, and a second code path is a second place for a
session bug to hide.

**What to implement:** consolidate onto the single API client and one token-storage
abstraction with a role discriminator. Not urgent, not risky, but it should be done before
the M4 security test pass rather than after.

**Owner:** Alaa, reviewed by Yazan. **Milestone:** M2 or M3. Optional if capacity is tight —
flag it as accepted risk rather than silently skipping.

---

### <a name="g10"></a>G10. No pagination on any list endpoint — P2

**Locations:** `server/index.js:1159` (`GET /api/orders`), `:2035`
(`GET /api/admin/analytics`), `:1863` (`GET /api/public/menus`), `:2335`
(`GET /api/super-admin/restaurants`)

There are exactly **2** occurrences of `take:` or `skip:` in the entire server. `GET
/api/orders` returns every order a restaurant has ever placed, with all items and menu
relations joined, on every dashboard load. `GET /api/admin/analytics` defaults to 30 days
but accepts an unvalidated `days` query parameter, so `?days=100000` returns everything.

This is fine at pilot scale and degrades badly after. It also directly threatens two of the
plan's own §11 targets: *"Warm API latency p95 < 500 ms"* and the §13 Definition of Done
clause *"avoid ... unbounded results."*

**Why the plan is thin here:** §6 lists pagination under P2 Performance with "Load test
report" as evidence, scheduled M3+. That is the right priority, but the plan should record
that unbounded queries exist *today* on the admin dashboard's hot path, so the M3 load test
is designed to catch it rather than discovering it at pilot.

**What to implement:** cursor or offset pagination on the four list endpoints; validate and
clamp the `days` parameter on analytics.

**Owner:** Yazan. **Milestone:** M3, as planned. This item is a note for accuracy, not a
resequencing request.

---

## Part 3 — Sequencing corrections

### <a name="s1"></a>S1. Backend modularization must come before the P0 edits

**Plan says** (§6): backend structure — *"Routers/services/validators/errors; remove
monolithic route coupling"* — is **P1**, while tenant phase 2, order integrity, and uploads
are **P0**.

**The problem:** all of that P0 work lands inside `server/index.js`, a single 2,470-line
file. The sequence the plan implies is: make hard, security-critical edits in the monolith,
then restructure the file, then re-verify everything still works. The restructure invalidates
the review context of every P0 diff that preceded it.

It also fights the plan's own workflow rule (§3): *"Keep PRs small enough to review in one
focused session."* A tenant-ownership change touching 40 handlers in one 2,470-line file is
not that PR.

**Correction:** do a **mechanical route extraction first** — move handlers into router
modules with **no logic changes at all**, in one or two PRs that are reviewable by
inspection because nothing but line position changed. Then every subsequent P0 diff is
scoped to a small file and genuinely reviewable.

This is not new scope. It is the same work the plan already lists, moved earlier, and it
makes everything after it cheaper. Pair it with [G4](#g4) (centralized error handling), since
extracting routes and consolidating error handling touch the same lines.

**Owner:** Yazan. **Milestone:** M1, before tenant phase-2 implementation.

---

### <a name="s2"></a>S2. Observability is scheduled after the work it should be observing

Covered in detail under [G5](#g5). Restating as a sequencing item because it affects
milestone structure rather than a single deliverable.

M3 is where §6 places *"Structured logs, Sentry-equivalent errors, health, alerts,
dashboards."* M1 (tenant transition) and M2 (core order cycle) are the two highest-risk
workstreams in the plan, and both are built and debugged before any of it exists.

**Correction:** split the row.

| Piece | Move to | Effort | Rationale |
|---|---|---|---|
| Request ID + structured request log | **M1** | ~0.5 day | Makes M1/M2 debuggable |
| Centralized error handler ([G4](#g4)) | **M1** | ~0.5 day | Net code deletion; fixes leak |
| Frontend error boundary ([G6](#g6)) | **M1** | ~0.5 day | Prevents white-screen in dev too |
| Typed API errors ([G7](#g7)) | **M1** | ~0.25 day | Unblocks 401/403 handling |
| Hosted error tracking, dashboards, alerts, retention | M3 (unchanged) | — | Correctly placed |

Total moved forward: under two days. Health checks already exist
(`server/index.js:442-466`, live/ready split, real DB round-trip) and need no work.

**One correction to §11's framing:** the plan lists observability among "risks to close,"
which implies partial coverage. It is at zero for four of the five telemetry items. The §11
signal targets — *p95 < 500 ms*, *error rate < 1% over 15 minutes* — are **currently
unmeasurable**, because no instrument produces either number. That matters for the Go/No-Go
gate *"Performance: targets measured and accepted,"* which requires the measurement
apparatus to exist well before the meeting.

---

### <a name="s3"></a>S3. The ten-week estimate is not defensible for M3+M4

Everything else in the plan is well calibrated. This number is not.

M3 (weeks 5–6) and M4 (weeks 7–8) together contain:

- Managed object storage migration with signed uploads and ownership-safe deletion
- Shared rate-limit store
- Structured logging, error tracking, dashboards, alerts
- Backups, PITR, restore runbook and rehearsal
- Staging/production separation
- API, integration, security, and performance test suites
- E2E, browser, and device regression
- UX defect closure
- Accessibility and performance fixes

Starting from **two unit tests** ([E3](#e3)), a **2,470-line single-file server**, and **no
test harness of any kind**. Four weeks, two people.

**Correction:** pick one, explicitly, and record it:

1. Extend to **12 weeks**, moving the pilot to week 11 and launch to week 12.
2. Keep 10 weeks and **name the P1 items that get cut** when M3 slips — decided now, in
   writing, not improvised at the M3 gate.

The plan already has the right principle — *"Dates move when quality gates fail; gates do
not get waived."* This correction just makes the slack visible in advance instead of
discovering it at M4.

Note that [E1](#e1) and [E2](#e2) return some capacity, and [S1](#s1) makes later work
cheaper. The net is still short of four weeks.

---

## Part 4 — Missing decisions

### <a name="d1"></a>D1. Additions to the §15 pre-M1 decision list

The six existing decisions are the right ones. Four are missing:

**1. Order tracking token lifetime and expiry behaviour.**
Currently 24 hours (`server/index.js:1570`) with no refresh path. A customer who orders at
8pm and reopens the tab the next evening gets a dead link with no recovery. This is a product
decision, and §8's "Customer order" journey acceptance depends on it. Options: extend the
lifetime, add a refresh endpoint, or accept expiry with a clear expired-link UI state.

**2. Takeaway ordering entry point.**
[G1](#g1)'s fix is straightforward for dine-in (the QR scan is the proof of presence).
Takeaway has no equivalent gate. Decide whether takeaway requires a per-restaurant public
token issued at menu load, some challenge, or whether takeaway is dine-in-only for Release 1.
This blocks the [G1](#g1) implementation, so it is needed early.

**3. POS schema disposition.**
Park or drop ([E4](#e4)). Needs an ADR either way.

**4. Log retention window and contents.**
Structured logs will carry organization IDs and user IDs. Retention duration and access
control tie directly into the existing §15 decision on customer data retention and deletion
policy, and should be answered alongside it.

---

## Part 5 — Consolidated recommendation

### Add to M0/M1 (highest value, mostly small)

| Item | Owner | Est. | Why now |
|---|---|---|---|
| Test infrastructure: test DB, fixtures, HTTP harness, E2E runner ([E3](#e3)) | Both | 3–4 d | Prerequisite for every gate after M1 |
| Mechanical route extraction ([S1](#s1)) | Yazan | 1–2 d | Makes every later P0 diff reviewable |
| Centralized error handler + redaction ([G4](#g4), [G8](#g8)) | Yazan | 0.5 d | Net deletion; closes info leak |
| Request ID + structured request log ([G5](#g5)) | Yazan | 0.5 d | Makes M1/M2 debuggable |
| Rate limiter eviction ([G2](#g2)) | Yazan | 0.25 d | Removes OOM crash risk |
| Modifier/combo tenant columns in phase 2 ([G3](#g3)) | Yazan | — | Scope addition to planned migration |
| Frontend error boundary ([G6](#g6)) | Alaa | 0.5 d | Prevents white-screen loss of order |
| Typed API errors ([G7](#g7)) | Alaa | 0.25 d | Unblocks 401/403 and retry handling |
| Delete stale schema/hook files ([E1](#e1)) | Alaa | 0.25 d | Cleanup, frees M1 capacity |

### Gate M2 on

- Authenticated, bounded order creation ([G1](#g1)) — currently a No-Go by the plan's own §10.

### Unchanged in M3

Object storage, shared rate-limit store, hosted error tracking, dashboards, alerts, backups
and restore rehearsal, staging/production separation, pagination ([G10](#g10)).

### Decide before M1 closes

POS disposition ([E4](#e4)), tracking token lifetime, takeaway entry point, log retention
([D1](#d1)) — plus the six decisions already in §15.

### Correct in the plan document

- Test baseline: two unit tests, not five ([E3](#e3))
- API boundary already exists ([E1](#e1))
- `Admin.password` auth already removed ([E2](#e2))
- §11 signal targets are currently unmeasurable ([S2](#s2))
- Timeline: 12 weeks, or a written list of what gets cut ([S3](#s3))

---

## Part 6 — Execution runbook and completion evidence

This section turns the findings above into small, testable changes. It is the source of
truth for implementation status; an item is only **Done** when its code, migration, and
listed test evidence are all merged and passing. As of 13 August 2026, this runbook is
prepared; no implementation item below is marked Done.

### Delivery rules

1. Work one row at a time in a small PR. Do not combine a mechanical extraction with a
   behavioural change.
2. Each backend change needs a unit test where logic can be isolated and an HTTP-level
   integration test for the affected endpoint or middleware.
3. Tenant and public-write changes require an explicit negative test: tenant A must not
   access, modify, or create data for tenant B.
4. A migration is not Done until it has been applied to a fresh test database, backfilled
   where required, verified, and exercised by an integration test.
5. Record the pull request, commit, test command, and date in the completion table below.

### Execution sequence

| Order | Work item | Owner | Status | Completion test/evidence |
|---|---|---|---|---|
| 0 | Record the four D1 decisions: tracking expiry, takeaway entry point, POS disposition, and log retention. | Yazan + Alaa | **Drafted, pending Yazan sign-off** | Decisions recorded in `D1-Decision-Log.md`: 6h tracking token/no refresh; takeaway disabled for Release 1 (dine-in only); QR code stays permanent, only the scan-time session token expires; POS schema parked; 30-day redacted log retention. Awaiting Yazan's signature to flip to Done. |
| 1 | Establish test infrastructure: isolated test DB, fixture/seeding helper, HTTP harness, and E2E runner. | Both | **Frontend half done** | Vitest + Testing Library + jsdom + MSW installed and passing (`npm run test:frontend`); Playwright + axe installed with a smoke spec (`npm run test:e2e`). Backend half (test DB, fixtures, HTTP harness for Express) not started. |
| 2 | Extract route modules mechanically, with no behaviour change. | Yazan | Not started | Existing unit tests plus endpoint smoke tests pass before and after extraction; review confirms no logic change. |
| 3 | Add request ID, structured request logging, centralized safe error responses, and redaction. | Yazan | Not started | Unit tests for redaction/error normalization; integration tests verify `X-Request-Id`, safe 500 response, and no raw Prisma message. |
| 4 | Add expired-bucket eviction (or bounded LRU) to the in-memory limiter. | Yazan | Not started | Unit test proves expired keys are removed; integration test confirms 429 and `Retry-After` behaviour. |
| 5 | Add tenant ownership columns and migration for modifier/combo records, then scope every query. | Yazan | Not started | Fresh-DB migration test; tenant-A-to-tenant-B read/write integration tests return 404/403 as appropriate. |
| 6 | Add frontend `ApiError` status/request-ID propagation and separate customer/admin error boundaries. | Alaa | **Done** | `ApiError` class with `status`/`code`/`requestId`/`retryAfter`, unit-tested in `src/services/api.test.ts`; `ErrorBoundary` wraps customer and admin routes separately in `App.tsx`, unit-tested in `ErrorBoundary.test.tsx`. `codex/tenant-transition` @ `cd03ed9`. |
| 7 | Delete stale schema and unused authentication-hook files. | Alaa | **Done** | `useAuthhhhh.tsx`, `schema.sql`, `schema.prisma.bak` deleted; typecheck and build confirmed clean after removal. `codex/api-response-typing` @ `de31099`. |
| 8 | Implement bounded public order creation using the signed table-session design selected in step 0. | Yazan | **Blocked — takeaway decision required** | Integration: no token returns 401; valid table token creates only for its bound restaurant/table; cross-tenant token attempt is denied. |
| 9 | Run regression, migration rehearsal, performance checks, and pilot readiness review. | Both | Not started | M4 and Go/No-Go evidence attached; no unresolved P0/P1 issues. |

**Known gap introduced by step 6's implementation:** the typed `api.get<T>()`/`post<T>()`/etc.
generics currently default `T` to `any` (not `unknown`) to avoid a 54-call-site breaking
change across the codebase in one PR. This preserves today's typecheck-passing behaviour but
means most call sites are not yet getting real compile-time response typing — only the
`ApiError` contract and status/code discrimination are real today. Typing the remaining call
sites is tracked as follow-up work, not yet in this table as its own row.

**New finding from the A0 journey/state inventory (G11): typed `ApiError` existed but nothing
consumed it, causing false logouts on transient failures — P1, fixed same pass.**
`AuthProvider.initAuth` and `SuperAdminDashboard.loadData` both cleared the user's session
token and forced a re-login on *any* failure from their session/data-load calls, including a
network blip or a backend 500 — not just a genuine 401. Root cause was two-fold: (1) nothing
in the codebase branched on `ApiError.code`/`status` even though step 6 added it, and (2)
`superAdminService.ts` duplicated `api.ts`'s fetch/error-parsing logic and threw plain `Error`
instead of `ApiError`, which would have silently defeated a fix in `SuperAdminDashboard` alone.
Fixed by adding `isUnauthenticatedError()` to `src/services/api.ts`, branching on it in both
call sites, and switching `superAdminService.ts` to reuse the shared `handleResponse()`. Unit
tests added in `src/services/api.test.ts` and `src/services/superAdminService.test.ts`.
`codex/api-response-typing`. This does not change G9's status (the two auth paths are still
separate) — it only stops the shared `ApiError` type from being silently ignored.

### Minimum test suite to add

| Layer | First tests required | Gates |
|---|---|---|
| Unit | Rate-limiter eviction; log redaction; error normalization; API error parsing; table-session-token claims. | Steps 3, 4, 6, and 8 |
| Integration (HTTP + test DB) | Public order auth; rate-limit 429; safe internal-error contract; tenant isolation for modifiers/combos; migration/backfill integrity. | M1/M2 exits |
| Component | Customer-menu boundary; admin-workspace boundary; 401 re-auth and 403 access-denied states. | M1 exit |
| E2E | QR/table-session → menu → order → order tracking; restaurant-admin role path; cross-tenant denial. | M2 and M4 exits |

### Completion register

Update this table in the same PR that implements each item. “Done” requires a passing test
command and review; a merged code change without test evidence remains **In progress**.

| Item | Status | PR / commit | Test command and result | Verified by | Date |
|---|---|---|---|---|---|
| D1 decisions | Blocked | — | — | — | — |
| Test infrastructure (E3) | Frontend done, backend not started | `codex/tenant-transition` @ `cd03ed9` | `npm run test:frontend` (5/5 pass), `npm run test:e2e` (2/2 pass) | Claude | 13 Aug 2026 |
| Route extraction (S1) | Not started | — | — | — | — |
| Error handler + redaction (G4, G8) | Not started | — | — | — | — |
| Request IDs + structured logs (G5) | Not started | — | — | — | — |
| Rate-limiter eviction (G2) | Not started | — | — | — | — |
| Modifier/combo tenant migration (G3) | Not started | — | — | — | — |
| API errors + error boundaries (G6, G7) | **Done** | `codex/tenant-transition` @ `cd03ed9` | `npm run test:frontend` (`api.test.ts`, `ErrorBoundary.test.tsx`) | Claude | 13 Aug 2026 |
| Stale-file cleanup (E1) | **Done** | `codex/api-response-typing` @ `de31099` | `npm run typecheck` + `npm run build` clean after removal | Claude | 13 Aug 2026 |
| False-logout on network/5xx errors (G11, new finding) | **Done** | `codex/api-response-typing` @ `1b02db1` | `npm run test:frontend` (`isUnauthenticatedError` cases, `superAdminService.test.ts`) | Claude | 13 Aug 2026 |
| Bounded public order creation (G1) | Blocked | — | — | — | — |

### Definition of done for this correction set

- All P0 items (G1 and G2) are Done, and G1 is covered by a cross-tenant integration test.
- G3 has completed expand → backfill → verify → enforce → contract, with a rehearsed
  rollback/runbook decision where applicable.
- The test suite contains unit and HTTP-level integration coverage for every M1/M2 security
  change; E2E covers the customer order journey before pilot.
- The completion register has passing command output and reviewer/date for every row.
- The four D1 decisions and the schedule choice (12 weeks or named scope cuts) are recorded
  and signed off by both owners.

---

## What this document does not propose

No new product features. No change to the release boundary — POS, native mobile, and
marketplace integrations stay out. No change to the ownership model, the review rules, the
migration policy, or the Definition of Done. Those parts of the plan are correct and should
be followed as written.

Of the items above, four are genuinely required rather than advisable: [G1](#g1)
(unbounded public write), [G2](#g2) (memory leak), [G3](#g3) (missing tenant columns), and
the [D1](#d1) tracking-token decision. The rest improve confidence, reviewability, and
schedule accuracy — but those four are defects or contradictions against rules the plan
already sets for itself.

---

**Sign-off required from both owners before any milestone changes.**

| Owner | Accepts corrections | Date |
|---|---|---|
| Yazan | | |
| Alaa | | |
