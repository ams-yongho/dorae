#!/usr/bin/env bash
# NEXTAUTH_SECRET / CRON_SECRET 두 개를 한 번에 출력.
# 출력 결과를 .env에 복사해서 붙이면 된다.

set -euo pipefail

echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
