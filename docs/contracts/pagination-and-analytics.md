# Pagination and bounded analytics contract

**Status:** implemented locally for the Phase 1 pilot

**Effective:** 16 August 2026

**Owners:** Yazan (API/database) and Alaa (consumer UX review)

## Security and isolation invariants

- Authenticated restaurant endpoints derive `organization_id` from the validated tenant session.
  A query parameter, cursor, or response identifier can never select another tenant.
- Cursors are opaque navigation state, not credentials. They contain only a version, timestamp,
  and tie-break identifier; clients must not inspect, edit, persist indefinitely, or reuse them
  after changing filters.
- Every page is ordered by `created_at DESC, id DESC`. The server applies seek predicates and
  fetches at most `limit + 1`; it never uses an unbounded offset or trusts a client page size.
- Aggregate analytics never returns order notes, customer fields, customization selections, or
  raw baskets. The optional analytics-order export is independently paginated and selects only
  the documented reporting fields.

## Page envelope

Paginated endpoints return:

```json
{
  "items": [],
  "pagination": {
    "limit": 50,
    "hasMore": false,
    "nextCursor": null
  }
}
```

`nextCursor` is present only when another page exists. Invalid, oversized, wrong-version, or
wrong-type cursors and limits return HTTP 400 with code `INVALID_PAGINATION`.

| Endpoint | Default / maximum | Identifier | Filters |
|---|---:|---|---|
| `GET /api/orders` | 50 / 100 | integer | `scope=all\|active\|history`, or one valid `status` |
| `GET /api/admin/analytics/orders` | 100 / 200 | integer | `days=1..90` |
| `GET /api/promotions` | 50 / 100 | UUID | none |
| `GET /api/super-admin/restaurants` | 25 / 100 | UUID | `search` up to 100 characters; `plan=ALL\|STANDARD\|BASIC\|PRO` |
| `GET /api/admins` (legacy SuperAdmin route) | 50 / 100 | UUID | none |

The order-management client requests `active` and `history` independently and exposes an explicit
load-more action. The SuperAdmin client restarts paging after a debounced search or plan change.
`GET /api/super-admin/stats` computes MRR with a database `GROUP BY subscription_plan`; it never
loads the active restaurant population into Node memory.

## Aggregate analytics

`GET /api/admin/analytics?days=N` returns one tenant-scoped database aggregate. `days` defaults to
30 and must be an integer from 1 through 90. The interval is UTC and half-open:
`created_at >= range.start AND created_at < range.end`.

The response contains:

- `range`: `days`, ISO `start`, ISO `end`, and `timezone: "UTC"`;
- `totals`: revenue, order count, average order value, and served-order count;
- at most five `popularItems` and five `topTables`;
- bounded status aggregates, the last seven UTC calendar days, and four busiest UTC hour/day
  buckets;
- `revenueByStatus`, derived from the bounded status aggregates.

All statuses remain in total order/revenue figures to preserve the previous dashboard semantics.
An invalid date range returns HTTP 400 with code `INVALID_ANALYTICS_RANGE`.

## Deployment and compatibility

Migration `20260816090000_bounded_pagination_indexes` is additive and can be deployed before the
application. It adds tenant/date/tie-break indexes for orders and promotions, status-aware order
seek support, date/plan indexes for the platform restaurant list, and an active-plan aggregate
index. The old application
can run with these indexes.

The response change from arrays/raw analytics to page/aggregate objects requires the server and
built frontend from this release to be activated together. The single-process release script
already performs that atomic release switch. Application rollback is safe; indexes may remain.
If index rollback is required later, drop them in a separately reviewed migration after the old
application is active—never during incident response merely to make schema state look older.

## Acceptance evidence

- Unit tests cover bounds, opaque cursor validation, exact tie-breaking, normalized aggregates,
  and load-gate failure behavior.
- Disposable-PostgreSQL HTTP tests cover multi-page no-duplicate traversal, tenant isolation,
  invalid inputs, the 90-day ceiling, aggregate correctness, and reporting-field minimization.
- Production-shaped EXPLAIN and local capacity results are retained in
  `docs/operations/pagination-capacity-evidence.md`.
