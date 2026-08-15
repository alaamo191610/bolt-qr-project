#!/usr/bin/env bash
set -euo pipefail

release_root="${BOLT_QR_RELEASE_ROOT:-/opt/bolt-qr/releases}"
current_link="${BOLT_QR_CURRENT_LINK:-/opt/bolt-qr/current}"
previous_link="${BOLT_QR_PREVIOUS_LINK:-/opt/bolt-qr/previous}"
health_url="${BOLT_QR_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"

if [[ ! -L "$current_link" || ! -L "$previous_link" ]]; then
  echo "Both current and previous release links are required" >&2
  exit 66
fi

current_target="$(readlink -f "$current_link")"
previous_target="$(readlink -f "$previous_link")"
if [[ "$current_target" != "$release_root/"* || "$previous_target" != "$release_root/"* ]]; then
  echo "Release link points outside $release_root" >&2
  exit 68
fi

current_next_link="${current_link}.next"
previous_next_link="${previous_link}.next"
if [[ -L "$current_next_link" ]]; then unlink "$current_next_link"; fi
if [[ -L "$previous_next_link" ]]; then unlink "$previous_next_link"; fi
ln -s "$previous_target" "$current_next_link"
ln -s "$current_target" "$previous_next_link"
mv -Tf "$current_next_link" "$current_link"
mv -Tf "$previous_next_link" "$previous_link"

# This rolls back application code only. Database migrations must remain backward compatible.
systemctl restart bolt-qr.service
curl --fail --silent --show-error --retry 12 --retry-delay 2 "$health_url" >/dev/null
echo "Rolled back application to $(basename "$previous_target")"

