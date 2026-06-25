#!/bin/sh
set -e

if [ "${PRISMA_DB_PUSH:-true}" = "true" ]; then
  echo "Applying Prisma schema to database..."
  npx prisma db push --schema=/app/prisma/schema.prisma --skip-generate
fi

exec "$@"
