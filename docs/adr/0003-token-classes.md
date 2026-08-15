# ADR 0003: Explicit credential classes

Status: Implemented; SuperAdmin policy is refined by ADR 0009

## Decision

The API issues and verifies four separate JWT classes:

- `restaurant-session` for restaurant organization members;
- `super-admin-session` for platform administrators; and
- `super-admin-mfa-challenge` for password-verified, pre-session MFA completion;
- `order-tracking` for read-only customer order status; and
- `table-session` for short-lived capability-scoped dine-in order creation.

Each token has an explicit issuer, audience, purpose, and expiry. Verification selects the
expected class and rejects tokens issued for another class. The token purpose is not inferred
from a request body or URL. Restaurant session subjects are the login identity; the legacy
restaurant profile ID remains a compatibility claim until the tenant migration is complete.

Tracking credentials expire after 6 hours with no refresh endpoint. Before M2, both owners must
approve shorter tracking/table-session lifetimes and
the expired-token recovery UX.

SuperAdmin sessions expire after 30 minutes with no refresh endpoint and require completed MFA,
database session-version revalidation, and recent authentication for platform-changing writes.
The five-minute MFA challenge is a separate audience and is never accepted by authentication
middleware. See ADR 0009 and the SuperAdmin authentication contract.

New order-tracking credentials bind the order, organization, compatibility restaurant profile,
and order subject. Both HTTP status reads and Socket.IO room joins revalidate that scope against
the persisted order. The separate table-session lifetime is 30 minutes under ADR 0007; changing
the tracking lifetime still requires the pending recovery decision.

## Security consequences

An order-tracking token cannot authenticate an admin route, and an admin token cannot be used
as a tracking credential. Issuer/audience checks prevent accepting a valid token minted for a
different API. Existing pre-hardening tokens expire naturally and require re-authentication;
the release runbook must call this out.
