#!/bin/sh
# Apply pending migrations against the mounted volume, then start the server.
# `migrate deploy` (not `migrate dev`) never resets or re-generates — it only
# applies migrations that have not run yet, so data survives every rebuild.
set -e

echo "edu-planner: applying migrations to ${DATABASE_URL}"
./node_modules/.bin/prisma migrate deploy --schema server/prisma/schema.prisma

exec "$@"
