# SuperAdmin restaurant provisioning contract

**Status:** Release 1 local contract, 16 August 2026  
**Policy:** Invite-only; no public restaurant signup or destructive platform delete endpoint.

## Access policy

Only a valid SuperAdmin HttpOnly session with MFA completed during the preceding ten minutes may
create a restaurant, replace an invitation, or change a subscription. The client never submits
entitlement numbers. The backend catalog derives limits from `STANDARD`, `BASIC`, or `PRO`.

Restaurant authentication, authenticated realtime, table capability exchange, ordering, public
catalog/pricing/promotion reads, and order tracking accept only:

- `ACTIVE` with no `subscription_end`, or with a future `subscription_end`;
- `TRIAL` with a future `trial_ends_at`.

`PAST_DUE`, `CANCELLED`, expired dates, inactive users/organizations, and `INVITED` or `SUSPENDED`
memberships fail closed. Changing to a denied state disconnects current organization sockets; REST
tokens are database-revalidated on their next request.

## Create restaurant

`POST /api/super-admin/restaurants`

```json
{
  "ownerEmail": "owner@example.com",
  "restaurantName": "Pilot Restaurant",
  "plan": "STANDARD",
  "status": "TRIAL",
  "trialEndsAt": "2026-08-23T23:59:59.999Z"
}
```

`status` is `ACTIVE` or `TRIAL` at creation. A trial requires a future `trialEndsAt`; an active
subscription may include a future `subscriptionEnd`. One serializable transaction creates the
organization, MAIN branch, inactive owner identity, `INVITED` OWNER membership, compatibility
Admin profile, invitation, and platform audit event.

The `201` response includes restaurant metadata and a one-time activation token/path. This is the
only response that exposes that bearer secret. It must not be logged and must be shared through a
trusted channel. The database stores only its SHA-256 hash. The token contains 256 random bits,
expires after 48 hours, and is single-use.

## Activate owner

`POST /api/auth/activate`

```json
{ "token": "one-time-token", "password": "minimum-12-characters" }
```

Activation atomically claims the invitation, hashes the password with bcrypt, activates the user
and OWNER membership, updates the transitional Admin hash, and records acceptance. Concurrent or
replayed claims cannot both succeed. Invalid, expired, revoked, and already-used tokens return the
same safe `400 INVITATION_INVALID` contract.

## Replace invitation

`POST /api/super-admin/restaurants/:id/invitations`

This is available only while the OWNER membership is `INVITED`. It revokes every prior unused
invitation and returns one new 48-hour secret exactly once.

## Change subscription

`PUT /api/super-admin/restaurants/:id/plan`

```json
{
  "plan": "BASIC",
  "status": "ACTIVE",
  "subscription_end": "2026-09-16T23:59:59.999Z"
}
```

For `TRIAL`, use `trial_ends_at` instead. The backend replaces limits from its plan catalog and
records old/new values, actor, organization, and request ID in `platform_audit_events`.

## Migration and rollback

Migration `20260816130000_super_admin_restaurant_invitations` is additive: it creates
`restaurant_invitations` and `platform_audit_events` plus indexes and foreign keys. Deploy the
migration before the application. Rolling application code back is safe while retaining the new
tables. Dropping them is destructive and is not part of normal rollback. Existing restaurants
remain active under their existing subscription values; no backfill is required.
