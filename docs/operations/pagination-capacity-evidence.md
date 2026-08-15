# Pagination, query-plan, and capacity evidence

**Local run:** 16 August 2026

**Purpose:** M3 implementation evidence, not the selected-VPS release acceptance

**Contract:** `docs/contracts/pagination-and-analytics.md`

## Fixed Phase 1 pilot limits

The mixed authenticated workload fails if any limit is exceeded:

| Metric | Acceptance limit |
|---|---:|
| p95 latency | 250 ms maximum |
| p99 latency | 750 ms maximum |
| HTTP/transport error rate | 1% maximum |
| Sustained throughput | 5 requests/second minimum |
| Per-request timeout | 5 seconds |

These are pilot safety limits for the current single-Node/single-VPS architecture, not a promise
of internet response time to every end user. Repeated threshold failure blocks promotion and
requires query/application remediation or a documented capacity decision.

## Production-shaped local fixture

The disposable migrated PostgreSQL fixture contained 100,002 orders split between two tenants
(10,001 in the measured tenant and 90,001 in another tenant), 10,102 promotions, and 10,002
restaurant admin rows. Statistics were refreshed with `ANALYZE` before measurement. The app ran
directly on loopback on Apple arm64 with local Node 24.15.0; this Node version is outside the
declared production Node 20–22 range, so the results prove implementation behavior only.

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` reviewed first-page orders, active orders, the 30-day
analytics range, promotions, restaurants, plan-filtered restaurants, and the active-plan MRR
aggregate. All seven used an index,
none performed a base-table sequential scan, and all stayed below the 250 ms query ceiling:

| Query | Execution | Planner-selected index |
|---|---:|---|
| Orders first page | 0.040 ms | `orders_organization_id_created_at_id_idx` |
| Active orders page | 0.075 ms | `orders_organization_id_created_at_id_idx` |
| Analytics window | 3.430 ms | `orders_organization_id_idx` |
| Promotions first page | 0.046 ms | `promotions_organization_id_idx` |
| Restaurants first page | 0.019 ms | `admins_created_at_id_idx` |
| Restaurants filtered by plan | 0.018 ms | `admins_created_at_id_idx` |
| Active-plan MRR aggregate | 0.824 ms | `admins_subscription_status_subscription_plan_idx` |

The verifier also fails before EXPLAIN if any index introduced by migration
`20260816090000_bounded_pagination_indexes` is absent. PostgreSQL may select a simpler compatible
index when the data distribution makes a composite filter non-selective; the gate accepts that
only when it remains an indexed plan, has no base-table sequential scan, and meets the execution
limit.

## Measured local API result

The harness sent 300 GET requests at concurrency 10, round-robin across readiness, active order
pagination (`limit=50`), and 30-day aggregate analytics:

| Result | Measurement |
|---|---:|
| p50 | 14.97 ms |
| p95 | 81.25 ms |
| p99 | 89.49 ms |
| Maximum | 133.89 ms |
| Throughput | 343.33 requests/second |
| Errors | 0 / 300 (0%) |

The run passed every fixed limit. The bearer token is supplied only through process environment,
is never included in the JSON report, and health requests receive no authorization header.

## Repeatable operator commands

After applying migrations and loading representative non-production data:

```bash
QUERY_PLAN_ORGANIZATION_ID='<fixture-organization-uuid>' \
QUERY_PLAN_MAX_EXECUTION_MS=250 \
npm run verify:query-plans

CAPACITY_BASE_URL='https://pilot.example.com' \
CAPACITY_AUTH_TOKEN='<short-lived-test-session>' \
CAPACITY_REQUESTS=300 \
CAPACITY_CONCURRENCY=10 \
CAPACITY_P95_LIMIT_MS=250 \
CAPACITY_P99_LIMIT_MS=750 \
CAPACITY_MAX_ERROR_RATE=0.01 \
CAPACITY_MIN_RPS=5 \
npm run test:capacity
```

Do not paste a production owner token into tickets, logs, shell transcripts, or committed files.
Use a short-lived least-privilege pilot test account and clear the environment after the run.

## Remaining selected-VPS gate

Before pilot Go, rerun on production Node 22 through public HTTPS/nginx against representative
PostgreSQL volume while systemd, Sentry, and external uptime checks are active. Retain the JSON
outputs and VPS resource observations. Acceptance requires the same thresholds, zero tenant-data
leakage, no unexpected 429/5xx responses, and no sustained CPU, memory, disk, or database pressure.
The local run does not close that environment-dependent gate.
