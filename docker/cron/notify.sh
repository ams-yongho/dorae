#!/bin/sh
set -e

: "${CRON_SECRET:?CRON_SECRET is required}"
: "${APP_URL:=http://app:3000}"

echo "[cron] $(date -Iseconds) POST ${APP_URL}/api/cron/notify"
curl -sS -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/notify"
echo
