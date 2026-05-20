#!/usr/bin/env bash
# 도커 기동 후 검증.
# 마이그레이션 로그 / HTTP 응답 / seed / cron 로그를 차례로 확인한다.
# 브라우저 Slack 로그인과 /admins 접근은 수동이므로 마지막에 안내만 출력.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pass() { printf "  \033[32m[PASS]\033[0m %s\n" "$1"; PASSED=$((PASSED+1)); }
fail() { printf "  \033[31m[FAIL]\033[0m %s\n" "$1"; printf "         \033[33m→\033[0m %s\n" "$2"; FAILED=$((FAILED+1)); }

PASSED=0
FAILED=0

echo "==> 0. 컨테이너 상태"
if ! docker compose ps --status running --services 2>/dev/null | grep -q '^app$'; then
  fail "app 컨테이너가 실행 중이 아님" "pnpm docker:up 먼저 실행"
  echo
  echo "검증 중단: app이 떠 있지 않습니다."
  exit 1
fi
pass "app 컨테이너 Up"
if docker compose ps --status running --services 2>/dev/null | grep -q '^cron$'; then
  pass "cron 컨테이너 Up"
else
  fail "cron 컨테이너가 실행 중이 아님" "docker compose logs cron 확인"
fi

echo "==> 1. prisma migrate deploy 로그"
if docker compose logs app --tail=500 2>/dev/null | grep -q "prisma migrate deploy"; then
  pass "entrypoint에서 migrate 수행 흔적 확인"
else
  fail "migrate 로그를 찾지 못함" "docker compose logs app | head -50 확인"
fi

echo "==> 2. HTTP 응답"
STATUS="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000 2>/dev/null || echo "000")"
case "$STATUS" in
  200|307|302)
    pass "HTTP $STATUS"
    ;;
  *)
    fail "예상치 못한 HTTP 상태: $STATUS" "docker compose logs app --tail=100 확인"
    ;;
esac

echo "==> 3. seed 실행 (멱등)"
if docker compose exec -T app pnpm db:seed >/tmp/dorae-seed.log 2>&1; then
  pass "db:seed 종료 코드 0 (로그: /tmp/dorae-seed.log)"
else
  fail "db:seed 실패" "cat /tmp/dorae-seed.log"
fi

echo "==> 4. cron 로그"
CRON_LINES="$(docker compose logs cron --tail=50 2>/dev/null | grep -c '\[cron\]' || true)"
if [[ "$CRON_LINES" -gt 0 ]]; then
  pass "cron이 ${CRON_LINES}회 트리거됨"
else
  printf "  \033[33m[WAIT]\033[0m cron 트리거 기록 없음\n"
  printf "         \033[33m→\033[0m 다음 정시(00/15/30/45 KST) 후 다시 실행하세요\n"
fi

echo
printf "결과: \033[32m%d 통과\033[0m / \033[31m%d 실패\033[0m\n" "$PASSED" "$FAILED"
echo
echo "수동 확인 (자동화 불가):"
echo "  - 브라우저로 http://localhost:3000 접속 → Slack 로그인 성공"
echo "  - /admins 페이지 정상 표시 (ADMIN_EMAILS에 본인 이메일 등록 필요)"

[[ "$FAILED" -eq 0 ]]
