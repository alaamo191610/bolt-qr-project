# UAT session 01 — defect report

**Track:** UAT (ALAA) · **Environment:** local, tenant Alpha (`Alpha Grill`)
**Build:** branch `codex/api-response-typing` @ `3235267`
**API:** http://localhost:3001 · **Web:** http://127.0.0.1:5173 · **DB:** local `qr_uat`
**Node:** 22.23.1 (project requires `>=20 <23`)

---

## D-01 · S1 Critical · Customer is shown a different total than the order records

**Case:** A-09 (P0) · also affects A-11
**Status:** Confirmed, reproduced twice with opposite drift directions.

The checkout applies the restaurant's `rounding` preference (`nearest-0.05`) at display
time only. `computeTotals` in `src/pricing/totals.ts` and the persisted order both keep
raw 2-decimal values. Nothing feeds the rounded figures back into the authoritative total,
so the amount the guest is told to pay is not the amount stored on the order.

| Order | Line | Shown to guest | Stored on order | Drift |
|---|---|---|---|---|
| #7 | VAT | 0.30 | 0.28 | +0.02 |
| #7 | Service charge | 0.15 | 0.16 | -0.01 |
| #7 | **Total to pay** | **2.05** | **2.04** | **+0.01** |
| #8 | VAT | 7.95 | 7.94 | +0.01 |
| #8 | Service charge | 4.50 | 4.52 | -0.02 |
| #8 | **Total to pay** | **57.60** | **57.61** | **-0.01** |

The drift changes sign between orders, so the restaurant both overcharges and undercharges
at random. On a cash order the waiter collects the displayed figure while the KDS, the
analytics, and the order record all hold a different one.

**Repro**
1. Seed tenant Alpha with `billing_settings = { vatPercent: 16, serviceChargePercent: 10, showVatLine: true, showServiceChargeLine: true }` and `pricing_prefs.rounding = 'nearest-0.05'`.
2. Scan the T-02 QR, add one Arabic Coffee (1.60), open the order.
3. Read the VAT, service charge, and Total to pay lines.
4. Place the order with **Pay with cash**.
5. `select subtotal, vat, service_charge, total from orders order by id desc limit 1;`

**Expected:** the stored total equals the total the guest was asked to pay.
**Actual:** they differ on every order, in either direction.

**Where to look:** `src/pricing/totals.ts` (`computeTotals` never applies `rounding`), and
whichever component formats the VAT / service / total lines for display.

---

## D-02 · S2 Major · Modifier options cannot be reached by keyboard or screen reader

**Case:** A-32 (P0), A-33 (P1) · also blocks A-04 for keyboard users
**Status:** Confirmed.

In the item customizer every modifier option is a plain `<div>`. There is no `<input>`,
no `<button>`, no `role`, and no `tabindex`. Measured inside the open modal for
**Mixed Grill**:

- Tabbable elements: **4** — Close, the note textarea, one unlabeled button, Add to Order.
- Modifier options reachable: **0 of 5** (Doneness: Medium / Well done; Extras: garlic paste / bread / chilli sauce).

DOM chain for an option row, showing no interactive element anywhere:

```
span.font-medium.text-slate-700
  ^ div.flex.flex-col
  ^ div.flex.items-center.gap-3
  ^ div.group.relative.flex.items-center
  ^ div.space-y-2
```

`Doneness` is a **required** group. A keyboard or screen reader user is silently locked
into whichever option carries `is_default` and cannot change it, cannot add extras, and
gets no announcement that a required choice exists.

Mouse behaviour is correct: 12.90 → 13.50 (+0.60 garlic) → 14.00 (+0.50 bread).
The defect is purely the missing semantics and focusability.

**Expected:** each option is a radio (single-select group) or checkbox (multi-select group),
focusable, labelled, and announced with its name, role, and checked state.

---

## D-03 · S3 Moderate · Customer menu ignores the category order the restaurant configured

**Case:** A-03, A-20
**Status:** Confirmed.

`GET /api/public/menus` uses `orderBy: { created_at: 'desc' }` and never reads
`Category.sort_order`, so the owner's ordering has no effect on the guest menu and items
appear newest-first.

Seeded order vs. rendered order:

| sort_order | Category | Position shown to guest |
|---|---|---|
| 1 | Mezze | 4th |
| 2 | From the Grill | 3rd |
| 3 | Sides | 2nd |
| 4 | Drinks | 1st |

Exactly reversed. A restaurant that puts starters first gets drinks first instead.

**Where to look:** the `/api/public/menus` handler in `server/index.js`.

---

## D-04 · S4 Minor · Debug logging left on the customer path

**Case:** A-02, supports Y-05
**Status:** Confirmed.

Loading the guest menu prints application internals to the browser console on every visit:

```
CustomerMenu: First item: {id: 17, name_en: Arabic Coffee, …}
CustomerMenu: Setting adminId: 0fd2c494-8e97-455e-81fa-45ea1693e129
```

Noise on a customer-facing surface, and it leaks the internal restaurant UUID into the
console. Should be removed or put behind a debug flag.

---

## D-05 · S4 Minor · Unlabelled controls on the menu and in the customizer

**Case:** A-33
**Status:** Confirmed.

The quick-add (`+`) button on every menu card and the quantity control in the customizer
expose no accessible name — they read as `button ""`. Screen reader users hear an unnamed
button next to each item.

---

## Not a defect — checked and cleared

- **Totals arithmetic.** VAT is charged on `subtotal + service charge`, which is why 16% of
  1.60 does not equal the VAT line. The formula in `computeTotals` is internally consistent.
  Only the display-vs-stored rounding (D-01) is wrong.
- **"Place order" appearing to do nothing.** It opens the payment-method step
  (cash / card machine / Visa-Mastercard marked coming soon). Working as designed.
- **Missing VAT and service lines on the first pass.** My fixture used invented
  `pricing_prefs` keys. The real contract is `src/pricing/types.ts`: fees live in
  `billing_settings` as `vatPercent` / `serviceChargePercent`. Fixture corrected.
- **Unavailable items.** `SOLD OUT` / `Temporarily unavailable` render correctly and the
  items stay visible rather than disappearing.

---

## Environment problems found while meeting the entry criteria

1. **Node version is out of range.** The machine runs v26.5.0; `package.json` requires
   `>=20 <23`. Used Homebrew `node@22` (v22.23.1) for this session. Relevant to Y-34.
2. **`.env` cannot run the app.** It is missing `JWT_SECRET`,
   `SUPER_ADMIN_MFA_ENCRYPTION_KEY`, `VITE_API_URL`, `CORS_ORIGINS`, and `PORT`, and its
   `DATABASE_URL` points at a live Supabase project alongside a real WhatsApp token.
   Testing against it would violate the plan's rule on production data, so this session used
   an isolated local `qr_uat` database.
3. **`VITE_API_URL` must end in `/api`.** The client appends `/api/...`-prefixed paths to it,
   and the in-code fallback is `http://<host>:3000/api`. Worth writing into `.env.example`.
4. **No seed script exists in the repo.** The plan's fixture sheet had to be built from
   scratch. The seeder written for this session is currently outside the repository.
5. **Plan entitlements are immutable in the database.**
   `admins_plan_entitlements_finite_check` pins `max_tables` / `max_menu_items` /
   `max_staff_accounts` to the plan: STANDARD 10/50/1, BASIC 25/150/3, PRO 500/2000/10.
   Fixtures cannot invent limits, so Alpha is BASIC (at its 3-staff ceiling) and Beta is
   STANDARD with a cancelled subscription.

---

## Security issue found outside the UAT scope

Commit `c7892d2` ("add whatsapp") committed `.env` with a real Supabase service role key,
a WhatsApp token, and a WhatsApp app secret. `.env` is gitignored today and is not in the
current tree, but the commit is still reachable on `origin/Alaa` and `origin/Alaa-v2`, so
the secrets remain in the pushed history.

This is not a UAT case. It needs credential rotation and a decision about rewriting that
history, and it should go to the QA lead rather than being tracked here.
