#!/usr/bin/env bash

# USAGE:
# chmod +x /path/to/aperture/deploy.sh
# crontab -e

# Then add a line like:

# */5 * * * * /path/to/aperture/deploy.sh >> /var/log/aperture-deploy.log 2>&1

# That checks every 5 minutes and rebuilds only when git pull actually fetched something. Adjust the interval to taste.

set -euo pipefail

cd "$(dirname "$0")"

[[ -f .env ]] && set -a && . ./.env && set +a

output=$(git pull 2>&1)
echo "$output"

if echo "$output" | grep -q "Already up to date."; then
  exit 0
fi

docker compose up -d --build

if [[ -n "${DISCORD_DEPLOY_WEBHOOK:-}" ]]; then
  commit=$(git rev-parse --short HEAD)
  branch=$(git rev-parse --abbrev-ref HEAD)
  subject=$(git log -1 --pretty=%s)
  payload=$(printf '{"content":"Aperture deployed: `%s@%s` — %s"}' "$branch" "$commit" "${subject//\"/\\\"}")
  curl -fsS -H "Content-Type: application/json" -X POST -d "$payload" "$DISCORD_DEPLOY_WEBHOOK" || true
fi
