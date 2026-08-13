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
| Journey/state inventory | Map customer, admin, team, and SuperAdmin success/loading/empty/validation/permission/offline/failure states. | Prioritized UI backlog shared with Yazan. |
| Typed API design | Define `ApiError` and request/response typing approach from Yazan’s draft contract. | Types/mocks compile independently of final server implementation. |
| Cleanup | Delete stale schema/hook files and confirm the client build stays clean. | Build and repository search evidence. |

### A1 — M1 frontend safety and tenant UX (Weeks 2–3)

| Task | Frontend scope | Required test / Yazan handoff |
|---|---|---|
| Shared API transport | Implement typed request/response adapters and `ApiError(status, code, requestId, retryAfter)`. | Unit tests parse network/401/403/409/429/5xx contracts. |
| Separate session contexts | Reuse transport but keep Restaurant and SuperAdmin token namespaces, providers, guards, expiries, and logout flows separate. | Restaurant token cannot appear in platform requests; use Yazan’s audience/session contract. |
| Failure containment | Wrap customer menu and admin workspace in separate error boundaries; create recovery, retry, offline, expired-session, and access-denied states. | Component tests and screenshots for fallback states. |
| Tenant UX | Organization switcher, member/role UI, capability guards, and negative/forbidden states. | Owner/manager/staff scenarios against fixtures/HTTP test environment. |
| Accessibility/RTL foundations | Keyboard/focus/dialog primitives, labels/live regions, real Arabic fixtures, responsive baseline. | Component/visual checks in EN + AR/RTL. |

### A2 — M2 reliable customer order journey (Weeks 4–5)

| Task | Frontend scope | Required test / Yazan handoff |
|---|---|---|
| Capability-aware ordering | Obtain and retain only the scoped table capability/session required for dine-in; never send/select restaurant identity from client state. | Invalid/expired/revoked capability UI uses backend error codes. |
| Retry-safe checkout | Generate one idempotency key per checkout attempt, disable accidental duplicate action, and preserve the key across safe retry. | Simulated timeout-after-commit creates one visible order. |
| Order recovery | Persist the minimum order/tracking state; on refresh, `visibilitychange`, online/reconnect, and socket reconnect, refetch the authoritative status. | Browser test plus real iOS Safari/Android Chrome evidence. |
| Status and failure UX | Pending, committed, conflict, validation, rate-limit, overloaded/paused, offline, reconnecting, expired-link, and server-error states. | E2E/visual evidence; no raw backend error messages exposed. |
| Core journey | Complete menu/customization/cart/promotion/tip/submit/confirmation/tracking in EN/AR and LTR/RTL. | Golden E2E on desktop/mobile; server totals displayed as authoritative. |

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
