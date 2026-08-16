# Alaa — Frontend, Product Reliability, and E2E Work Plan

**Source:** `Production-Execution-Plan.md`  
**Role:** Customer and admin UX, typed frontend integration, resilience, accessibility, and
functional release evidence  
**Working rule:** Build against Yazan’s written API contract or a typed mock. Do not wait for
the final backend implementation when the response/error contract is stable.

## Fair-split agreement

Ownership is not a measure of effort. Each milestone is planned as an approximately equal
share of implementation, automated testing, evidence, and review work. When Yazan has a
database/security-heavy deliverable, Alaa owns the corresponding user journey, typed client
contract, and E2E evidence; neither waits for the other to finish a whole milestone.

| Milestone | Alaa’s primary half | Yazan’s parallel half | Joint completion rule |
|---|---|---|---|
| M0 | E2E runner, browser fixtures/mocks, typed client design, UI-state inventory. | Test DB/HTTP harness, CI backend checks, server contracts/ADRs. | Both make one smoke test run in CI. |
| M1 | Typed transport/error UI, session contexts, boundaries, organization/role UI. | Tenant constraints/migration, errors/logging, limiter, auth-domain extraction. | Both add negative tenant/error tests and cross-review. |
| M2 | Checkout/retry/recovery, order screens, mobile/RTL behaviour, golden E2E. | Capabilities, idempotency, abuse controls, socket/status contract. | Both prove one order per checkout and tenant isolation. |
| M3 | Upload/pagination/recovery UX, frontend telemetry, performance/accessibility remediation. | Storage/shared limiter/backups/operational telemetry. | Both execute restore/alert/user-failure evidence. |
| M4–M6 | Device/browser/a11y/E2E regression and pilot support UX. | API/migration/security/recovery regression and operations. | Both own P0/P1 closure and Go/No-Go. |

**WIP limit:** one primary implementation task and one review/test task per person at a time.
If either person is blocked for more than half a day, they take the next shared test,
documentation, fixture, or regression task instead of waiting.

## Parallel-work boundary

**Alaa owns**

- `src/`, frontend tests, browser/E2E tests, UI evidence, acceptance scenarios, accessibility,
  RTL, device/browser regression, and product documentation.
- Customer menu/cart/checkout/tracking, restaurant admin, SuperAdmin UX, loading/error/empty/
  offline states, session recovery, typed client transport, and frontend telemetry.

**Do not edit without pairing with Yazan**

- Prisma schema/migrations, authorization rules, backend price/totals, API response/error
  semantics, token claims, rate limits, Socket.IO authorization, and production environment
  configuration.

**Request from Yazan before binding UI to an endpoint**

- Request/response type, stable error codes, required session/capability, idempotency rules,
  retry behavior, example fixtures, and known rollout compatibility.

## Work sequence

### A0 — M0 foundation (Week 1)

| Task | Deliverable / handoff | Evidence |
|---|---|---|
| Repair/test local frontend path | Pair with Yazan: Alaa verifies frontend/E2E commands; Yazan owns server/CI commands. | Build/lint/test commands captured in plan. |
| E2E skeleton | Configure runner and create smoke flows for login/admin shell and QR/menu page using isolated fixtures or mocks; pair with Yazan on deterministic backend fixtures. | Smoke suite runs locally and in CI/staging. |
| Journey/state inventory | Map customer, admin, team, and SuperAdmin success/loading/empty/validation/permission/offline/failure states. | **Done** — see backlog below. |
| Typed API design | Define `ApiError` and request/response typing approach from Yazan’s draft contract. | **Done** (`codex/api-response-typing`, 16 Aug). `ApiError` shipped with unit tests, and every `api.get/post/put/patch/delete/postWithToken/getWithToken/upload` call site across `src/` (tableService, menuService, orderService, adminService, superAdminService, orderingStateService, memberService, AuthProvider, AdminOptionsPanel, useAdminMonetary) now has a real response type verified against `server/index.js` and the Prisma schema, not the frontend's prior assumptions. Found and fixed 3 real bugs `any` had been hiding: a `parseInt()` on an already-numeric id, a live admin category-filter bug where `item.category_id === selectedCategory` was always false (number vs. string — proven both ways with a new E2E regression test), and a real-time Socket.IO order push that bypassed the numeric price/total coercion the REST path had. Also deleted several duplicate/drifted local type copies in favor of one real source of truth per endpoint. |
| Cleanup | Delete stale schema/hook files and confirm the client build stays clean. | **Done** — `useAuthhhhh.tsx`, `schema.sql`, `schema.prisma.bak` removed; typecheck/build clean. |

## Journey/state inventory — 13 August 2026

Read every render path for the screens below (not just grep) and recorded which of the
seven states each one actually handles: loading, empty, validation, 401/403, offline/network
failure, and reconnect recovery. This is the backlog A0 calls for.

| Screen | Loading | Empty | Validation | 401/403 | Offline/network | Notes |
|---|---|---|---|---|---|---|
| CustomerMenu | Yes (spinner) | Yes, but conflates "no menu" with an error state | N/A | No — generic catch, own ad hoc error-code enum, not `ApiError` | No — network vs server error not distinguished | `placeOrder` failure has no retry affordance beyond reopening the cart |
| DigitalMenu (admin) | Yes (spinner + 10s timeout hack) | Yes, dedicated `EmptyState` | Yes, inline field errors | No — generic catches throughout | No | Best-covered admin screen; still no `ApiError` branching |
| OrderManagement (admin) | **No** — no own fetch/loading state | Yes | N/A | N/A | N/A | Status changes are optimistic with no rollback/error UI if the update fails |
| TableManagement | **No** — no own fetch/loading state | No explicit empty state | No inline validation | No | No | Socket `table-updated` is not rejoined on reconnect, unlike CustomerMenu |
| QRGenerator | N/A | N/A | N/A | N/A | N/A | `copyToClipboard` reports success even when the copy call fails |
| AdminPanel | Yes (plain text) | N/A | No inline errors | No | No | Toast-only error surfacing |
| UserManagement | **No** | **No** | No inline errors | No — catch discards the real error entirely | No | Weakest screen: no loading, no empty state, error is fully swallowed |
| SuperAdminLogin | Yes | N/A | Client-side only | No | No | Fixed this pass: missing `<main>` landmark (axe violation) |
| SuperAdminDashboard | Yes | Yes, search-aware | N/A | **Fixed this pass** — was force-logging-out on any error, including network/5xx | **Fixed this pass** | See "Resolved this pass" below |
| AuthProvider | Yes (`loading` gates app root) | N/A | N/A | **Fixed this pass** — same false-logout bug as SuperAdminDashboard | **Fixed this pass** | `signIn`/`signUp` still rethrow raw errors for callers |
| AuthForm | Yes | N/A | Client `required` only | No | No | String-only server error display, no code branching |

**Resolved this pass:** `AuthProvider.initAuth` and `SuperAdminDashboard.loadData` both
treated *any* error from their session/data-load calls — network blip, 500, or a real 401 —
as "session expired," clearing the token and forcing a re-login. Fixed by adding
`isUnauthenticatedError()` to `src/services/api.ts` (checks `ApiError.code ===
'AUTHENTICATION_REQUIRED'` or `status === 401`) and branching on it in both call sites.
Also found and fixed: `superAdminService.ts` had its own hand-rolled `fetch`/error-parsing
duplicate of `api.ts` that threw plain `Error` instead of `ApiError`, which would have made
the `SuperAdminDashboard` fix a silent no-op. It now reuses the shared `handleResponse()`.
Covered by `src/services/api.test.ts` (`isUnauthenticatedError` cases) and the new
`src/services/superAdminService.test.ts`.

**Prioritized backlog (highest risk first):**
1. ~~Give `OrderManagement`'s optimistic status-change a rollback/error path~~ — **Done**
   (`codex/api-response-typing` @ `a3ec619`). `confirmAction` now awaits `onStatusChange`,
   reverts the optimistic update on failure, and shows an inline "update failed, try again"
   banner on the affected order card plus a saving spinner while in flight. Covered by
   `src/components/orders/OrderManagement.test.tsx` (rollback and success paths).
2. ~~Add loading and empty states to `UserManagement`~~ — **Done**
   (`codex/api-response-typing` @ `52f1d0e`). Skeleton loading grid, dedicated empty state
   with an add-user action, and a real error state with retry that surfaces the actual
   `ApiError` message instead of a bare catch discarding it. Covered by
   `src/components/admin/UserManagement.test.tsx`.
3. ~~Make error messaging branch on `ApiError.code` across admin screens~~ — **Done**
   (`codex/api-response-typing` @ `45c2643`). `getErrorMessage` now returns distinct
   "check your connection" / "try again in a moment" copy for `NETWORK_ERROR` /
   `SERVER_ERROR`; every other code still passes the real message through unchanged. Fixed
   centrally so all 17 existing call sites benefit without individual edits. Covered by
   `src/utils/errors.test.ts`.
4. ~~Add socket-reconnect rejoin to `TableManagement`~~ — **Done**
   (`codex/api-response-typing` @ `e095f82`). Fixed at the source in `App.tsx`'s
   `AdminDashboard` (where `joinAdminRoom` is actually called), mirroring `CustomerMenu`'s
   proven `socket.on('connect', ...)` pattern. Covers both `TableManagement`'s
   `table-updated` listener and the new-order handler in the same room. Not unit-tested
   (real `socket.io-client` instance, unexported inner component) — verified by direct
   comparison to `CustomerMenu` and a dev-server/build check.
5. ~~Consolidate the SuperAdmin/session boundary per G9~~ — **Done**
   (`codex/api-response-typing` @ `828c46c`). `superAdminService.ts` no longer duplicates
   `api.ts`'s fetch/error logic by hand; it now calls `api.get`/`api.put` with a
   `TokenNamespace` (`'restaurant' | 'superAdmin'`) transport boundary. ADR 0009 supersedes
   SuperAdmin browser token storage: platform sessions now use an HttpOnly SameSite cookie and
   frontend JavaScript never receives that bearer.
   Restaurant admin and SuperAdmin still use separate credential, expiry, and logout paths
   — only the transport mechanics are shared, per the constraint above. All ~54 existing
   restaurant-admin call sites default to the `'restaurant'` namespace and are unaffected.
   Covered by new tests in `src/services/api.test.ts` and
   `src/services/superAdminService.test.ts` proving credential isolation (the restaurant bearer is
   never sent on a platform request, and platform cookie mode is not used by default restaurant
   requests). Yazan's ADR 0009 review is complete.

**Found and fixed after the original five (still highest-risk-first):**

6. ~~`OrderConfirmation` freezes forever on an expired tracking link~~ — **Done**
   (`codex/api-response-typing` @ `2f88908`). The backend already returns 401 "Order
   tracking session expired" once the tracking JWT expires; the frontend never handled it.
   Now shows a dedicated expired-link screen (EN/AR) instead of silently freezing on the
   last known status. This is the UI D1.1 requires and works independent of Yazan's pending
   24h→6h expiry change. Covered by `src/components/ui/OrderConfirmation.test.tsx`.
7. ~~Checkout failure bounced the customer out of the cart~~ — **Done**
   (`codex/api-response-typing` @ `47a194d`). `placeOrder`'s catch block triggered the same
   full-page error takeover used for "menu never loaded," with a "reload page" button —
   the wrong response to a recoverable checkout failure. Now shows a toast with the real
   (network/server-aware) error message and leaves the customer on the cart to retry. Not
   unit-tested (1346-line component, disproportionate mocking for this fix) — verified by
   direct review, typecheck, and build.
8. ~~Admin menu screen showed the wrong empty state on a failed load~~ — **Done**
   (`codex/api-response-typing` @ `36aa958`). `DigitalMenu.tsx`'s `fetchItems` caught every
   error and left `items` as `[]`, which rendered the exact same "No items yet, add your
   first item" onboarding empty state as a genuinely empty menu — a network/server error
   could mislead an admin into thinking their menu was wiped. Now a distinct `loadError`
   state shows the real message with a retry button. Same pass also fixed two silent
   failures in the same file: `handleAddCategory`/`handleAddIngredient` logged to console
   and gave zero user feedback on failure (form just sat there); both now toast the real
   error. Also stopped the image-upload handler from computing `getErrorMessage(err)` and
   then discarding it in favor of a hardcoded string. Not unit-tested (1500+ line
   component) — verified by direct review, typecheck, lint, and build.
9. ~~`FeesTaxSettings`/`KDSSettings`/`OrderWorkflowRules` silently fell back to defaults on a
   load failure~~ — **Done** (`codex/api-response-typing` @ `3cc6848`, `ae81c19`). Same
   copy-pasted bug in all three settings panels: a failed `getAdminSettings`/
   `getAdminMonetarySettings` call was caught and silently replaced with
   `DEFAULT_BILLING`/`DEFAULT_KDS`/`DEFAULT_FLOW`, with the save form left fully usable. If
   the admin saved while the failure was masked, it would overwrite their real billing/KDS/
   workflow settings with defaults — a destructive-write risk, not just a UX gap. Also fixed
   the same class of bug in `PromotionsManager.tsx` (lower severity — an empty list, not a
   destructive default). All four now show a distinct error state with retry and block the
   save form until the real settings load. Covered by `FeesTaxSettings.test.tsx`,
   `KDSSettings.test.tsx`, `OrderWorkflowRules.test.tsx`, `PromotionsManager.test.tsx`.
10. ~~Copy-link button claimed success when the copy actually failed~~ — **Done**
    (`codex/api-response-typing` @ `b84d0e0`). `QRGenerator.copyToClipboard`'s catch block
    explicitly showed the success checkmark regardless of outcome ("Still show success
    message as the fallback might have worked"). `document.execCommand('copy')`'s boolean
    return value was being discarded; a genuine failure (deprecated API, permission denied)
    looked identical to success, so an admin could share a QR link and paste nothing. Now
    checks the return value and shows an error toast on real failure. Not unit-tested
    (canvas-based QR rendering library not implemented in jsdom) — verified by direct review.
11. ~~Theme customizer silently pretended a failed save succeeded~~ — **Done**
    (`codex/api-response-typing` @ `56f6eb0`). `ThemeCustomizer.applyChanges` applied the new
    theme locally, then on a failed `updateAdminTheme` call just logged to console and closed
    the panel exactly as if it had saved — the admin believes their theme is saved and it
    silently reverts on next page load. Now toasts a warning instead of closing silently.
    Also fixed `copyCssVars`'s copy-to-clipboard fallback, same missing-return-value-check bug
    as item 10 but with total silence on failure instead of a false positive. Not
    unit-tested (625-line component, context-heavy) — verified by direct review.

### A1 — M1 frontend safety and tenant UX (Weeks 2–3)

| Task | Frontend scope | Required test / Yazan handoff |
|---|---|---|
| Shared API transport | Implement typed request/response adapters and `ApiError(status, code, requestId, retryAfter)`. | Unit tests parse network/401/403/409/429/5xx contracts. |
| Separate session contexts | Reuse transport but keep Restaurant and SuperAdmin token namespaces, providers, guards, expiries, and logout flows separate. | Restaurant token cannot appear in platform requests; use Yazan’s audience/session contract. |
| Failure containment | Wrap customer menu and admin workspace in separate error boundaries; create recovery, retry, offline, expired-session, and access-denied states. | Component tests and screenshots for fallback states. |
| Tenant UX | Organization switcher, member/role UI, capability guards, and negative/forbidden states. | Owner/manager/staff scenarios against fixtures/HTTP test environment. |
| Accessibility/RTL foundations | Keyboard/focus/dialog primitives, labels/live regions, real Arabic fixtures, responsive baseline. | Component/visual checks in EN + AR/RTL. |

**A1 status — 16 August 2026: all five rows done.** Organization switcher shipped
14–15 Aug; member/role UI (`src/components/team/TeamManagement.tsx`) shipped 16 Aug on
Yazan's organization-membership contract, with role-gated visibility (OWNER edits
role/status inline, MANAGER can add members only, STAFF never sees the tab — matches
the server's own `GET /api/organization/members` role gate) and a confirm step before
suspending a member. Accessibility/RTL foundations covered by the axe-core audit across
AuthForm, the full customer journey (EN + AR/RTL), and every authenticated admin screen
including Team itself (`tests/e2e/admin-accessibility.spec.ts`).

### A2 — M2 reliable customer order journey (Weeks 4–5)

| Task | Frontend scope | Required test / Yazan handoff |
|---|---|---|
| Capability-aware ordering | Obtain and retain only the scoped table capability/session required for dine-in; never send/select restaurant identity from client state. | Invalid/expired/revoked capability UI uses backend error codes. |
| Retry-safe checkout | Generate one idempotency key per checkout attempt, disable accidental duplicate action, and preserve the key across safe retry. | Simulated timeout-after-commit creates one visible order. |
| Order recovery | Persist the minimum order/tracking state; on refresh, `visibilitychange`, online/reconnect, and socket reconnect, refetch the authoritative status. | Browser test plus real iOS Safari/Android Chrome evidence. |
| Status and failure UX | Pending, committed, conflict, validation, rate-limit, overloaded/paused, offline, reconnecting, expired-link, and server-error states. | E2E/visual evidence; no raw backend error messages exposed. |
| Core journey | Complete menu/customization/cart/promotion/tip/submit/confirmation/tracking in EN/AR and LTR/RTL. | Golden E2E on desktop/mobile; server totals displayed as authoritative. |

**A2 status — 16 August 2026: functionally done, one evidence gap remains.** Capability-
aware ordering, idempotency-keyed retry-safe checkout (persisted across reload/mobile-
resume), reconnect/online-event order recovery, the full pending/conflict/rate-limit/
paused/offline/expired-link error-state set, and the EN/AR core journey are all shipped
and covered by `tests/e2e-golden/` and `tests/e2e/table-capability-order.spec.ts` on
desktop Chromium and Playwright's Pixel 7 mobile emulation. Not done: real iOS Safari/
Android Chrome device evidence as this row's own test column calls for — only emulated
mobile Chromium has been run, never an actual device or Safari's WebKit engine. Low
priority, previously flagged and deferred, not picked back up.

### A3 — M3 production experience (Weeks 6–8)

- Connect frontend error reporting using release, route, request ID, and safe organization
  context; never include tokens, notes, or full request bodies.
- Build clear user diagnostics, resilient upload UI, pagination controls, and recovery states
  for production failures.
- Measure and improve customer-menu performance, image behavior, lazy routes, accessibility,
  and RTL across target devices.
- Update operator documentation, support language, and pilot onboarding material.

**Exit evidence:** frontend errors correlate to backend request IDs; responsive upload and
pagination flows pass; Lighthouse/accessibility/RTL evidence is attached.

### A4 — M4 through launch (Weeks 9–12)

- Expand E2E into the critical journey and role matrix; complete browser/device regression.
- Verify keyboard/screen-reader paths, Arabic/RTL, zoom, network loss, background/foreground,
  and reconnect behaviour.
- Close P0/P1 UX defects, attach release screenshots/recordings, support pilot observations,
  and co-sign Go/No-Go evidence.

## PR and handoff checklist

- [ ] Uses a documented API contract or typed mock; no guessed backend behavior.
- [ ] Covers success, loading, empty, validation, permission, network, and server-failure
  states affected by the change.
- [ ] Includes component/unit or E2E evidence as appropriate.
- [ ] Checks mobile, desktop, English, Arabic/RTL, keyboard, and screen-reader impact.
- [ ] Does not expose raw errors, tokens, sensitive details, or unauthorized controls.
- [ ] Yazan reviewed contract/security/session changes; staging evidence attached.

## Daily synchronization

Send Yazan a short update each day: **contract needed / mock ready / UI ready for endpoint /
error-state gap / E2E result / blocked decision**. Raise a blocker immediately if a missing
API/security decision would force frontend behaviour to be guessed.
