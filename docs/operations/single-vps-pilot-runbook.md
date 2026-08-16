# Single-VPS pilot deployment runbook

Status: Runtime, backup/restore, and observability automation locally complete; VPS/TLS, remote
recovery rehearsal, hosted Sentry/uptime validation, and capacity execution pending

Recovery objectives: RPO 24 hours; RTO 4 hours.

## Filesystem and service layout

```text
/opt/bolt-qr/releases/<release-id>   immutable versioned releases
/opt/bolt-qr/current                active release symlink
/opt/bolt-qr/previous               previous application release symlink
/var/lib/bolt-qr/uploads            persistent application uploads
/var/lib/bolt-qr/backup-state       non-secret backup success state
/var/lib/bolt-qr/restore-reports    non-secret isolated restore evidence
/var/cache/bolt-qr-backup           private temporary backup staging/cache
/var/cache/bolt-qr-restore          private temporary restore staging
/etc/bolt-qr/bolt-qr.env            production secrets/configuration
/etc/bolt-qr/bolt-qr-migrate.env    root-only migration database URL
/etc/bolt-qr/sentry-build.env       root-only browser source-map upload configuration
/etc/bolt-qr/bolt-qr-backup.env     protected backup configuration
/etc/bolt-qr/restic-password        root-only repository encryption password
/etc/bolt-qr/postgres-passfile      root-only libpq password file
```

Create a dedicated `boltqr` system user. PostgreSQL listens only on localhost. The Node process
listens on `127.0.0.1:3000`; nginx is the only public application listener. Permit only required
SSH, HTTP, and HTTPS traffic at both provider and host firewalls.

## Installation sequence

1. Install supported Node.js 22, PostgreSQL, nginx, `restic`, rsync, curl, and Certbot.
2. Create `boltqr`, a system `boltqrbackup` user, and a dedicated `boltqruploads` group containing
   both users. Create the layout above and `/var/www/certbot`. Set the upload directory to
   `root:boltqruploads` mode `2770`; this preserves the shared upload group without exposing the
   application environment to the backup user.
3. Configure PostgreSQL using [the database-role runbook](database-role-boundary.md). Copy
   `ops/env/bolt-qr.env.example` to `/etc/bolt-qr/bolt-qr.env`, replace every placeholder, and set
   owner `root:boltqr`, mode `0640`. Copy `ops/env/bolt-qr-migrate.env.example` to
   `/etc/bolt-qr/bolt-qr-migrate.env`, set the separate migration URL, and set owner `root:root`,
   mode `0600`.
4. Replace `example.com` in the nginx configuration, obtain TLS certificates, run `nginx -t`, and
   enable the site.
5. Install the systemd unit, run `systemctl daemon-reload`, and enable `bolt-qr.service`.
6. Deploy a commit SHA or immutable release ID with `ops/bin/deploy-release.sh`.
7. Verify `/api/health/live`, `/api/health/ready`, login, Socket.IO reconnect, and one authorized
   disposable order flow.

`UPLOAD_DIR` is mandatory and absolute in production so deployments cannot orphan uploaded files.
`RELEASE_VERSION` comes from the active release's `.release.env` and is returned by health probes.
Do not put secrets in `.release.env` or in the repository.

Generate `SUPER_ADMIN_MFA_ENCRYPTION_KEY` independently with `openssl rand -hex 32`. Keep it in
`/etc/bolt-qr/bolt-qr.env`, include it in the protected secret-recovery record, and never place it
inside the database/upload backup. Losing this key makes enrolled TOTP seeds unrecoverable.

## Deployment and rollback

The deployment script copies a clean source tree into a new immutable release, installs locked
dependencies, generates Prisma Client, builds assets without database/application secrets, applies
backward-compatible migrations with the separate migration role, verifies the runtime/migration
boundary, atomically switches the current symlink, restarts the service, and waits for readiness.
The Node systemd service never runs migrations and cannot read the migration environment. It
excludes `.env`, uploads, Git metadata, dependencies, and prior build output.

The rollback script swaps `current` and `previous`, restarts, and verifies readiness. It does not
reverse database migrations. Every migration deployed in this phase must therefore preserve the
previous application until the rollback window closes.

Useful checks:

```bash
systemctl status bolt-qr.service
journalctl -u bolt-qr.service --since '30 minutes ago'
curl --fail https://example.com/api/health/live
curl --fail https://example.com/api/health/ready
nginx -t
npm run verify:database-roles
```

## Encrypted off-VPS backup installation

The design and threat boundaries are recorded in
[ADR 0010](../adr/0010-encrypted-off-vps-backup-recovery.md). Select an S3-compatible or SFTP
repository outside the VPS account/failure domain. Enable provider versioning or immutability where
available and independent access/capacity/billing alerts. Preserve the restic password in the
protected secret-recovery record; losing it makes every snapshot unreadable.

Create identities and directories before installing the units:

```bash
groupadd --system boltqruploads
useradd --system --home-dir /var/cache/bolt-qr-backup --shell /usr/sbin/nologin boltqrbackup
usermod --append --groups boltqruploads boltqr
usermod --append --groups boltqruploads boltqrbackup
install -d -o root -g boltqruploads -m 2770 /var/lib/bolt-qr/uploads
install -d -o boltqrbackup -g boltqrbackup -m 0700 /var/lib/bolt-qr/backup-state
install -d -o boltqrbackup -g boltqrbackup -m 0700 /var/cache/bolt-qr-backup
install -d -o root -g root -m 0700 /var/lib/bolt-qr/restore-reports /var/cache/bolt-qr-restore
```

Copy `ops/env/bolt-qr-backup.env.example` to `/etc/bolt-qr/bolt-qr-backup.env`, select the remote
repository, add only backend-required credentials, and set owner `root:boltqrbackup`, mode `0640`.
Generate a separate high-entropy restic password and write the PostgreSQL libpq passfile:

```bash
openssl rand -base64 48 > /etc/bolt-qr/restic-password
printf '127.0.0.1:5432:restaurant_db:boltqr:REPLACE_DATABASE_PASSWORD\n' > /etc/bolt-qr/postgres-passfile
chown root:root /etc/bolt-qr/restic-password /etc/bolt-qr/postgres-passfile
chmod 0600 /etc/bolt-qr/restic-password /etc/bolt-qr/postgres-passfile
```

Do not type the real database password into shared terminal output or retain it in shell history;
write the passfile through the server's approved secret-provisioning channel. For S3-compatible
storage, add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and endpoint/region settings only to the
installed protected backup environment. For SFTP, use a dedicated remote account/key and a
systemd drop-in that exposes only that key to `boltqrbackup`.

Install `bolt-qr-backup-init.service`, `bolt-qr-backup.service`, and `bolt-qr-backup.timer` under
`/etc/systemd/system`. Initialize the selected repository exactly once with the dedicated init unit,
then run the first backup manually and enable automation:

```bash
systemctl daemon-reload
systemctl start bolt-qr-backup-init.service
systemctl start bolt-qr-backup.service
systemctl status bolt-qr-backup.service
/opt/bolt-qr/current/ops/bin/check-backup-freshness.sh
systemctl enable --now bolt-qr-backup.timer
systemctl list-timers bolt-qr-backup.timer
```

After successful initialization, disable or remove the init unit so it cannot be started casually;
a second initialization attempt fails without replacing the repository. The normal backup service
requires the repository to exist, so an incorrect destination fails closed rather than silently
creating storage in the wrong account. The timer runs at 02:00 and 14:00 UTC. It
keeps seven daily, four weekly, and six monthly snapshots, retries failed runs every 15 minutes,
runs `restic check` after pruning, and sends `/start`, success, or `/fail` pings to the configured
dead-man monitor. Configure that monitor to alert when no success arrives within 18 hours. Also
alert on the freshness command, timer/service failure, repository capacity, and local staging disk
headroom.

Useful recovery checks:

```bash
systemctl status bolt-qr-backup.timer bolt-qr-backup.service
journalctl -u bolt-qr-backup.service --since '24 hours ago'
sudo -u boltqrbackup /opt/bolt-qr/current/ops/bin/check-backup-freshness.sh
systemctl start bolt-qr-backup.service
```

## Timed isolated restore rehearsal

Never restore directly onto the production database or upload directory. Provision a new empty
database and empty upload directory on an isolated host or isolated PostgreSQL instance. Load the
protected backup environment in a root-only shell, set the credential paths and target connection
metadata, then run the restore command:

```bash
set -a
source /etc/bolt-qr/bolt-qr-backup.env
set +a
export RESTIC_PASSWORD_FILE=/etc/bolt-qr/restic-password
export PGPASSFILE=/etc/bolt-qr/postgres-passfile
export RESTORE_PGHOST=127.0.0.1
export RESTORE_PGPORT=5432
export RESTORE_PGDATABASE=restaurant_db_restore_rehearsal
export RESTORE_PGUSER=boltqr_restore
export RESTORE_PGPASSFILE=/etc/bolt-qr/restore-postgres-passfile
export RESTORE_UPLOAD_DIR=/var/lib/bolt-qr/restore-rehearsal/uploads
export RESTORE_CONFIRMATION=isolated-non-production
/opt/bolt-qr/current/ops/bin/restore-pilot.sh latest
```

The command compares the target database fingerprint to the live source when available and to the
source fingerprint stored in every backup manifest, so the guard still works when production is
down. It requires an empty target, validates the versioned manifest and dump checksum, rejects
upload symlinks, restores with ownership/privilege statements disabled, verifies application
tables, and writes a report under
`/var/lib/bolt-qr/restore-reports`. Start the restored application against only these isolated
targets and verify readiness, migration status, SuperAdmin MFA login, restaurant login, one menu
image, one disposable dine-in order, tracking, and Socket.IO updates. Record snapshot ID, start/end
time, report, data checks, operator, and cleanup. The measured end-to-end exercise must finish in
under four hours and the newest restored data must be less than 24 hours old.

## Sentry and external uptime

The privacy and alert boundaries are recorded in
[ADR 0011](../adr/0011-sentry-uptime-observability.md). Create independent Sentry projects for the
Node API and React browser. Limit project access to the release owner and designated responder,
require MFA, and choose the shortest plan-supported event retention, targeted at no more than 30
days. Configure issue alerts for new/regressed pilot errors and route them to a primary operator and
a separate fallback destination. Never include an authentication token, DSN, customer data, or
notification address in retained screenshots or reports.

Put the server-project DSN in `/etc/bolt-qr/bolt-qr.env`. Copy
`ops/env/bolt-qr-sentry-build.env.example` to `/etc/bolt-qr/sentry-build.env`; add the browser-project
DSN and a narrowly scoped release/source-map upload token, then set owner `root:root`, mode `0600`.
Load build-only values only around deployment so the running process cannot read the upload token.
The deployment command also removes upload credentials from dependency-install, Prisma-generation,
and migration subprocesses; only the Vite build receives them:

```bash
set -a
source /etc/bolt-qr/bolt-qr.env
source /etc/bolt-qr/bolt-qr-migrate.env
source /etc/bolt-qr/sentry-build.env
set +a
/opt/bolt-qr/source/ops/bin/deploy-release.sh /opt/bolt-qr/source RELEASE_ID
unset DATABASE_URL MIGRATION_DATABASE_URL JWT_SECRET SUPER_ADMIN_MFA_ENCRYPTION_KEY SENTRY_DSN
unset SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT VITE_SENTRY_DSN VITE_SENTRY_ENVIRONMENT
```

The authenticated build uploads hidden source maps tagged with `RELEASE_ID` and removes maps from
the deployed `dist` tree. Confirm that Sentry contains the same release for both projects and that
`find /opt/bolt-qr/current/dist -name '*.map' -print` returns no files.

Configure an external monitor—not a cron job on this VPS—with these settings:

- URL: `https://example.com/api/health/ready`, no credentials or query parameters.
- Method/interval/timeout: `GET`, 60 seconds, 10 seconds.
- Success: HTTP 200 and JSON containing `status=ready` and `database=ok` where supported.
- Failure/recovery: alert after two consecutive failures; resolve after two consecutive successes.
- Delivery: primary operator plus a separately routed fallback person or destination.

After each pilot deployment, load only the protected application environment and active non-secret
release metadata, run the operator-only validator, and immediately clear the shell variables:

```bash
set -a
source /etc/bolt-qr/bolt-qr.env
source /opt/bolt-qr/current/.release.env
set +a
node /opt/bolt-qr/current/ops/bin/verify-observability.js
unset DATABASE_URL JWT_SECRET SUPER_ADMIN_MFA_ENCRYPTION_KEY SENTRY_DSN
```

The command must print `observability_validation_sent` with an event ID. Find exactly that event in
the server Sentry project, verify `synthetic=true`, the active release and `pilot` environment, and
confirm a real alert arrives at both destinations. SDK flush success proves only local transport
acceptance; provider receipt and notification are separate required evidence.

Before launch and quarterly, temporarily change only the external monitor URL to
`https://example.com/api/health/ready-intentional-test`, wait for the two-failure notification, then
restore `/api/health/ready` and wait for the two-success recovery notification. Record UTC start,
failure-alert, restore, and recovery times; monitor ID; Sentry event ID; release; recipients; and
redacted screenshots. Do not stop the production application to test the monitor.

## Shutdown and incident behavior

`systemd` sends SIGTERM. The application stops Socket.IO/HTTP acceptance, disconnects Prisma, and
exits before the 30-second service timeout; a 25-second internal deadline fails closed if shutdown
hangs. Restarting the single Node process clears all in-memory limiter entries. During abuse or
overload, use the audited branch ordering-state control rather than relying on limiter continuity.

The VPS is a single failure domain and is not highly available. Backup/restore and observability
automation are supplied locally, but selected hosted providers, successful timed isolated recovery,
Sentry event/notification receipt, induced external uptime failure/recovery, capacity measurement,
and clean-server recovery rehearsal remain required before the real pilot gate.
