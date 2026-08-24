# PostgreSQL runtime and migration role boundary

**Status:** locally implemented for the single-VPS pilot on 16 August 2026  
**Scope:** least-privilege role separation required by ADR 0006; RLS remains deferred until every
tenant request has transaction-bound `SET LOCAL app.organization_id` context.

## Required identities

- `qr_migrate`: owns the application database, `public` schema, tables, and sequences. It may
  execute Prisma migrations but is not a superuser and has no `CREATEDB`, `CREATEROLE`,
  `REPLICATION`, or `BYPASSRLS` attribute.
- `qr_runtime`: used only by Node/Prisma. It has database `CONNECT`, schema `USAGE`, application
  table `SELECT/INSERT/UPDATE/DELETE`, and sequence `USAGE/SELECT/UPDATE`. It owns no objects and has
  no database/schema `CREATE`, database `TEMP`, inherited role membership, cluster-level power, or access to
  `_prisma_migrations`.
- Existing `qr` owner during an upgrade: after ownership transfer it becomes read-only so the
  current pg_dump passfile continues to work. It must not be used by Node or migration commands.

Passwords are generated independently. The runtime URL belongs in `/etc/qr/qr.env`
(`root:qr`, `0640`). The migration URL belongs only in
`/etc/qr/qr-migrate.env` (`root:root`, `0600`) and is loaded for deployment commands. The
systemd Node process never reads the migration file.

## Existing-pilot conversion

Take and verify a backup first. Confirm the current owner role owns no other database or tablespace;
the bootstrap fails instead of allowing a broad `REASSIGN OWNED` when that condition is false.

Create the two login roles interactively so passwords do not enter shell history or process
arguments:

```bash
sudo -u postgres createuser --login --pwprompt --no-superuser --no-createdb --no-createrole --no-replication qr_migrate
sudo -u postgres createuser --login --pwprompt --no-superuser --no-createdb --no-createrole --no-replication qr_runtime
```

Run the guarded ownership/grant conversion locally through PostgreSQL peer authentication:

```bash
sudo -u postgres env \
  APP_DATABASE=restaurant_db \
  CURRENT_OWNER_ROLE=qr \
  MIGRATION_DB_ROLE=qr_migrate \
  RUNTIME_DB_ROLE=qr_runtime \
  /opt/qr/current/ops/bin/configure-database-roles.sh
```

The command refuses a wrong database, absent/unsafe/superuser roles, application roles with role
memberships, shared owner scope, or matching runtime/migration roles. It disables role inheritance,
transfers ownership, revokes public create/temp/object grants, applies
current and default privileges, and removes runtime access to Prisma's migration ledger.

Install the two protected environment files, then verify without attempting DDL:

```bash
set -a
source /etc/qr/qr.env
source /etc/qr/qr-migrate.env
set +a
npm run verify:database-roles
unset DATABASE_URL MIGRATION_DATABASE_URL
```

The JSON report must have `passed=true`. Every deployment reruns this check after migrations and
before changing the active release symlink.

## Runtime and deployment behavior

`npm start` and `qr.service` start only the application. They never run migrations. The
deployment command requires both distinct URLs; its migration wrapper temporarily maps
`MIGRATION_DATABASE_URL` to Prisma's `DATABASE_URL`, removes unrelated application/Sentry secrets
from that child process, and then discards the migration variable. Dependency installation,
Prisma generation, and frontend build also run without either database URL.

Future migrations inherit DML/sequence grants for runtime automatically. A migration that revokes
or changes those defaults must include an explicit role-impact review and must pass
`verify:database-roles` before release activation.

## Rollback and incident rules

Application rollback does not reverse ownership or grants. Previous compatible code runs with the
same runtime role. If verification identifies a missing DML grant, correct that specific grant as
the PostgreSQL administrator and rerun verification. Never place `MIGRATION_DATABASE_URL` in the
systemd environment and never point the application at the migration role as a shortcut. Any
temporary expansion of runtime privileges is a security incident: time-bound it, audit it, revoke
it, and attach the before/after verifier reports.

Role separation alone does not activate RLS. Enabling policies before Prisma operations are wrapped
in a transaction that sets and clears tenant context would create false confidence and is outside
this Release 1 change.
