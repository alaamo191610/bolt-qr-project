# ADR 0008: Single-VPS Phase 1 pilot infrastructure

Status: Accepted by Yazan for Phase 1 on 15 August 2026; RPO/RTO accepted

## Context

Release 1 needs a low-cost operating path before business demand justifies managed storage,
Redis, a managed database, or horizontally scaled application instances. The pilot may accept
maintenance windows and a single failure domain, but it must not imply high availability or hide
the consequences of losing the VPS.

## Decision

Phase 1 uses:

- one Linux VPS;
- one Node.js application process managed by `systemd`;
- PostgreSQL bound to localhost on the same VPS;
- uploads on a dedicated local filesystem directory outside the application release directory;
- the existing bounded in-memory rate limiter;
- nginx for TLS termination, reverse proxying, static delivery, and request-size limits;
- Sentry for application error reporting; and
- an external uptime monitor for HTTPS health checks.

No load balancer, Redis, managed object storage, managed PostgreSQL, or multi-node failover is in
Phase 1. Deployments and VPS failure may cause downtime. Restarting the Node process resets limiter
state, and local uploads/PostgreSQL share the VPS failure domain.

## Required pilot controls

The simple topology does not remove these controls:

- run Node as a dedicated unprivileged user; PostgreSQL is not internet-accessible;
- expose only SSH, HTTP, and HTTPS through the host/provider firewall;
- use key-only SSH, disable direct root/password login, patch the OS, and enable time sync;
- obtain and automatically renew TLS certificates; redirect HTTP to HTTPS;
- store secrets outside the repository with restrictive permissions and rotate them after exposure;
- enable `systemd` restart, startup, resource, and hardening policies;
- keep uploads outside release directories, enforce type/size checks, and prevent executable serving;
- enable log rotation, redaction, disk-space alerts, database-health checks, and Sentry release IDs;
- deploy versioned releases with a documented application rollback command; and
- run migration verification before application activation.

## Backup exception

Yazan proposed no backup/manual-only backup for the easy pilot. That is acceptable only for a
disposable demonstration whose data may be lost. It is not accepted for M5 use by restaurants
with real orders or uploads.

Before a real pilot, the minimum addition is an automated daily PostgreSQL dump plus upload backup
copied off the VPS, encrypted, retained for at least seven days, monitored for success, and restored
in a rehearsal. Yazan accepted RPO 24 hours and RTO 4 hours on 15 August 2026. Manual backups may
supplement but cannot be the only control.

## Growth triggers

Move beyond this ADR when any of the following occurs:

- a second Node process or VPS is introduced: move limiting/session coordination to Redis or an
  equivalent shared store;
- uploads must survive VPS loss or be served from multiple instances: move to managed object
  storage;
- database maintenance, load, or recovery exceeds the team's operating ability: move PostgreSQL
  to a managed service with PITR;
- contractual uptime or recovery objectives exceed a single failure domain: add load balancing,
  redundant application instances, and managed dependencies;
- disk, CPU, memory, connection, latency, or order-volume alerts show sustained capacity pressure;
  or
- pilot support demonstrates that maintenance-window downtime is no longer acceptable.

## Consequences

This path is inexpensive and easy to understand, and the current in-memory limiter/local upload
implementation remains usable. It provides no high availability and cannot claim the original M3
managed-storage/shared-limiter exit gate. M4 must load-test this exact topology, rehearse full VPS
rebuild and restore, and document capacity and downtime limits. M5 remains blocked until the backup
exception is resolved and restore evidence exists.
