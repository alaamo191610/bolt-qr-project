#!/usr/bin/env bash
set -euo pipefail

backup_state_directory="${BACKUP_STATE_DIR:-/var/lib/qr/backup-state}"
maximum_age_hours="${BACKUP_MAX_AGE_HOURS:-26}"
marker_file="$backup_state_directory/last-success"

if [[ ! "$maximum_age_hours" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_MAX_AGE_HOURS must be a positive integer" >&2
  exit 64
fi
if [[ ! -r "$marker_file" ]]; then
  echo "Backup freshness check failed: no successful backup marker" >&2
  exit 1
fi

completed_epoch="$(sed -n 's/^completed_epoch=//p' "$marker_file")"
if [[ ! "$completed_epoch" =~ ^[0-9]+$ ]]; then
  echo "Backup freshness check failed: invalid success marker" >&2
  exit 1
fi

current_epoch="${BACKUP_CHECK_NOW_EPOCH:-$(date -u +'%s')}"
if [[ ! "$current_epoch" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_CHECK_NOW_EPOCH must be an epoch timestamp" >&2
  exit 64
fi

age_seconds=$(( current_epoch - completed_epoch ))
maximum_age_seconds=$(( maximum_age_hours * 60 * 60 ))
if (( age_seconds < 0 || age_seconds > maximum_age_seconds )); then
  echo "Backup freshness check failed: last success is outside the ${maximum_age_hours}-hour window" >&2
  exit 1
fi

echo "Backup freshness check passed: age ${age_seconds}s"
