# Organization and membership API contract

Status: implemented and locally integration-tested for Release 1

## Security boundary

All endpoints require a valid `restaurant-session`. The server re-resolves the login identity,
active membership, active organization, compatibility restaurant profile, role, and default branch
from PostgreSQL on every request. Organization IDs or roles carried in a stale token are not
authorization authority.

Responses use the shared error envelope:

```json
{
  "error": "Safe message",
  "code": "ACCESS_DENIED",
  "requestId": "request-correlation-id"
}
```

## List organizations

`GET /api/auth/organizations`

Returns only active memberships in active organizations for the authenticated identity, oldest
membership first. No organization identifier from the request is accepted.

```json
[
  {
    "id": "organization-uuid",
    "name": "Restaurant Group",
    "slug": "restaurant-group",
    "role": "OWNER",
    "defaultBranch": null,
    "current": true
  }
]
```

## Switch organization

`POST /api/auth/switch-organization`

```json
{ "organizationId": "organization-uuid" }
```

The target must be an active membership of the same authenticated identity. Success returns the
normal tenant login response with a new restaurant-session scoped to the selected organization.
The old token remains bounded to its original organization and cannot be used to select arbitrary
tenants. Invalid UUIDs return `400 VALIDATION_ERROR`; unavailable or foreign memberships return
`403 ACCESS_DENIED`.

## List members

`GET /api/organization/members`

Requires `OWNER` or `MANAGER`. The organization is always derived from the current session.

```json
[
  {
    "userId": "user-uuid",
    "email": "member@example.com",
    "name": "Member",
    "role": "STAFF",
    "status": "ACTIVE",
    "defaultBranch": null,
    "createdAt": "2026-08-15T00:00:00.000Z"
  }
]
```

## Add member

`POST /api/organization/members`

Requires `OWNER` or `MANAGER`.

```json
{
  "email": "member@example.com",
  "name": "Member",
  "password": "required-for-a-new-identity",
  "role": "STAFF"
}
```

- `role` defaults to `STAFF` and must be `OWNER`, `MANAGER`, or `STAFF`.
- Only an `OWNER` can grant `OWNER`; a `MANAGER` can add `MANAGER` or `STAFF`.
- A new identity requires a password of at least eight characters. An existing identity keeps its
  existing credential; the request password is ignored.
- Non-owner active/invited memberships count toward the restaurant's staff-account limit.
- New membership is `ACTIVE` and inherits the restaurant's current default branch.
- Duplicate membership and plan-limit conflicts return `409 CONFLICT` without mutation.

Success returns `201` with the member representation used by the list endpoint.

## Update member

`PATCH /api/organization/members/:userId`

Requires `OWNER`. At least one field is required:

```json
{ "role": "MANAGER", "status": "ACTIVE" }
```

Allowed roles are `OWNER`, `MANAGER`, and `STAFF`; allowed states are `ACTIVE`, `INVITED`, and
`SUSPENDED`. The operation is serializable and enforces these invariants:

- the target belongs to the current organization;
- an owner cannot suspend their own membership;
- an organization always retains at least one active owner;
- cross-tenant targets return `404` and do not disclose foreign membership;
- a successful role or status change takes effect on the next HTTP request because authorization
  is database-revalidated, and all active admin sockets for that organization/user are
  disconnected immediately.

Invalid input returns `400 VALIDATION_ERROR`; owner-invariant conflicts return `409 CONFLICT`.

## Retry and caching

These endpoints do not use idempotency keys. Clients must not blindly retry member creation after
an ambiguous network failure; they should refresh the member list first. Organization/member
responses are authenticated operational data and must not be stored in shared caches.

## Required evidence

The disposable-PostgreSQL integration suite covers list/switch authorization, role boundaries,
member creation/list/update, duplicate/last-owner/self-suspension failures, cross-tenant
non-disclosure, HTTP revalidation, and Socket.IO disconnection after suspension.
