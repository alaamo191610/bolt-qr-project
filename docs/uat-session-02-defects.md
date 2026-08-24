# UAT session 02 — defect report

**Track:** UAT (ALAA) · **Environment:** local, tenants Alpha and Beta
**Build:** branch `codex/api-response-typing` @ `e9edb19`
**Fixtures:** `npm run seed:uat` · **API:** :3001 · **Web:** :5173 · **DB:** local `qr_uat`

Continues [uat-session-01-defects.md](uat-session-01-defects.md). Defect numbering carries on
from D-05.

---

## D-06 · S1 Critical · Any staff account has full owner powers over the restaurant

**Cases:** A-27 (P0) · proves Y-13 (P0, QA track) · blocks J-05 (P0 gate)
**Status:** Confirmed against the API with a real STAFF session token.

`requireOrganizationRole` exists in `server/accessControl.js`, is unit-tested in
`tests/accessControl.test.js`, and is wired onto **3 of the 32** mutating tenant routes.
Everything else accepts any authenticated member of the organization regardless of role.

**Guarded (3)**

```
POST   /api/organization/members
PATCH  /api/organization/members/:userId
PUT    /api/branches/:branchId/ordering-state
```

**Unguarded (26, excluding the 3 auth routes that correctly have no role guard)**

```
POST   /api/menus                        PUT    /api/admin/profile
PUT    /api/menus/:id                    PUT    /api/admin/pricing
DELETE /api/menus/:id                    PUT    /api/admin/billing
DELETE /api/admin/reset-menu             POST   /api/promotions
POST   /api/menus/:id/ingredients        PUT    /api/promotions/:id/active
POST   /api/menus/:id/modifiers          PUT    /api/admin/settings/order-rules
POST   /api/menus/:id/combos             PUT    /api/admin/settings/kds-prefs
POST   /api/categories                   PUT    /api/admin/theme
POST   /api/ingredients                  POST   /api/upload
POST   /api/orders                       DELETE /api/upload/:filename
PUT    /api/orders/:id/status            POST   /api/tables
POST   /api/tables/:id/capability/rotate PUT    /api/tables/:id
DELETE /api/tables/:id/capability        DELETE /api/tables/:id
```

**Executed with a STAFF token, all returned 200 and all persisted**

| Action | Endpoint | Result |
|---|---|---|
| Create a live 90% discount code | `POST /promotions` | Persisted as `STAFFHACK`, `active=true` |
| Rename the restaurant | `PUT /admin/profile` | Name became `RENAMED BY STAFF` |
| Set a menu item price to 0.01 | `PUT /menus/:id` | Applied |
| Delete a menu item | `DELETE /menus/:id` | Deleted |
| Create a table | `POST /tables` | Created |
| Rotate a table's QR capability | `POST /tables/:id/capability/rotate` | Printed QR invalidated |
| Delete a table's capability | `DELETE /tables/:id/capability` | Table can no longer be ordered from |
| **Wipe the entire menu** | `DELETE /admin/reset-menu` | Alpha went from 18 items to 0 |

**Impact.** A waiter account can mint discount codes and redeem them, rewrite prices, change
the restaurant identity every guest sees, invalidate every printed QR code in the venue, and
destroy the whole menu mid-service. This is direct revenue theft plus a denial of service on
the restaurant's own operation.

**Repro**
1. `npm run seed:uat`
2. `POST /api/auth/login` with `staff.alpha@test.local` / `UatPass!234`, keep the token.
3. `POST /api/promotions` with `{"code":"STAFFHACK","type":"percent","value":90,"active":true}` and the STAFF bearer token.
4. `select code, value, active from promotions where code='STAFFHACK';` — the row exists.

**Fix direction.** Decide the role matrix per endpoint and apply `requireOrganizationRole`
to all 26. `DELETE /admin/reset-menu` deserves OWNER plus a confirmation step regardless of
role. Note this cannot be caught by the current tests: `tests/accessControl.test.js` proves
the middleware works in isolation, but nothing asserts that it is actually mounted on the
routes, so the suite stays green while the API is wide open.

---

## D-07 · S2 Major · Staff see the full Admin panel and are labelled "Admin"

**Case:** A-27 (P0)
**Status:** Confirmed in the UI.

Signed in as `staff.alpha@test.local`, the workspace navigation shows:

`QR Codes · Digital Menu · Orders · Tables · Analytics · Admin`

`Team` is correctly hidden, but `Admin` is not. Opening it gives a STAFF user the full
**Admin Panel**: restaurant name, phone, address, logo upload, Order Workflow rules,
**Pricing & Currency**, **Promotions**, and KDS Settings.

The account badge in the header also reads **Admin** for a STAFF member, so the interface
tells a waiter they are an administrator.

This is the UI half of D-06. Hiding the tab is not a fix on its own; the endpoints behind it
must be guarded first.

---

## D-08 · S3 Moderate · A lapsed subscription is reported as a missing membership

**Cases:** A-16, A-29 · customer-facing half of Y-16
**Status:** Confirmed.

`resolveTenantSession` in `server/tenantSession.js` returns `null` for two unrelated reasons:
no active membership was found, and `hasRestaurantAccess(admin)` failed because the
subscription lapsed. The login handler collapses both into one response:

```
403  No active restaurant membership is available
```

Signing in as `owner.beta@test.local` with the correct password produces that message, even
though the membership row is `OWNER` / `ACTIVE`. The real cause is Beta's `CANCELLED`
subscription with an end date in the past.

An owner locked out at service time is told their membership does not exist, with no mention
of the subscription, no renewal path, and nothing to act on. Failing closed is correct; the
message is not.

**Expected:** distinguish the two cases and give the lapsed-subscription owner an actionable
message and a route to renew.

---

## D-09 · S4 Minor · Confirmation dialogs are not exposed as dialogs

**Case:** A-33
**Status:** Confirmed.

The order status confirmation ("Update Status? Are you sure you want to mark Order #1 as
preparing?") is a plain fixed-position `<div>`. There is no `role="dialog"`, no
`aria-modal="true"`, and no accessible name, so assistive technology does not announce that a
modal opened or that focus is scoped to it. Same pattern as the QR regeneration dialog.

Adds to D-02 and D-05 from session 01. The dialogs read and behave correctly for sighted
mouse users.

---

## Passed this session

| Case | Result |
|---|---|
| **A-14** Order status progression | Pass. `pending → preparing` persisted, `version` 1→2. Backward (`preparing → pending`) and skip-ahead (`preparing → served`) both rejected `409 CONFLICT`; an invalid enum returned `400 VALIDATION_ERROR`. |
| **A-16** Restaurant login and logout | Pass. Wrong password and a non-existent account return the identical `Invalid email or password`, so accounts cannot be enumerated. See D-08 for the lapsed-subscription message. |
| **A-17** Admin navigation | Pass. Single-line desktop navigation, all tabs resolve. |
| **A-18** QR Studio generation | Pass, and strong. Regeneration warns that printed codes will stop working, bumps `version` 1→2, and the previous capability immediately returns `403 TABLE_SESSION_INVALID`. |
| **A-23** Order management | Pass. Correct per-tenant orders, status counters, and totals; status actions are contextual to the current state. |

**Capability negative matrix (supports A-18, and Y-06 on the QA track).** Revoked, malformed,
empty, `null`, numeric, object, SQL-ish, and 5000-character capabilities all returned an
identical `403 TABLE_SESSION_INVALID` with a request ID and no detail leakage, while the
untouched control table still exchanged successfully.

---

## Progress against the UAT track

Executed so far: **12 of 43**.

- Pass: A-03, A-04 (mouse only), A-11, A-14, A-16, A-17, A-18, A-23
- Fail: A-09 (D-01), A-27 (D-06, D-07), A-32 (D-02), A-33 (D-02, D-05, D-09)
- Partial: A-02

Not yet run: A-01, A-05, A-06, A-07, A-08, A-10, A-12, A-13, A-15, A-19, A-20, A-21, A-22,
A-24, A-25, A-26, A-28, A-29, A-30, A-31, A-34, A-35, A-36, A-37, A-38, and the five
business-acceptance cases A-39 to A-43, which need real staff and real devices rather than a
test harness.

## Release view

D-06 alone is a No-Go. A-27 is a P0 case and the plan's exit criteria require every P0 to
pass and zero open authorization defects at any severity. It also fails the joint gate J-05
and, on the QA track, Y-13.
