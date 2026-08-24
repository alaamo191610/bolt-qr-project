#!/usr/bin/env bash
set -euo pipefail

umask 0077

required_variables=(
  RESTIC_REPOSITORY RESTIC_PASSWORD_FILE UPLOAD_DIR PGHOST PGPORT PGDATABASE PGUSER PGPASSFILE
)
for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Required backup setting is missing: $variable_name" >&2
    exit 64
  fi
done

for command_name in flock pg_dump psql restic rsync sha256sum find stat date hostname mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required backup command is unavailable: $command_name" >&2
    exit 69
  fi
done
if [[ -n "${BACKUP_HEALTHCHECK_URL:-}" ]] && ! command -v curl >/dev/null 2>&1; then
  echo "Required backup monitoring command is unavailable: curl" >&2
  exit 69
fi

backup_state_directory="${BACKUP_STATE_DIR:-/var/lib/qr/backup-state}"
backup_staging_root="${BACKUP_STAGING_ROOT:-/var/cache/qr-backup}"
backup_host="${BACKUP_HOST:-$(hostname -f)}"
keep_daily="${BACKUP_KEEP_DAILY:-7}"
keep_weekly="${BACKUP_KEEP_WEEKLY:-4}"
keep_monthly="${BACKUP_KEEP_MONTHLY:-6}"
healthcheck_url="${BACKUP_HEALTHCHECK_URL:-}"

for numeric_setting in "$keep_daily" "$keep_weekly" "$keep_monthly"; do
  if [[ ! "$numeric_setting" =~ ^[0-9]+$ ]]; then
    echo "Backup retention settings must be non-negative integers" >&2
    exit 64
  fi
done
if (( keep_daily < 7 )); then
  echo "BACKUP_KEEP_DAILY must retain at least seven daily snapshots" >&2
  exit 64
fi
if [[ "$UPLOAD_DIR" != /* || "$UPLOAD_DIR" == "/" || ! -d "$UPLOAD_DIR" ]]; then
  echo "UPLOAD_DIR must be an existing dedicated absolute directory" >&2
  exit 64
fi
if [[ "$backup_state_directory" != /* || "$backup_state_directory" == "/" ]]; then
  echo "BACKUP_STATE_DIR must be a dedicated absolute directory" >&2
  exit 64
fi
if [[ "$backup_staging_root" != /* || "$backup_staging_root" == "/" ]]; then
  echo "BACKUP_STAGING_ROOT must be a dedicated absolute directory" >&2
  exit 64
fi
if [[ ! -r "$RESTIC_PASSWORD_FILE" || ! -r "$PGPASSFILE" ]]; then
  echo "Backup credential files must exist and be readable" >&2
  exit 77
fi
if find "$UPLOAD_DIR" -type l -print -quit | grep -q .; then
  echo "UPLOAD_DIR contains a symbolic link; refusing to follow or archive it" >&2
  exit 65
fi

mkdir -p "$backup_state_directory" "$backup_staging_root"
exec 9>"$backup_state_directory/backup.lock"
if ! flock -n 9; then
  echo "Another backup is already running" >&2
  exit 75
fi

payload_parent=""
backup_succeeded=false
notify_monitor() {
  local suffix="${1:-}"
  if [[ -n "$healthcheck_url" ]]; then
    curl --fail --silent --show-error --max-time 15 "${healthcheck_url%/}${suffix}" >/dev/null || true
  fi
}
cleanup() {
  local exit_status=$?
  trap - EXIT INT TERM
  if [[ -n "$payload_parent" && -d "$payload_parent" ]]; then
    rm -rf -- "$payload_parent"
  fi
  if [[ "$backup_succeeded" != true ]]; then
    notify_monitor "/fail"
  fi
  exit "$exit_status"
}
trap cleanup EXIT INT TERM

notify_monitor "/start"
payload_parent="$(mktemp -d "$backup_staging_root/backup.XXXXXXXX")"
payload_directory="$payload_parent/payload"
mkdir -p "$payload_directory/uploads"

database_dump="$payload_directory/database.dump"
source_database_fingerprint="$(PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" psql \
  --no-psqlrc --tuples-only --no-align \
  --command="SELECT COALESCE(inet_server_addr()::text, 'local') || ':' || inet_server_port() || '/' || current_database()")"
PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" pg_dump \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-privileges \
  --file="$database_dump"

rsync --archive --delete --numeric-ids "$UPLOAD_DIR/" "$payload_directory/uploads/"

database_checksum="$(sha256sum "$database_dump" | awk '{print $1}')"
upload_file_count="$(find "$payload_directory/uploads" -type f | wc -l | tr -d ' ')"
upload_byte_count=0
while IFS= read -r -d '' upload_file; do
  file_byte_count="$(wc -c < "$upload_file" | tr -d ' ')"
  upload_byte_count=$(( upload_byte_count + file_byte_count ))
done < <(find "$payload_directory/uploads" -type f -print0)
completed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
completed_epoch="$(date -u +'%s')"

printf '%s\n' \
  'format=qr-backup-v1' \
  "created_at=$completed_at" \
  "backup_host=$backup_host" \
  "source_database_fingerprint=$source_database_fingerprint" \
  "database_sha256=$database_checksum" \
  "upload_files=$upload_file_count" \
  "upload_bytes=$upload_byte_count" \
  > "$payload_directory/manifest.txt"

(
  cd "$payload_directory"
  restic backup --host "$backup_host" --tag qr --tag scheduled .
)

restic forget \
  --host "$backup_host" \
  --tag qr \
  --keep-daily "$keep_daily" \
  --keep-weekly "$keep_weekly" \
  --keep-monthly "$keep_monthly" \
  --prune
restic check

marker_temporary="$backup_state_directory/last-success.tmp"
printf '%s\n' \
  "completed_epoch=$completed_epoch" \
  "completed_at=$completed_at" \
  "backup_host=$backup_host" \
  > "$marker_temporary"
chmod 0640 "$marker_temporary"
mv -f "$marker_temporary" "$backup_state_directory/last-success"

backup_succeeded=true
notify_monitor
echo "Encrypted off-VPS backup completed at $completed_at"
