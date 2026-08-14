# ADR 0004: Tenant ownership migration rehearsal and sequencing

Status: Implemented rehearsal, expand, backfill, and verification; enforcement blocked by decision/staging evidence

## Rehearsal evidence

The migration rehearsal applies every migration before
`20260813010000_tenant_identity_transition` to an isolated PostgreSQL database, seeds two
production-shaped legacy restaurant profiles with categories, menus, tables, orders, and
promotions whose branch/tenant fields are null, then applies the tenant transition SQL.

It verifies that each legacy admin receives exactly one organization, branch, user identity,
and active owner membership; every seeded child receives the expected branch link; and queries
scoped by one legacy admin cannot return the other admin's menu. The data-backfill statements
are replayed to verify `ON CONFLICT`/update behavior does not duplicate identities or
memberships. The test database is uniquely named and dropped after the run.

## Expand → backfill → verify → enforce → contract

The next tenant migration must use this sequence:

1. **Expand:** add nullable, indexed `organization_id` to aggregate roots only. Keep legacy
   `admin_id`/`user_id` compatibility columns and APIs during the transition. Add check/FK
   constraints only after existing data is measurable.
2. **Backfill:** derive ownership through the existing admin → organization relationship in
   one transaction or bounded batches. Record before/after counts and a list of unresolved,
   duplicate, or cross-organization links. Do not guess ownership for ambiguous rows.
3. **Verify:** block enforcement unless every in-scope root has exactly one active organization,
   every branch belongs to that organization, and all child links (category/menu/table/order/
   promotion) agree with the root. Run cross-tenant read/write/link/delete negative tests.
4. **Enforce:** make the new root ownership non-null, add composite ownership constraints where
   practical, and update service queries to scope by organization/branch context. Keep a
   rollback path that restores compatibility reads until the contract phase is accepted.
5. **Contract:** remove transitional writes and only then plan legacy column removal in a
   separate reviewed migration. Never combine destructive column removal with the first
   ownership backfill.

`ModifierGroup` is the next tenant-owned aggregate root. `ModifierOption` inherits ownership
through its group; combo children inherit through their parent menu/group unless a later RLS or
performance ADR explicitly justifies denormalization. POS tables remain parked and are included
in migration/recovery review but are not part of this Release 1 ownership change.

## Expand migration implemented — 14 August 2026

Migration `20260814090000_expand_tenant_ownership` adds nullable, indexed
`organization_id` columns and foreign keys with `ON DELETE SET NULL` to the seven aggregate roots:
`Category`, `Ingredient`, `Menu`, `Table`, `Order`, `Promotion`, and `ModifierGroup`.
Legacy `admin_id`/`user_id` and `branch_id` fields remain intact; this migration does not backfill,
make columns non-null, remove compatibility fields, or enforce composite tenant links.

Compatibility writes now populate organization ownership for authenticated category, ingredient,
menu, table, and promotion creation. Public order creation derives the organization from the
server-selected target admin. The rehearsal verifies all seven columns, legacy nullability,
foreign-key rejection, cross-tenant query boundaries, and rerunnable transition backfill behavior.

Rollback before backfill is limited to dropping the new indexes, foreign keys, and nullable columns
in a separately reviewed migration; no legacy data is deleted by the expand step.

## Bounded backfill implemented — 14 August 2026

Migration `20260814100000_backfill_tenant_ownership` fills the six admin-derived roots from the
existing `Admin.organization_id`: `Category`, `Ingredient`, `Menu`, `Table`, `Order`, and
`Promotion`. `ModifierGroup` ownership is derived only from its linked menus. The migration is
idempotent because it updates only null ownership values after validating existing values.

Before writing, the migration records unresolved rows in a temporary error set and aborts with a
check violation if an owner organization is missing, a branch belongs to another organization, a
modifier group is orphaned, or its linked menus resolve to multiple organizations. It therefore
does not guess ownership or silently repair cross-tenant data. The migration remains nullable and
does not add non-null or composite enforcement.

The rehearsal verifies fourteen legacy roots are backfilled with zero ownership mismatches, reruns the
backfill without duplication, and confirms a cross-tenant modifier group is rejected.

## Verify phase implemented — 14 August 2026

The read-only report `server/prisma/verification/tenant_ownership.sql` returns one row for each of
the seven roots with total rows, missing/inactive organization counts, legacy-owner mismatches,
branch mismatches, relationship mismatches, a combined issue count, and an enforcement-readiness
flag. It also checks category/menu, menu/ingredient, menu/modifier, combo/suggestion, table/order,
table/promotion, and order/promotion ownership agreement.

The rehearsal now seeds all seven roots for two tenants and verifies 14 direct ownership values.
A clean report returns seven ready rows with zero issues; deliberate ownership corruption makes all
seven roots fail readiness. HTTP tests deny cross-tenant category, ingredient, and modifier links,
and deny destructive/menu, table, order, and promotion mutations against another tenant.

Verification found and corrected two transition gaps: new modifier groups now receive the active
organization and can only be edited through a same-organization menu link; backfill validation now
derives pre-write menu ownership from the legacy admin and permits already-owned orphan groups.

This evidence supports enforcement design but does not authorize enforcement. Before non-null or
composite constraints are applied, the report must return zero issues against a staging copy of the
target data and the RLS-versus-compensating-controls decision must be approved.
