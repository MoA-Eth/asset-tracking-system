#!/bin/sh
# Start-up for the container: make sure the database is ready, then start the app.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. See .env.example." >&2
  exit 1
fi
if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "JWT_SECRET must be a random value of at least 32 characters. See .env.example." >&2
  exit 1
fi

# Bring the database tables in line with this version of the app. The first run creates them.
# A change that would lose data is refused here rather than applied; the release notes then
# say which upgrade script to run (docs/DEPLOYMENT.md, "Updating").
echo "Preparing the database..."
tries=0
until npx prisma db push --skip-generate >/tmp/db-push.log 2>&1; do
  tries=$((tries + 1))
  if grep -qiE "data loss|cannot be executed|accept-data-loss" /tmp/db-push.log; then
    cat /tmp/db-push.log >&2
    echo "The database needs an upgrade step that is not applied automatically. See docs/DEPLOYMENT.md, \"Updating\"." >&2
    exit 1
  fi
  if [ "$tries" -ge 30 ]; then
    cat /tmp/db-push.log >&2
    echo "The database could not be reached after 60 seconds." >&2
    exit 1
  fi
  echo "Waiting for the database ($tries/30)..."
  sleep 2
done
echo "Database ready."

# First run only: create the System Administrator, if one was configured and none exists yet
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  npx tsx prisma/seed.production.ts
fi

exec "$@"
