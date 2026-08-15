# ADR 0011: Privacy-minimized Sentry and external uptime monitoring

Status: Accepted locally for the Phase 1 pilot on 15 August 2026; hosted-provider evidence pending

## Context

The single-VPS pilot needs application-error and availability signals without turning monitoring
into a second customer-data store or exposing an endpoint that anyone can use to generate alerts.
The release must identify whether a failure is in the browser, Node API, database readiness, or
deployment while keeping the Phase 1 design operationally small.

## Decision

Use two Sentry projects: one for the Node API and one for the React browser application. Both use
the validated immutable release ID and `pilot` environment. The Node SDK loads before Express so
startup integrations are installed before application imports. It captures unhandled and HTTP 5xx
failures and flushes during graceful shutdown. The browser SDK initializes before lazy application
imports, and its default error integration plus the existing customer/admin render boundaries
capture failures. Performance tracing defaults to zero and session replay is not installed.

Telemetry is deny-by-default. SDK default PII collection, users, cookies, request/response headers,
request bodies, URL query parameters, GraphQL variables, database query data, generative-AI data,
and stack local variables are disabled. A final event and breadcrumb processor removes user data,
credentials, authorization values, email addresses, sensitive query values, customer notes/body
fields, and oversized/deep context. Only validated release/environment, request ID, pseudonymous
organization ID, HTTP method/path, surface, UI scope, and bounded technical counters are permitted.
The Sentry projects must be restricted to the release owner and designated responder with MFA;
pilot event retention is the shortest plan-supported period, targeted at no more than 30 days.

Authenticated builds may create hidden browser source maps and upload them with a narrowly scoped,
root-only release-upload token. The plugin deletes map files from `dist` after successful upload.
The token is not available to the running application and the browser DSN is intentionally separate
from the server DSN. Source-map access follows the same restricted Sentry project membership.

Use an independent external uptime provider to request the public HTTPS
`/api/health/ready` endpoint every 60 seconds with a 10-second timeout. Alert after two consecutive
failures and resolve after two consecutive successes. Delivery must reach both the primary operator
and a separate fallback destination/person. This readiness contract checks both HTTP availability
and PostgreSQL connectivity and returns the active release.

Synthetic validation remains an operator-only host command. It validates the HTTPS readiness JSON
and release, emits a Sentry exception tagged `synthetic=true`, fingerprints it per release, flushes
the SDK transport, and prints the event ID without credentials. There is no public synthetic-error
route. For every pilot release, the operator verifies that event ID in Sentry and confirms an actual
notification. Before launch and quarterly, the operator temporarily points the uptime monitor at a
known absent HTTPS path, confirms failure delivery, restores `/api/health/ready`, and confirms the
recovery notification.

## Consequences

This provides release-correlated application and availability failures without adding Redis,
agents, or a public alert trigger. Separate projects isolate browser volume and public DSN concerns
from server incidents. Zero tracing means the pilot does not yet provide sampled performance spans;
latency/capacity evidence remains a separate M3 item.

SDK transport acceptance is not proof that Sentry ingested an event or routed an alert, and local
HTTP checks are not proof that an external monitor can reach the VPS. The completion gate therefore
requires screenshots or exported evidence from the hosted Sentry and uptime providers, including
event ID, release/environment, recipient, timestamps, induced failure, and recovery. DSNs, tokens,
and notification addresses must be redacted from retained evidence.
