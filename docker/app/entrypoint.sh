#!/bin/sh
set -e

echo "[entrypoint] prisma migrate deploy"
npx --no-install prisma migrate deploy

echo "[entrypoint] starting Next.js standalone server on :${PORT:-3000}"
exec node server.js
