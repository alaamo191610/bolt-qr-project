#!/usr/bin/env bash
set -euo pipefail

: "${APP_DATABASE:?APP_DATABASE is required}"
: "${CURRENT_OWNER_ROLE:?CURRENT_OWNER_ROLE is required}"
: "${MIGRATION_DB_ROLE:?MIGRATION_DB_ROLE is required}"
: "${RUNTIME_DB_ROLE:?RUNTIME_DB_ROLE is required}"

identifier_pattern='^[a-z_][a-z0-9_]{0,62}$'
for value in "$APP_DATABASE" "$CURRENT_OWNER_ROLE" "$MIGRATION_DB_ROLE" "$RUNTIME_DB_ROLE"; do
  if [[ ! "$value" =~ $identifier_pattern ]]; then
    echo "Database and role names must be lowercase PostgreSQL identifiers" >&2
    exit 64
  fi
done
if [[ "$MIGRATION_DB_ROLE" == "$RUNTIME_DB_ROLE" ]]; then
  echo "Migration and runtime roles must differ" >&2
  exit 65
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 69
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
sql_file="$(cd "$script_directory/../postgres" && pwd -P)/configure-role-boundaries.sql"

psql \
  --dbname "$APP_DATABASE" \
  --set ON_ERROR_STOP=1 \
  --set app_database="$APP_DATABASE" \
  --set current_owner_role="$CURRENT_OWNER_ROLE" \
  --set migration_role="$MIGRATION_DB_ROLE" \
  --set runtime_role="$RUNTIME_DB_ROLE" \
  --file "$sql_file"
