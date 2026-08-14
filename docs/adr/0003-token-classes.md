# ADR 0003: Explicit credential classes

Status: Implemented for M1 foundation; tracking/session expiry remains subject to D1 sign-off

## Decision

The API issues and verifies three separate JWT classes:

- `restaurant-session` for restaurant organization members;
- `super-admin-session` for platform administrators; and
- `order-tracking` for read-only customer order status.

Each token has an explicit issuer, audience, purpose, and expiry. Verification selects the
expected class and rejects tokens issued for another class. The token purpose is not inferred
from a request body or URL. Restaurant session subjects are the login identity; the legacy
restaurant profile ID remains a compatibility claim until the tenant migration is complete.

The current expiry remains 24 hours to avoid silently changing the pending tracking-recovery
decision. Before M2, both owners must approve shorter tracking/table-session lifetimes and
the expired-token recovery UX.

## Security consequences

An order-tracking token cannot authenticate an admin route, and an admin token cannot be used
as a tracking credential. Issuer/audience checks prevent accepting a valid token minted for a
different API. Existing pre-hardening tokens expire naturally and require re-authentication;
the release runbook must call this out.
