# Senior Architecture Review and Revised Production Plan

**Reviews:** `Yazan-Alaa-Production-Delivery-Plan.docx` and
`Gap-Analysis-and-Plan-Corrections.md`  
**Code baseline checked:** `codex/tenant-transition` at `f82fcae`  
**Date:** 13 August 2026  
**Status:** Architecture recommendation — proposed for Yazan and Alaa approval  
**Author perspective:** Senior system architecture review

---

## 1. Executive decision

The original production plan remains the governing delivery document. The gap analysis is
high quality and should be adopted as a correction package, but not without the amendments
in this review.

The project is not production-ready today. The largest blockers are not visual polish or
feature count. They are:

1. Public order creation is vulnerable to automation and operational abuse.
2. Tenant isolation is transitional and still depends too heavily on application code.
3. There is no API, database, migration, component, security, or end-to-end test harness.
4. Errors, requests, and frontend crashes cannot be correlated reliably in production.
5. Production infrastructure still lacks durable uploads, shared rate limiting, proven
   backup/restore, and measurable service-level indicators.
6. Mobile retry and reconnection behavior can produce stale state or duplicate writes unless
   order persistence and idempotency are designed explicitly.

The correct path is a **12-week production program**, with a limited pilot before general
availability. Dates may move when a gate fails; security, isolation, data integrity, backup,
and rollback gates must never be waived.

### Architecture ruling

- **Adopt with correction:** E1, E3, G1, G2, G3, G9, S1.
- **Adopt as written or with only wording changes:** E2, E4, G4, G5, G6, G7, G8, G10,
  S2, S3, D1.
- **Add:** idempotency, session lifecycle, database-enforced tenant integrity, order abuse
  controls, realtime recovery, CI/security automation, data lifecycle, disaster recovery
  objectives, and production ownership.
- **POS disposition:** park the POS schema with an Architecture Decision Record (ADR); do not
  drop it during the QR Release 1 program.

---

## 2. Review of the existing gap analysis

| ID | Architecture disposition | Required correction or action |
|---|---|---|
| E1 | Adopt with correction | A centralized HTTP wrapper exists, but a genuinely typed API boundary does not. Upgrade it; do not describe the work as only cleanup. |
| E2 | Adopt | `User.password_hash` is authoritative. Remove the transitional `Admin.password` write and column together in the contract phase. |
| E3 | Adopt with factual correction | There are **two test files containing five passing unit test cases**, not two tests. The important gap—no integration or E2E coverage—is valid. |
| E4 | Adopt | Record the POS disposition before M1 closes. Choose **Park**, not Drop. |
| G1 | Adopt and expand | The public order route is abuse-prone. A token issued by another unrestricted public endpoint is not sufficient by itself. Implement capability security plus abuse controls and idempotency. |
| G2 | Adopt with severity nuance | Fix eviction immediately. Treat as P1 during development and a P0 launch blocker if an unbounded implementation remains publicly deployed. |
| G3 | Adopt with data-model correction | Add direct tenant ownership to aggregate roots; avoid blindly duplicating `organization_id` on every child row. Add database constraints and isolation tests. |
| G4 | Adopt | Centralize safe errors, but preserve explicit operational errors through typed server error classes/codes—not arbitrary `err.message`. |
| G5 | Adopt | Add request IDs and structured request logs in M1, before risky migrations and order work. |
| G6 | Adopt | Add separate customer and admin error boundaries, recovery UI, and hosted reporting later. |
| G7 | Adopt | Add `ApiError` with status, safe code, request ID, and retry metadata. Add typed request/response contracts. |
| G8 | Adopt | Centralized redaction is mandatory. Do not log authorization headers, secrets, passwords, free-text notes, or full bodies. |
| G9 | Adopt with security correction | Share HTTP infrastructure, but retain separate Restaurant and SuperAdmin session contexts and token storage namespaces. |
| G10 | Adopt | Add pagination and bounded filters before pilot-scale data accumulates. |
| S1 | Adopt with sequencing correction | Do not move the entire 2,470-line server first. Establish tests, then extract the domains being changed incrementally. |
| S2 | Adopt | Basic telemetry belongs in M1; hosted dashboards and alerting remain in M3. |
| S3 | Adopt | Use a 12-week baseline. A 10-week promise is only valid with written scope cuts. |
| D1 | Adopt and expand | Add the decisions in this review to the decision log and close release-blocking decisions before implementation depends on them. |

---

## 3. Corrected wording for disputed findings

### 3.1 E1 — frontend API boundary

Use this wording:

> The frontend has a centralized API transport wrapper in `src/services/api.ts`, but it is
> not yet a complete typed API boundary. It loses HTTP status and request metadata, returns
> effectively unvalidated response values, and is bypassed by the SuperAdmin service. Delete
> stale files, introduce typed request/response contracts and `ApiError`, and move both
> Restaurant and SuperAdmin traffic onto shared transport infrastructure while preserving
> separate session contexts.

Acceptance criteria:

- `ApiError` contains `status`, stable `code`, `requestId`, and optional `retryAfter`.
- Callers can distinguish network, authentication, authorization, validation, conflict,
  rate-limit, and server errors without parsing messages.
- 401 triggers the correct session-expiry flow; 403 renders access denied; 409 preserves
  conflict context; retry logic is limited to safe/transient failures.
- SuperAdmin and Restaurant tokens are never selected interchangeably.
- New endpoints have explicit TypeScript request and response types.

### 3.2 E3 — test baseline

Use this wording:

> The baseline is five passing pure unit test cases across two files. There are no HTTP API,
> database integration, migration, component, tenant-isolation, security, performance, or
> end-to-end tests. Test infrastructure must begin in M0/M1 and grow with each change; M4 is
> for regression and defect closure, not for creating all test capability from zero.

### 3.3 G1 — public order security

Use this wording:

> Public ordering is intentionally anonymous but must be abuse-resistant and capability-
> scoped. The server must never trust `adminId`, `organizationId`, table identity, price, or
> totals from the request. A dine-in session must derive restaurant and table ownership from
> a high-entropy, revocable QR capability. Takeaway must use a separately approved anonymous
> entry policy. All creation attempts are subject to idempotency, bounded rate limits,
> restaurant/table velocity controls, and audit-safe rejection telemetry.

Important distinction: a signed JWT proves that the server issued a claim. It does **not**
prove customer presence if any anonymous caller can obtain it with predictable inputs.

### 3.4 G2 — rate limiter

Required two-stage correction:

1. **M1:** bounded local limiter with expiry cleanup, a hard entry cap, correct proxy/IP
   configuration, and deterministic tests.
2. **M3:** shared production limiter using Redis or an equivalent managed store, with limits
   by IP, session/capability, organization, table, and route category.

Do not rely on process RSS as the only test. Verify bucket expiry, bounded map size, reset
behavior, and `Retry-After` deterministically with controlled time.

### 3.5 G3 — tenant ownership for modifiers and combos

Tenant identity should normally be stored on aggregate roots, not copied onto every row.

Recommended model:

- `ModifierGroup.organization_id` is required and indexed.
- `ModifierOption` inherits ownership from `ModifierGroup`.
- `ComboGroup` may inherit from its parent `Menu`; add `organization_id` only if direct
  filtering, row-level security, or measured query performance requires it.
- `ComboGroupItem` inherits through `ComboGroup`.
- Cross-organization links between menus, modifier groups, and child menu items must be
  prevented by database constraints where practical and always verified in the service.

If PostgreSQL row-level security is selected, denormalizing `organization_id` onto more
tables may be justified. That must be an explicit ADR, with consistency constraints and
backfill verification—not an automatic rule.

### 3.6 G9 — SuperAdmin authentication

Consolidate shared mechanics, not privileges.

- Shared: API transport, error parsing, request ID extraction, retry policy, token interface.
- Separate: token namespaces, session providers, route guards, audiences, lifetimes, logout,
  and authorization policies.
- SuperAdmin tokens must include an explicit platform audience/purpose.
- Restaurant tokens must not authorize platform routes under any condition.
- SuperAdmin should receive shorter sessions and stronger authentication before external
  production administration is enabled.

### 3.7 S1 — modularization

Do not begin with one repository-wide route-movement PR. Use this order:

1. Establish API integration tests around the current behavior.
2. Add shared error, request-context, validation, and authorization primitives.
3. Extract only the domain being changed—first auth/tenant and orders.
4. Apply the security or integrity change inside that module.
5. Continue extracting catalog, tables, promotions, analytics, uploads, and SuperAdmin in
   later reviewable PRs.

Each extraction PR must avoid behavior changes and must pass characterization tests.

---

## 4. Additional gaps that must be added

### A1. Order idempotency — P0

Mobile reconnection, browser restoration, slow networks, user double taps, and automatic
retries can submit the same order more than once. Rate limiting does not solve this.

Implement:

- Client-generated idempotency key per checkout attempt.
- Database record or unique constraint scoped to organization/session/key.
- Same key + same payload returns the original result.
- Same key + different payload returns `409 IDEMPOTENCY_CONFLICT`.
- A bounded retention policy for idempotency records.
- UI disables duplicate submission but does not rely on the UI for correctness.

Acceptance test: kill or delay the response after commit, retry the same request, and prove
that only one order and one promotion usage mutation exist.

**Owner:** Yazan backend/database; Alaa client lifecycle.  
**Milestone:** M2, mandatory exit gate.

### A2. Session lifecycle and token hardening — P0

The plan needs a complete session policy, not only login validation.

Decide and implement:

- Token issuer, audience, purpose, subject, organization, membership, role, and expiry.
- Membership suspension/role-change behavior for already-issued tokens.
- Restaurant, SuperAdmin, order-tracking, table-session, and socket token separation.
- Secret/key rotation and incident revocation procedure.
- Login throttling, password reset, logout semantics, and expired-session UX.
- Whether browser sessions remain in `localStorage` for Release 1 or move to secure,
  `HttpOnly`, `SameSite` cookies. Record the threat model either way.
- Re-authentication or MFA requirement for sensitive SuperAdmin actions.

**Owner:** Yazan policy/server; Alaa session UX.  
**Milestone:** policy in M0, critical enforcement in M1/M2.

### A3. Database-enforced tenant integrity — P0

Filtering by tenant only in Express handlers is too fragile for a multi-tenant system.

Add:

- Required `organization_id` on tenant aggregate roots after backfill verification.
- Tenant-aware unique constraints such as `(organization_id, code)` where relevant.
- Composite ownership constraints where they materially prevent cross-tenant references.
- Migration verification queries that fail on orphaned or mismatched ownership.
- A deliberate decision on PostgreSQL row-level security for high-risk tables.
- A database role policy that prevents the application from bypassing RLS if RLS is used.
- Cross-tenant negative tests for every read, update, delete, and relation-link path.

RLS is not automatically required for Release 1, but it must be evaluated and the decision
recorded. If it is deferred, service-level tenant guards and database constraints become
mandatory compensating controls.

**Owner:** Yazan.  
**Milestone:** M1, mandatory tenant-transition gate.

### A4. Public ordering abuse controls — P0

Table capability tokens are only one layer. Add:

- High-entropy QR capability, rotation, revocation, and disabled-table behavior.
- Limits by IP, table session, table, organization, and time window.
- Maximum active/open orders per table or session.
- Duplicate basket detection and idempotency.
- Restaurant emergency switch to pause online ordering.
- Controlled behavior when the kitchen is closed or overloaded.
- Audit events and metrics for rejected order attempts without recording sensitive bodies.
- CAPTCHA/challenge or verified-contact option for anonymous takeaway, based on the product
  decision.

**Owner:** Yazan safeguards; Alaa customer/admin states.  
**Milestone:** M2.

### A5. Realtime recovery and mobile lifecycle — P0

Socket events improve freshness but must not be the source of truth. Mobile browsers may
suspend or kill tabs at any time.

Implement:

- Persist the order ID and tracking credential deliberately with documented expiry.
- On `visibilitychange`, reconnect, or network recovery, refetch authoritative order state.
- Make status events versioned or monotonic so stale events cannot move an order backwards.
- Display explicit loading, reconnecting, expired-link, offline, and unavailable states.
- Do not clear the last known order status merely because a socket disconnected.
- Test background/foreground, expired token, server restart, network loss, and duplicate
  event delivery on real iOS Safari and Android Chrome.

**Owner:** Alaa frontend; Yazan status contract/socket authorization.  
**Milestone:** M2.

### A6. CI and supply-chain controls — P1

Add a protected pull-request pipeline that runs:

- Dependency install from lockfile.
- Prisma formatting/validation and migration checks.
- Lint and TypeScript/build checks.
- Unit, API integration, and tenant-isolation tests.
- E2E smoke tests against an isolated test database.
- Dependency vulnerability and secret scanning.
- Container or deployment artifact build when that becomes the release unit.

Require passing checks and one review for normal PRs; require both owners for migrations,
auth, tenant, payments/POS schema, destructive data work, and production configuration.

**Owner:** Yazan pipeline; both maintain tests.  
**Milestone:** M1.

### A7. Data lifecycle and privacy — P1

Define:

- What customer/order data is collected and why.
- Retention for orders, audit events, logs, uploads, idempotency records, and backups.
- Restaurant data export and deletion workflow.
- How deletions propagate to object storage and eventually expire from backups.
- Who can access production data and logs.
- Whether free-text notes may contain personal or sensitive information.

**Owner:** Yazan technical enforcement; both approve policy.  
**Milestone:** decision M1, implementation M3.

### A8. Recovery objectives and operational ownership — P1

Backups are not enough. Define:

- Recovery Point Objective (RPO): maximum acceptable data loss.
- Recovery Time Objective (RTO): maximum acceptable service restoration time.
- Database backup, point-in-time recovery, and restore schedule.
- Object-storage versioning/retention policy.
- Incident severity levels, escalation channel, and who leads an incident.
- Release owner, rollback owner, and post-release monitoring window.

Recommended pilot targets: RPO at most 15 minutes and RTO at most 2 hours, subject to the
chosen infrastructure plan and cost.

**Owner:** Yazan operations; Alaa customer communication/status UI.  
**Milestone:** M3.

### A9. Contract/version compatibility — P1

Frontend and backend may be deployed at slightly different times. Define:

- Backward-compatible API changes during rolling releases.
- Stable machine-readable error codes.
- Database expand/backfill/verify/enforce/contract discipline.
- Release/build version exposed in health data and frontend diagnostics.
- Socket event versioning for payload changes.

**Owner:** Yazan contract; Alaa client compatibility.  
**Milestone:** M1 onward.

### A10. Accessibility and localization verification — P1

English and Arabic/RTL are core product modes, not cosmetic variants.

Require:

- Keyboard completion of admin workflows.
- Focus management for dialogs, drawers, and ordering customizers.
- Screen-reader labels and live announcements for validation/status changes.
- WCAG AA contrast for light and dark modes.
- Real Arabic content tests, RTL layout tests, and locale-safe currency/date formatting.
- Mobile viewport and zoom tests without clipped controls.

**Owner:** Alaa.  
**Milestone:** foundations M1/M2; full regression M4.

---

## 5. Target architecture for Release 1

```text
Customer Web / Restaurant Admin / SuperAdmin
                    |
          Typed API + session adapters
                    |
        Express domain routers/services
   +----------------+----------------+
   | request context | auth/roles     |
   | validation      | safe errors    |
   | idempotency     | audit/logging  |
   +----------------+----------------+
                    |
        Prisma transaction boundary
                    |
 PostgreSQL tenant constraints + migrations
        |                         |
 Durable object storage     Shared Redis controls
        |                         |
 Backups/PITR              rate limits/idempotency*

 Hosted error tracking + metrics + alerting
```

`*` Idempotency may be implemented in PostgreSQL for Release 1 if that provides stronger
transactional correctness. Redis must not be the only durable record of a committed order.

### Architectural boundaries

1. **Identity:** `User` represents a person/login.
2. **Tenant:** `Organization` represents the business account.
3. **Membership:** `OrganizationUser` carries role and membership state.
4. **Restaurant profile:** `Admin` remains a transitional restaurant profile/compatibility
   record, not an identity.
5. **Branch:** operational location under an organization.
6. **Tenant-owned aggregates:** orders, menus/catalog roots, tables, promotions, uploads,
   audit events, and relevant settings carry direct organization ownership.
7. **Public capability:** table/order tokens authorize only one narrowly defined public
   action; they are not restaurant-user sessions.
8. **Platform administration:** SuperAdmin is a separate security audience and route space.

---

## 6. Priority model

### P0 — blocks pilot or production

- Cross-tenant access or inconsistent tenant ownership.
- Public order abuse without bounded controls.
- Duplicate order risk without idempotency.
- Unsafe session or capability authorization.
- Destructive/unrehearsed migration or inability to restore.
- Non-durable production uploads.
- Unbounded memory/resource behavior on public routes.
- Raw secret or sensitive-data exposure.
- Core customer order flow failing after mobile resume/reconnect.

### P1 — required before general availability

- API/integration/E2E coverage of critical journeys.
- Structured logs, error tracking, service metrics, and alerts.
- Pagination/bounded list endpoints.
- Accessibility and RTL acceptance.
- Data retention/export/deletion controls.
- CI security and protected release workflow.
- Measured performance against agreed targets.

### P2 — may follow pilot with written acceptance

- SuperAdmin UI refinements that do not affect authorization.
- Broader server modularization outside actively changed domains.
- Non-critical analytics refinements.
- Additional visual polish beyond accessibility/usability defects.

---

## 7. Revised 12-week milestone plan

### M0 — alignment and development safety (Week 1)

**Yazan**

- Approve ADR format and document tenant, POS Park, session, and public-order decisions.
- Create isolated test database strategy, seed/fixture conventions, and migration-test path.
- Add HTTP integration test harness and initial authentication characterization tests.
- Define stable server error contract and request-context design.

**Alaa**

- Install/configure the E2E runner and create the first customer/admin smoke tests.
- Inventory critical flows, loading/error/empty states, RTL, and mobile breakpoints.
- Delete stale frontend files and prepare the typed API-error design.

**Exit gate**

- CI can build and run unit plus initial API/E2E smoke tests against isolated data.
- Release boundary and ten required decisions are recorded.
- No developer depends on a shared mutable local database for automated tests.

### M1 — tenant, auth, error, and observability foundation (Weeks 2–3)

**Yazan**

- Add request IDs, structured request logs, safe errors, and centralized redaction.
- Bound the local rate limiter and test eviction/cap behavior.
- Extract auth/tenant routes incrementally behind characterization tests.
- Complete tenant phase 2 using expand/backfill/verify/enforce discipline.
- Add aggregate-root ownership and tenant-aware database constraints.
- Remove the transitional `Admin.password` write/column only in the contract phase.

**Alaa**

- Introduce typed `ApiError` and typed API contracts for critical routes.
- Add separate customer/admin error boundaries and session-expiry states.
- Preserve separate SuperAdmin and Restaurant session contexts on shared transport.
- Add tenant/role-aware frontend guards and negative UI tests.

**Exit gate**

- Cross-tenant read/write/link/delete tests pass.
- Errors return safe codes and request IDs; logs correlate without sensitive data.
- Migration rehearsal succeeds on a production-shaped copy.
- No authentication path reads `Admin.password`.

### M2 — trustworthy complete order cycle (Weeks 4–5)

**Yazan**

- Implement high-entropy table capability sessions and approved takeaway policy.
- Derive tenant/table identity server-side and reject mismatches.
- Add order idempotency and transactionally correct promotion/order mutations.
- Add multi-dimensional abuse controls and ordering pause/capacity rules.
- Version/validate order transitions and authorize realtime rooms/events.

**Alaa**

- Implement retry-safe checkout using one idempotency key per attempt.
- Add explicit pending, committed, failed, conflict, offline, and retry states.
- Restore authoritative order state after mobile resume/reconnect.
- Complete customer/admin/KDS order journeys in English, Arabic, LTR, and RTL.

**Exit gate**

- Anonymous arbitrary restaurant IDs cannot create orders.
- Replayed checkout creates exactly one order.
- Tenant A capabilities cannot affect Tenant B.
- Order status survives refresh, background/foreground, reconnect, and server restart.
- Real iOS Safari and Android Chrome evidence is attached.

### M3 — production infrastructure and operations (Weeks 6–8)

**Yazan**

- Move uploads to durable object storage with ownership and safe deletion.
- Move rate limits to a shared production store.
- Create staging and production isolation with separate databases/secrets/storage.
- Enable hosted errors, metrics, dashboards, alerts, and release identification.
- Configure backups/PITR and rehearse restore against written RPO/RTO.
- Add pagination, filter bounds, and query/index measurement.
- Implement data retention and operational runbooks.

**Alaa**

- Connect frontend error reporting with route/release/request correlation.
- Build diagnostics users can report without exposing sensitive information.
- Complete resilient upload UI, pagination UX, and production failure states.
- Execute accessibility and RTL remediation continuously.

**Exit gate**

- Staging is production-like and cannot access production data.
- Restore rehearsal meets approved RPO/RTO.
- No upload depends on ephemeral application disk.
- Alerts fire from controlled failures and link to actionable runbooks.
- Warm API p95 and error-rate targets are measured, not estimated.

### M4 — hardening and release candidate (Weeks 9–10)

**Both**

- Run complete unit, API, integration, migration, tenant, security, E2E, accessibility,
  performance, browser, and device regression.
- Fix all P0/P1 defects; document accepted P2 risks with owner and date.
- Perform deployment, rollback, restore, secret-rotation, and incident simulations.
- Freeze schema except for release-blocking corrections.

**Exit gate**

- No open P0/P1 defects.
- All critical journeys have repeatable evidence.
- Performance, accessibility, tenant isolation, backup, and rollback gates pass.

### M5 — controlled pilot (Week 11)

- Onboard a small named cohort, not general public traffic.
- Provide a staffed support and release window.
- Monitor order completion, error rate, latency, abuse rejections, and support contacts.
- Hold daily pilot review and stop/rollback when thresholds fail.
- Make only controlled fixes with regression evidence.

### M6 — production launch (Week 12)

- Final Go/No-Go signed by both owners.
- Deploy during a staffed window with rollback owner assigned.
- Verify migrations, health, login, public menu, order creation/tracking, uploads, and alerts.
- Monitor intensively through the agreed stabilization period.
- Publish an incident review for any customer-impacting event.

---

## 8. Ownership and review boundaries

### Yazan — accountable for platform correctness

- Tenant/data architecture and Prisma/PostgreSQL migrations.
- Authentication, authorization, session/capability policy, and server security.
- Backend domains, transaction integrity, idempotency, and realtime authorization.
- Infrastructure, environments, backups, observability, release, rollback, and incidents.
- API contracts from the server perspective and database performance.

### Alaa — accountable for product correctness

- Customer, restaurant-admin, and SuperAdmin user experiences.
- Typed frontend integration, session states, error/offline/recovery behavior.
- Responsive design, mobile lifecycle, accessibility, Arabic/RTL, and browser compatibility.
- E2E journeys, visual/functional regression, and release evidence.

### Both — shared accountability

- Scope, critical journey acceptance, product/security decisions, and Go/No-Go.
- Every migration/auth/tenant/order-contract PR receives cross-review.
- The author does not approve their own high-risk change alone.
- A feature is incomplete until tests, telemetry, failure behavior, and rollback are included.

---

## 9. Required decisions before M1 closes

1. Single-branch or multi-branch Release 1 UX.
2. User invitation and first-credential flow.
3. Customer/order data retention, export, and deletion promise.
4. Object storage, shared limiter, error tracking, email, and logging providers.
5. Real launch subscription limits versus hidden future billing behavior.
6. Pilot cohort, support channel, staffed window, and rollback threshold.
7. Order-tracking token lifetime, expiry UI, and recovery behavior.
8. Takeaway entry and anti-abuse policy.
9. POS schema disposition: **recommended Park**.
10. Log contents, access, and retention.
11. Browser session storage strategy and accepted threat model.
12. PostgreSQL RLS adoption or documented compensating controls.
13. RPO/RTO and infrastructure budget capable of meeting them.
14. Restaurant ordering pause/capacity behavior.
15. SuperAdmin MFA/re-authentication requirement and session duration.

Unresolved decisions that block a safe implementation delay the milestone; engineers must
not silently choose product or security policy inside code.

---

## 10. POS Architecture Decision Record recommendation

**Decision:** Park POS schema for Release 1.

**Reasoning:**

- POS is outside the QR production release boundary.
- Existing empty/dormant tables create less risk than a destructive removal and future
  recreation cycle.
- The long-term product direction still includes restaurant management/POS.
- Production code must not depend on, expose, or mutate parked POS models.

**Controls:**

- Mark POS models and migrations as intentionally dormant in an ADR.
- No POS route, UI, migration, or relation change enters this program without explicit scope
  approval.
- Include parked tables in backup/restore and migration compatibility checks.
- Reassess the model in a dedicated POS architecture phase after QR Release 1 stabilizes.

---

## 11. Production Go/No-Go checklist

Production is **No-Go** if any answer below is “no”:

- Are tenant boundaries enforced and proven for reads, writes, links, sockets, and exports?
- Can public ordering resist predictable-token, replay, flood, and duplicate-submit abuse?
- Does one checkout attempt create exactly one committed order?
- Can the latest production database and uploads be restored within RPO/RTO?
- Are migrations forward-safe, backward-compatible during rollout, and rehearsed?
- Are all secrets externalized, scoped, rotated where required, and absent from logs/builds?
- Are production uploads durable and ownership-protected?
- Do critical customer/admin flows pass on supported browsers, mobile devices, English, and
  Arabic/RTL?
- Are errors, latency, order outcomes, and resource health measurable with actionable alerts?
- Are there zero open P0/P1 defects?
- Is rollback tested and is one named person authorized to execute it?
- Is the pilot evidence acceptable to both Yazan and Alaa?

---

## 12. Immediate next actions

Execute in this order:

1. Yazan and Alaa review and sign this architecture position.
2. Correct E1 and E3 wording in the gap-analysis document.
3. Merge the accepted corrections into a version 1.1 production plan.
4. Create ADRs for tenant enforcement, POS Park, session/token classes, public ordering,
   idempotency, and RLS.
5. Create milestone tickets with one accountable owner, reviewer, evidence, and acceptance
   gate per deliverable.
6. Build the isolated test/CI foundation before broad refactoring.
7. Begin M1 with request context/error primitives and incremental auth/tenant extraction.
8. Do not expose Release 1 to real restaurant traffic until M2 and M3 gates pass in staging.

---

## 13. Sign-off

Signing means accepting the priorities, ownership, release gates, and the rule that gates are
not waived to preserve a date.

| Owner | Decision | Date | Notes |
|---|---|---|---|
| Yazan |  |  |  |
| Alaa |  |  |  |

**Final principle:** move quickly by keeping the system safe, testable, observable,
recoverable, and releasable after every milestone. Production readiness is part of the
product—not a final cleanup phase.
