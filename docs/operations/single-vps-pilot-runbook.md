# Single-VPS pilot deployment runbook

Status: Runtime baseline locally complete; VPS execution, backup/restore, and Sentry points pending

Recovery objectives: RPO 24 hours; RTO 4 hours.

## Filesystem and service layout

```text
/opt/bolt-qr/releases/<release-id>   immutable versioned releases
/opt/bolt-qr/current                active release symlink
/opt/bolt-qr/previous               previous application release symlink
/var/lib/bolt-qr/uploads            persistent application uploads
/etc/bolt-qr/bolt-qr.env            production secrets/configuration
```

Create a dedicated `boltqr` system user. PostgreSQL listens only on localhost. The Node process
listens on `127.0.0.1:3000`; nginx is the only public application listener. Permit only required
SSH, HTTP, and HTTPS traffic at both provider and host firewalls.

## Installation sequence

1. Install supported Node.js 22, PostgreSQL, nginx, rsync, curl, and Certbot.
2. Create `boltqr`, the layout above, and `/var/www/certbot`; make only the upload directory
   writable by `boltqr`.
3. Copy `ops/env/bolt-qr.env.example` to `/etc/bolt-qr/bolt-qr.env`, replace every placeholder,
   set owner `root:boltqr`, and mode `0640`.
4. Replace `example.com` in the nginx configuration, obtain TLS certificates, run `nginx -t`, and
   enable the site.
5. Install the systemd unit, run `systemctl daemon-reload`, and enable `bolt-qr.service`.
6. Deploy a commit SHA or immutable release ID with `ops/bin/deploy-release.sh`.
7. Verify `/api/health/live`, `/api/health/ready`, login, Socket.IO reconnect, and one authorized
   disposable order flow.

`UPLOAD_DIR` is mandatory and absolute in production so deployments cannot orphan uploaded files.
`RELEASE_VERSION` comes from the active release's `.release.env` and is returned by health probes.
Do not put secrets in `.release.env` or in the repository.

## Deployment and rollback

The deployment script copies a clean source tree into a new immutable release, installs locked
dependencies, generates Prisma Client, builds assets, applies backward-compatible migrations,
atomically switches the current symlink, restarts the service, and waits for readiness. It excludes
`.env`, uploads, Git metadata, dependencies, and prior build output.

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
```

## Shutdown and incident behavior

`systemd` sends SIGTERM. The application stops Socket.IO/HTTP acceptance, disconnects Prisma, and
exits before the 30-second service timeout; a 25-second internal deadline fails closed if shutdown
hangs. Restarting the single Node process clears all in-memory limiter entries. During abuse or
overload, use the audited branch ordering-state control rather than relying on limiter continuity.

The VPS is a single failure domain and is not highly available. Backup/restore automation, Sentry,
external uptime setup, capacity measurement, and clean-server recovery rehearsal remain required
before the real pilot gate.
