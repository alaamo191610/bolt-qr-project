#!/usr/bin/env bash
set -euo pipefail

umask 0077

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [snapshot-id-or-latest]" >&2
  exit 64
fi
snapshot_id="${1:-latest}"
restore_rto_hours="${RESTORE_RTO_HOURS:-4}"
if [[ ! "$restore_rto_hours" =~ ^[1-9][0-9]*$ ]]; then
  echo "RESTORE_RTO_HOURS must be a positive integer" >&2
  exit 64
fi

required_variables=(
  RESTIC_REPOSITORY RESTIC_PASSWORD_FILE BACKUP_HOST
  PGHOST PGPORT PGDATABASE PGUSER PGPASSFILE UPLOAD_DIR
  RESTORE_PGHOST RESTORE_PGPORT RESTORE_PGDATABASE RESTORE_PGUSER RESTORE_PGPASSFILE
  RESTORE_UPLOAD_DIR RESTORE_CONFIRMATION
)
for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Required restore setting is missing: $variable_name" >&2
    exit 64
  fi
done

if [[ "$RESTORE_CONFIRMATION" != "isolated-non-production" ]]; then
  echo "Set RESTORE_CONFIRMATION=isolated-non-production after verifying the targets" >&2
  exit 77
fi
if [[ "$snapshot_id" != "latest" && ! "$snapshot_id" =~ ^[a-fA-F0-9]{8,64}$ ]]; then
  echo "Snapshot must be 'latest' or an 8-64 character hexadecimal restic snapshot ID" >&2
  exit 64
fi
if [[ "$RESTORE_UPLOAD_DIR" != /* || "$RESTORE_UPLOAD_DIR" == "/" ]]; then
  echo "RESTORE_UPLOAD_DIR must be a dedicated absolute directory" >&2
  exit 64
fi
if [[ "$RESTORE_UPLOAD_DIR" == "$UPLOAD_DIR" ]]; then
  echo "Refusing to restore over the production upload directory" >&2
  exit 77
fi
if [[ -e "$RESTORE_UPLOAD_DIR" && -n "$(find "$RESTORE_UPLOAD_DIR" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "RESTORE_UPLOAD_DIR must not exist or must be empty" >&2
  exit 65
fi
if [[ ! -r "$RESTIC_PASSWORD_FILE" || ! -r "$PGPASSFILE" || ! -r "$RESTORE_PGPASSFILE" ]]; then
  echo "Restore credential files must exist and be readable" >&2
  exit 77
fi
for command_name in restic psql pg_restore sha256sum rsync find date mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required restore command is unavailable: $command_name" >&2
    exit 69
  fi
done

if [[ "$PGHOST" == "$RESTORE_PGHOST" && "$PGPORT" == "$RESTORE_PGPORT" \
  && "$PGDATABASE" == "$RESTORE_PGDATABASE" ]]; then
  echo "Refusing to restore into the configured production database" >&2
  exit 77
fi
target_fingerprint="$(PGPASSFILE="$RESTORE_PGPASSFILE" PGHOST="$RESTORE_PGHOST" \
  PGPORT="$RESTORE_PGPORT" PGDATABASE="$RESTORE_PGDATABASE" PGUSER="$RESTORE_PGUSER" \
  psql --no-psqlrc --tuples-only --no-align \
  --command="SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port() || '/' || current_database()")"
source_fingerprint=""
if source_fingerprint="$(PGPASSFILE="$PGPASSFILE" PGHOST="$PGHOST" PGPORT="$PGPORT" \
  PGDATABASE="$PGDATABASE" PGUSER="$PGUSER" psql --no-psqlrc --tuples-only --no-align \
  --command="SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port() || '/' || current_database()" \
  2>/dev/null)"; then
  if [[ "$source_fingerprint" == "$target_fingerprint" ]]; then
    echo "Refusing to restore into the production database" >&2
    exit 77
  fi
fi

target_table_count="$(PGPASSFILE="$RESTORE_PGPASSFILE" PGHOST="$RESTORE_PGHOST" \
  PGPORT="$RESTORE_PGPORT" PGDATABASE="$RESTORE_PGDATABASE" PGUSER="$RESTORE_PGUSER" \
  psql --no-psqlrc --tuples-only --no-align \
  --command="SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")"
if [[ "$target_table_count" != "0" ]]; then
  echo "Restore database must be empty" >&2
  exit 65
fi

restore_staging_root="${RESTORE_STAGING_ROOT:-/var/cache/qr-restore}"
restore_report_directory="${RESTORE_REPORT_DIR:-/var/lib/qr/restore-reports}"
if [[ "$restore_staging_root" != /* || "$restore_report_directory" != /* ]]; then
  echo "Restore staging and report directories must be absolute" >&2
  exit 64
fi
mkdir -p "$restore_staging_root" "$restore_report_directory"
restore_parent="$(mktemp -d "$restore_staging_root/restore.XXXXXXXX")"
cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  rm -rf -- "$restore_parent"
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

started_epoch="$(date -u +'%s')"
restic restore "$snapshot_id" --host "$BACKUP_HOST" --tag qr --target "$restore_parent"

payload_directory="$restore_parent"
if [[ -d "$restore_parent/payload" ]]; then
  payload_directory="$restore_parent/payload"
fi
database_dump="$payload_directory/database.dump"
manifest="$payload_directory/manifest.txt"
restored_uploads="$payload_directory/uploads"
if [[ ! -f "$database_dump" || ! -f "$manifest" || ! -d "$restored_uploads" ]]; then
  echo "Restored snapshot does not contain the QR backup payload" >&2
  exit 65
fi
if ! grep -qx 'format=qr-backup-v1' "$manifest"; then
  echo "Unsupported or invalid backup manifest" >&2
  exit 65
fi
manifest_source_fingerprint="$(sed -n 's/^source_database_fingerprint=//p' "$manifest")"
if [[ -z "$manifest_source_fingerprint" || "$manifest_source_fingerprint" == "$target_fingerprint" ]]; then
  echo "Backup manifest cannot prove the restore database is isolated from production" >&2
  exit 77
fi
expected_checksum="$(sed -n 's/^database_sha256=//p' "$manifest")"
actual_checksum="$(sha256sum "$database_dump" | awk '{print $1}')"
if [[ -z "$expected_checksum" || "$actual_checksum" != "$expected_checksum" ]]; then
  echo "Database dump integrity check failed" >&2
  exit 65
fi
if find "$restored_uploads" -type l -print -quit | grep -q .; then
  echo "Restored uploads contain a symbolic link" >&2
  exit 65
fi

PGPASSFILE="$RESTORE_PGPASSFILE" PGHOST="$RESTORE_PGHOST" PGPORT="$RESTORE_PGPORT" \
  PGDATABASE="$RESTORE_PGDATABASE" PGUSER="$RESTORE_PGUSER" pg_restore \
  --exit-on-error --no-owner --no-privileges --dbname="$RESTORE_PGDATABASE" "$database_dump"

mkdir -p "$RESTORE_UPLOAD_DIR"
rsync --archive --delete --numeric-ids "$restored_uploads/" "$RESTORE_UPLOAD_DIR/"

restored_table_count="$(PGPASSFILE="$RESTORE_PGPASSFILE" PGHOST="$RESTORE_PGHOST" \
  PGPORT="$RESTORE_PGPORT" PGDATABASE="$RESTORE_PGDATABASE" PGUSER="$RESTORE_PGUSER" \
  psql --no-psqlrc --tuples-only --no-align \
  --command="SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")"
if [[ ! "$restored_table_count" =~ ^[1-9][0-9]*$ ]]; then
  echo "Restored database verification found no application tables" >&2
  exit 65
fi

completed_epoch="$(date -u +'%s')"
elapsed_seconds=$(( completed_epoch - started_epoch ))
rto_seconds=$(( restore_rto_hours * 60 * 60 ))
rto_met=false
if (( elapsed_seconds <= rto_seconds )); then rto_met=true; fi
report_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
report_file="$restore_report_directory/restore-${completed_epoch}.txt"
printf '%s\n' \
  'format=qr-restore-report-v1' \
  "completed_at=$report_timestamp" \
  "snapshot=$snapshot_id" \
  "target=$target_fingerprint" \
  "elapsed_seconds=$elapsed_seconds" \
  "rto_seconds=$rto_seconds" \
  "rto_met=$rto_met" \
  "restored_tables=$restored_table_count" \
  > "$report_file"
chmod 0640 "$report_file"

if [[ "$rto_met" != true ]]; then
  echo "Restore completed but exceeded the configured RTO; report: $report_file" >&2
  exit 1
fi
echo "Isolated restore completed within RTO in ${elapsed_seconds}s; report: $report_file"
