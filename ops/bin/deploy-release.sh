#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <source-directory> <release-id>" >&2
  exit 64
fi

source_directory="$(cd "$1" && pwd -P)"
release_id="$2"
release_root="${qr_RELEASE_ROOT:-/opt/qr/releases}"
current_link="${qr_CURRENT_LINK:-/opt/qr/current}"
previous_link="${qr_PREVIOUS_LINK:-/opt/qr/previous}"
health_url="${qr_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"

if [[ ! "$release_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "Release ID must use 1-128 letters, numbers, dots, underscores, or hyphens" >&2
  exit 65
fi
if [[ ! -f "$source_directory/package-lock.json" || ! -f "$source_directory/server/index.js" ]]; then
  echo "Source directory is not a QR release" >&2
  exit 66
fi

release_directory="$release_root/$release_id"
if [[ -e "$release_directory" ]]; then
  echo "Release already exists: $release_directory" >&2
  exit 67
fi

install -d -m 0755 "$release_root"
install -d -m 0755 "$release_directory"
rsync -a \
  --exclude '.env' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'node_modules' \
  --exclude 'uploads' \
  "$source_directory/" "$release_directory/"
printf 'RELEASE_VERSION=%s\n' "$release_id" > "$release_directory/.release.env"
chmod 0644 "$release_directory/.release.env"

cd "$release_directory"
env -u DATABASE_URL -u MIGRATION_DATABASE_URL -u JWT_SECRET -u SUPER_ADMIN_MFA_ENCRYPTION_KEY \
  -u SENTRY_DSN -u SENTRY_AUTH_TOKEN -u SENTRY_ORG -u SENTRY_PROJECT npm ci
env -u DATABASE_URL -u MIGRATION_DATABASE_URL -u JWT_SECRET -u SUPER_ADMIN_MFA_ENCRYPTION_KEY \
  -u SENTRY_DSN -u SENTRY_AUTH_TOKEN -u SENTRY_ORG -u SENTRY_PROJECT npm run prisma:generate
env -u DATABASE_URL -u MIGRATION_DATABASE_URL -u JWT_SECRET -u SUPER_ADMIN_MFA_ENCRYPTION_KEY \
  -u SENTRY_DSN \
  SENTRY_RELEASE="$release_id" \
VITE_RELEASE_VERSION="$release_id" \
VITE_SENTRY_ENVIRONMENT="${VITE_SENTRY_ENVIRONMENT:-${SENTRY_ENVIRONMENT:-pilot}}" \
npm run build
npm run migrate:deploy
npm run verify:database-roles

current_target=""
if [[ -L "$current_link" ]]; then
  current_target="$(readlink -f "$current_link")"
  if [[ "$current_target" != "$release_root/"* ]]; then
    echo "Current release points outside $release_root" >&2
    exit 68
  fi
fi

next_link="${current_link}.next"
previous_next_link="${previous_link}.next"
if [[ -L "$next_link" ]]; then unlink "$next_link"; fi
ln -s "$release_directory" "$next_link"
mv -Tf "$next_link" "$current_link"

if [[ -n "$current_target" ]]; then
  if [[ -L "$previous_next_link" ]]; then unlink "$previous_next_link"; fi
  ln -s "$current_target" "$previous_next_link"
  mv -Tf "$previous_next_link" "$previous_link"
fi

systemctl restart qr.service
curl --fail --silent --show-error --retry 12 --retry-delay 2 "$health_url" >/dev/null
echo "Deployed release $release_id"
