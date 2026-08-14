# ADR 0005: Authentication, tenant session, and access-policy boundaries

Status: Implemented behavior-neutral extraction

## Context

Restaurant identity resolution, token authentication, role middleware, and catalog ownership checks
were embedded in `server/index.js`. This made security behavior difficult to unit test independently
and increased the risk that later tenant-enforcement work would mix structural refactoring with
authorization changes.

## Decision

The server now separates three responsibilities:

1. `tenantAccess.js` contains pure tenant claim/response and role-assignment policy helpers.
2. `tenantSession.js` owns active user → membership → organization → compatibility Admin resolution,
   restaurant-session token creation, and tenant response construction.
3. `accessControl.js` owns authentication middleware, SuperAdmin/organization role gates, and
   catalog ownership assertions.

Database and token-secret dependencies are supplied explicitly. Route registration remains in
`server/index.js`, and existing endpoint paths, status codes, response bodies, token claims, and
compatibility Admin identifiers remain unchanged.

## Security invariants

- Tenant sessions resolve only active users, active memberships, and active organizations.
- Each request re-resolves membership and compatibility Admin state from PostgreSQL; token claims
  do not independently authorize current tenant access.
- Restaurant and SuperAdmin token classes retain their issuer/audience/purpose verification.
- Organization role gates use the current database-backed membership role.
- Catalog category and ingredient links remain scoped to the compatibility Admin owner.
- Missing identities, memberships, organizations, compatibility profiles, or credentials fail
  closed.

## Verification and rollback

Focused unit tests cover active-session query shape, invalid identity rejection, missing-profile
denial, restaurant request-context mapping, inactive membership denial, role gates, and catalog
ownership rejection. The database-backed characterization suite confirms endpoint behavior and
cross-tenant denials remain unchanged.

Rollback is structural: restore the small functions to `server/index.js`. No database migration,
token contract, API contract, or client change is required.
