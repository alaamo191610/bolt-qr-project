# D1 Decision Log

**Companion to:** `Production-Execution-Plan.md`, `Gap-Analysis-and-Plan-Corrections.md`
**Status:** Decided by Alaa on 14 August 2026. Awaiting Yazan's sign-off before M1 closes
(both owners must accept per `Gap-Analysis-and-Plan-Corrections.md` Part 6, step 0).

These are the four decisions the gap analysis flagged as missing from the plan's original
pre-M1 decision list (D1). Recording them here unblocks step 0 and step 8 of the execution
sequence — step 8 (bounded public order creation, G1) is the plan's own automatic No-Go item
and cannot start implementation until the takeaway decision below is signed off.

---

## D1.1 — Order-tracking token lifetime

**Decision:** 6 hours. No refresh endpoint.

**Reasoning:** The existing 24-hour token (`server/index.js:1570`) is longer than any real
dine-in visit and sits in the customer's browser as a bearer credential with no revocation
path — that's exposure without a matching benefit. 6 hours comfortably covers a full dining
session plus slack, and skipping a refresh endpoint keeps the surface area small; nothing in
the product requires a customer to check order status the next day.

**What ships with this:** the frontend already has a backlog item (from the A0 journey
inventory) to build a clear "this tracking link has expired, please ask staff for your order
status" screen instead of a raw 401. That UI is required alongside this change, not optional.

**Owner:** Yazan implements the expiry (`server/index.js:1570`, change `expiresIn: '24h'` to
`'6h'`). Alaa ships the expired-link UI state.

---

## D1.2 — Takeaway ordering entry point

**Decision:** Disable takeaway ordering for Release 1. Dine-in only.

**Reasoning:** Dine-in has a clean proof-of-presence story: the QR code is physically fixed
to the table, so scanning it is the security-relevant action. Takeaway has no equivalent —
there is no physical gate between "anonymous internet request" and "order," which is exactly
the shape of the G1 unbounded-public-write problem. Rather than building a new mechanism
(per-restaurant token at menu load, CAPTCHA, etc.) speculatively, takeaway is parked until a
concrete approach is designed and reviewed. This unblocks the dine-in fix (G1/step 8)
immediately without waiting on a harder, still-open design problem.

**What changes:** the `type: 'take_away'` path in `POST /api/orders`
(`server/index.js:1237`) is removed or gated behind a feature flag that defaults off for
Release 1. Any frontend entry point for takeaway ordering is hidden accordingly.

**Revisit at:** M2/M3, once dine-in's table-session-token pattern is live and proven, as a
starting template for a takeaway-specific design.

**Owner:** Yazan (backend gate), Alaa (hide/remove any takeaway UI entry point).

---

## D1.3 — QR code stability and the table-session-token design

**Decision:** The physical QR code stays permanent. It continues to encode only the table's
static `code` (e.g. printed once, never regenerated for a restaurant to reprint stickers).
The 6-hour lifetime from D1.1 applies to the **session token minted when that QR is
scanned**, not to the QR code or its URL.

**Reasoning:** Restaurant owners set up a table's QR once; forcing them to reprint it
periodically is an operational cost with no security benefit, since the code itself
(`server/index.js:1687`) is not a secret — it's a table label. The actual fix for G1 is
already designed this way in the gap analysis: `GET /api/tables/public/:code` (existing,
`server/index.js:1735`) issues a signed, short-lived token bound to `{adminId, tableId}` at
scan time; `POST /api/orders` requires that token and derives the restaurant/table identity
from it rather than trusting the request body. The QR/table code stays exactly as it is
today. Only the order-creation flow changes.

**Owner:** Yazan. This is the implementation detail for G1/step 8, now unblocked by D1.2.

---

## D1.4 — POS schema disposition

**Decision:** Park. Keep the 11 dormant POS models (`Employee`, `PosRole`,
`EmployeeBranchRole`, `PosDevice`, `Register`, `TillShift`, `CashMovement`, `DiningSession`,
`Check`, `Payment`, `Refund`) in `server/prisma/schema.prisma` for future expansion.

**Reasoning:** POS is out of scope for Release 1 but may be built later; dropping the
models now would be irreversible without re-running the three already-applied POS
migrations, for zero present-day benefit. The cost of parking is that every future
migration and the M3 backup/restore rehearsal must account for these tables' FK graph.

**Required follow-up (from the gap analysis, still applies):** add a migration-review
checklist note so nobody edits these tables by accident, and make sure the M3 restore
rehearsal explicitly includes them so their presence is never a surprise at that gate.

**Owner:** Yazan.

---

## D1.5 — Log retention window and contents

**Decision:** 30-day retention. Logs pass through the redaction helper (G8: strip
`password`, `password_hash`, `token`, `authorization`, `note`/`notes` and similar sensitive
keys) before being written. Access restricted to Alaa and Yazan (or whoever is on-call),
not broadly available.

**Reasoning:** No regulatory driver names a specific retention period for this product. 30
days is enough to investigate "my order vanished last week"-style reports without turning
logs into an uncontrolled second copy of customer data.

**Owner:** Yazan, alongside G4/G5/G8 (centralized error handler, request IDs, redaction).

---

## Sign-off

| Owner | Accepts these decisions | Date |
|---|---|---|
| Alaa | | |
| Yazan | | |

Once both sign, update `Gap-Analysis-and-Plan-Corrections.md` Part 6 step 0 from
**Blocked** to **Done**, which unblocks step 8 (G1, bounded public order creation).
