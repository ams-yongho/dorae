#!/usr/bin/env bash
# 도커 부트스트랩 사전 점검.
# Docker / compose / 호스트 Postgres / .env / 도커→호스트 접속을 차례로 확인한다.
# 실패 시 무엇이 왜 실패했는지 + 다음 행동을 출력하고 비-0으로 종료한다.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pass() { printf "  \033[32m[PASS]\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m[FAIL]\033[0m %s\n" "$1"; printf "         \033[33m→\033[0m %s\n" "$2"; exit 1; }
warn() { printf "  \033[33m[WARN]\033[0m %s\n" "$1"; }

echo "==> 1. Docker 데몬"
if docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  pass "Docker 가동 중 ($(docker version --format '{{.Server.Version}}'))"
else
  fail "Docker 데몬이 응답하지 않음" "Docker Desktop을 실행하세요"
fi

echo "==> 2. docker compose v2"
if docker compose version >/dev/null 2>&1; then
  pass "compose 사용 가능 ($(docker compose version --short))"
else
  fail "docker compose가 없음" "Docker Desktop 최신판 설치 또는 compose-plugin 설치"
fi

echo "==> 3. 호스트 Postgres"
if command -v pg_isready >/dev/null 2>&1; then
  if pg_isready -h 127.0.0.1 -p 5432 -q; then
    pass "Postgres 가동 중 (127.0.0.1:5432)"
  else
    fail "127.0.0.1:5432에서 Postgres가 응답하지 않음" "Postgres를 시작하세요 (예: brew services start postgresql@16)"
  fi
else
  warn "pg_isready 명령이 없어 스킵 (postgresql client 설치 권장)"
fi

echo "==> 4. .env 파일"
if [[ -f .env ]]; then
  pass ".env 존재"
else
  fail ".env 파일이 없음" "cp .env.docker.example .env 후 값 채우기"
fi

echo "==> 5. .env 필수 키"
REQUIRED_KEYS=(
  DATABASE_URL
  NEXTAUTH_SECRET
  SLACK_BOT_TOKEN
  SLACK_CLIENT_ID
  SLACK_CLIENT_SECRET
  SLACK_SIGNING_SECRET
  ADMIN_EMAILS
  CRON_SECRET
)
MISSING=()
for key in "${REQUIRED_KEYS[@]}"; do
  # 값이 비어있지 않은 라인이 한 개 이상 있어야 함
  if ! grep -E "^${key}=.+" .env >/dev/null 2>&1; then
    MISSING+=("$key")
  fi
done
if [[ ${#MISSING[@]} -eq 0 ]]; then
  pass "필수 키 ${#REQUIRED_KEYS[@]}개 모두 채워짐"
else
  fail ".env에서 비어있는 키: ${MISSING[*]}" ".env 파일을 열어 해당 키를 채우세요"
fi

echo "==> 6. DATABASE_URL 호스트 부분 검증"
DATABASE_URL_LINE="$(grep -E '^DATABASE_URL=' .env | head -1)"
DATABASE_URL_VALUE="${DATABASE_URL_LINE#DATABASE_URL=}"
# 앞뒤 따옴표 제거
DATABASE_URL_VALUE="${DATABASE_URL_VALUE%\"}"
DATABASE_URL_VALUE="${DATABASE_URL_VALUE#\"}"
DATABASE_URL_VALUE="${DATABASE_URL_VALUE%\'}"
DATABASE_URL_VALUE="${DATABASE_URL_VALUE#\'}"

# postgresql://USER:PW@HOST:PORT/DB 에서 HOST만 추출
DB_HOST="$(printf '%s' "$DATABASE_URL_VALUE" | sed -E 's|^[a-z]+://[^@]+@([^:/]+).*$|\1|')"

case "$DB_HOST" in
  localhost|127.0.0.1|::1|0.0.0.0)
    fail "DATABASE_URL의 호스트가 '$DB_HOST'" "도커 컨테이너 안의 '$DB_HOST'는 호스트 머신이 아니라 컨테이너 자기 자신을 가리킵니다. .env에서 호스트 부분을 'host.docker.internal'로 변경하세요"
    ;;
  "")
    fail "DATABASE_URL에서 호스트를 파싱하지 못함" "DATABASE_URL이 'postgresql://USER:PW@HOST:PORT/DB' 형식인지 확인"
    ;;
  *)
    pass "호스트: $DB_HOST"
    ;;
esac

echo "==> 7. 도커 → 호스트 Postgres 접속"
if docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    -e PGCONNECT_TIMEOUT=5 \
    postgres:16 \
    psql "$DATABASE_URL_VALUE" -c 'SELECT 1' >/dev/null 2>&1; then
  pass "도커에서 호스트 Postgres 접속 성공"
else
  fail "도커에서 호스트 Postgres 접속 실패" "postgresql.conf(listen_addresses='*')와 pg_hba.conf(172.16.0.0/12 허용) 점검 후 Postgres 재시작"
fi

echo
printf "\033[32mOK:\033[0m 'pnpm docker:up'로 기동할 수 있습니다.\n"
