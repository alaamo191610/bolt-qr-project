# ADR 0006: Release 1 tenant enforcement strategy

Status: Option B selected by Yazan on 14 August 2026; Alaa sign-off recorded 14 August 2026 —
staging evidence pending

## Recorded decision

Yazan selected **Option B: Release 1 constraints and compensating controls; RLS after runtime-role
work**. Constraint implementation may proceed locally, but production enforcement remains blocked
until Alaa signs off and `npm run verify:tenant-ownership` returns seven ready roots with zero issues
against the staging copy of target data.

Alaa recorded `Tenant enforcement: B — constraints now, RLS after runtime-role work` on 14 August
2026, agreeing with Yazan's selection and its invariants below. This closes the joint decision;
the only remaining gate before enforcement is the zero-issue staging report.

## Options considered

Choose the database isolation strategy that will govern the tenant-enforcement migration.

### Option A — PostgreSQL RLS in Release 1

Use row-level security on high-risk tenant tables in addition to service guards and database
constraints.

This option requires all of the following before enforcement:

- Separate migration/owner and runtime application database roles.
- Runtime role without `SUPERUSER`, table ownership, or `BYPASSRLS`.
- `FORCE ROW LEVEL SECURITY` on protected tables.
- A transaction-bound organization context such as `SET LOCAL app.organization_id`.
- Every protected Prisma query executed inside the transaction that sets that context.
- Explicit, separately tested platform-admin and background-job access paths.
- Pooling tests proving tenant context cannot survive or leak between requests.

Benefits: strongest database-level defense against a missed service filter.

Cost/risk: this requires a broad transaction/context and deployment-role refactor. Adding policies
while the application connects as the table owner or queries outside the context transaction would
create false confidence rather than effective isolation.

### Option B — Release 1 constraints and compensating controls; RLS after runtime-role work

Use database-enforced ownership constraints plus mandatory service scoping for Release 1, then
re-evaluate RLS in M3 after introducing the required runtime role and transaction context.

Mandatory controls:

- Make `organization_id` non-null on the seven verified aggregate roots.
- Scope every authenticated read/write by current `organization_id` and compatibility owner during
  transition.
- Add composite owner/organization and branch/organization constraints.
- Add composite relationship constraints where practical for category/menu, table/order,
  table/promotion, and order/promotion links.
- Keep explicit service guards and verification for join-table relationships such as
  menu/ingredient and menu/modifier until their database representation supports a composite key.
- Run `tenant_ownership.sql` in CI and against staging before every enforcement migration.
- Use a least-privilege runtime role even without RLS; migrations use a separate owner role.
- Keep cross-tenant read/write/link/delete tests as release gates.

Benefits: enforceable with the current Prisma request model, materially strengthens the database,
and avoids pretending that incomplete RLS is safe.

Cost/risk: a missed service filter on a relationship not covered by a composite constraint remains
possible, so tests, code review, and the verification report are mandatory compensating controls.

## Recommendation

Choose **Option B for Release 1**, with RLS recorded as an M3 hardening decision after runtime-role
separation and transaction-bound tenant context exist. This gives real layered enforcement now and
keeps a credible path to RLS rather than deploying policies the current connection model may bypass.

## Invariants under either option

- The existing staging verification report must return zero issues.
- Legacy columns are not removed in the enforcement migration.
- Enforcement and destructive contract cleanup remain separate migrations.
- Failed verification aborts deployment; it is never converted to a warning.
- Rollback restores compatibility reads/writes without deleting ownership data.

## Approval syntax

Record one of:

- `Tenant enforcement: A — RLS in Release 1`
- `Tenant enforcement: B — constraints now, RLS after runtime-role work`
