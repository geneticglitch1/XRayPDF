#!/bin/sh
set -e

# Apply any pending database migrations before starting the server. The Prisma
# CLI is invoked directly (build/index.js) so we don't depend on a .bin symlink
# surviving the multi-stage copy.
echo "Running prisma migrate deploy..."
node node_modules/prisma/build/index.js migrate deploy

echo "Starting server..."
exec "$@"
