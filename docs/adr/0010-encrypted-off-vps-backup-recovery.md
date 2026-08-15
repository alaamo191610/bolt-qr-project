# ADR 0010: Encrypted off-VPS backup and isolated recovery

Status: Accepted locally for the Phase 1 pilot on 15 August 2026; remote execution evidence pending

## Context

The Phase 1 topology deliberately keeps PostgreSQL and uploads on one VPS. A disk, provider,
operator, or security failure can therefore remove both live data sets at once. ADR 0008 accepts a
maximum RPO of 24 hours and RTO of 4 hours and blocks a real restaurant pilot until automated
off-VPS backup and restore evidence exist.

The recovery design must remain simple, must not place application or MFA secrets in the backup,
must work with more than one storage vendor, and must make a destructive production restore hard
to perform accidentally.

## Decision

Use `restic` with a repository outside the VPS. Restic performs authenticated client-side
encryption and deduplication before transfer and supports S3-compatible and SFTP repositories. The
selected remote account/bucket must be operationally separate from the VPS, restrict access to the
backup identity, enable provider versioning or immutability where available, and alert on access,
capacity, lifecycle, and billing failures.

Every scheduled run:

1. acquires a non-blocking local lock;
2. writes a PostgreSQL custom-format logical dump without ownership or privilege statements;
3. copies the non-symlink upload tree into a private staging directory;
4. writes a versioned, non-secret manifest with the resolved source database fingerprint, database
   checksum, and upload counts;
5. sends that payload to the encrypted remote repository;
6. keeps at least seven daily, four weekly, and six monthly recovery points;
7. prunes and runs `restic check`; and
8. atomically publishes a non-secret success marker and dead-man monitor ping only after all prior
   operations succeed.

The timer runs at 02:00 and 14:00 UTC. This is more frequent than the daily minimum and provides a
failure/retry margin inside the accepted 24-hour RPO. A success marker older than 18 hours is an
alert. Failed units retry every 15 minutes subject to systemd start limits.

The application and backup services use separate Unix identities. A dedicated `boltqruploads`
group grants both services only the filesystem access needed for uploads; it does not grant the
backup identity access to `/etc/bolt-qr/bolt-qr.env`. The restic and PostgreSQL passwords are passed
as systemd credentials. Provider credentials live only in the protected backup service
configuration, never in the repository, release tree, backup payload, logs, or restore report.

Restore is always into an explicitly confirmed isolated target. The command refuses the configured
production upload path, compares the target PostgreSQL server/database fingerprint to the live
source when available and always to the source fingerprint captured in the backup manifest,
requires an empty target database and upload directory, verifies the dump checksum, rejects upload
symlinks, and produces an elapsed-time RTO report. This remains usable when the production database
is unavailable. Production replacement is a separate incident decision after the isolated result
is inspected.

## Consequences

The repository backend can change without changing application code or the backup payload. A
logical dump is portable and migration-aware but can be slower than physical recovery as data
grows. Local staging temporarily requires enough free space for one database dump plus uploads;
disk monitoring must include that headroom.

The backup credential used by this simple pilot needs delete permission for pruning, so a fully
compromised VPS could request remote deletion. Provider-side versioning/immutability, independent
alerts, and protected copies of the restic password reduce that risk. If recovery volume or threat
requirements outgrow this control, move pruning to a separate credential/host and adopt managed
PostgreSQL PITR plus object storage versioning.

Local automated tests prove command syntax, retention and monitoring contracts, stale-marker
detection, and destructive restore guards. M5 remains blocked until the selected off-VPS repository
has completed a real backup and a timed isolated restore under four hours, with evidence recorded
in the production plan.
