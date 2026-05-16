# dorae

알리미

## 빠른 시작

```bash
# 1. 의존성 설치 (postinstall에서 prisma generate 자동 실행)
pnpm install

# 2. 환경변수 준비
cp .env.local.example .env.local
# .env.local 열어서 DATABASE_URL, SLACK_*, NEXTAUTH_SECRET, ADMIN_EMAILS, CRON_SECRET 채우기

# 3. DB 셋업 (Postgres가 떠 있어야 함)
pnpm db:setup    # prisma migrate dev + seed 한번에

# 4. 개발 서버
pnpm dev
```

### DB 관련 스크립트

| 명령 | 동작 |
|---|---|
| `pnpm db:setup` | 마이그레이션 + 시드 (최초 1회) |
| `pnpm db:migrate` | 마이그레이션만 적용 |
| `pnpm db:seed` | `NotificationRule` 시드 재실행 |
| `pnpm db:studio` | Prisma Studio 열기 |
| `pnpm db:reset` | DB 리셋 후 재마이그레이트 + 재시드 |

## 관리자 권한

관리자 권한은 DB의 `AdminUser` 테이블에서 관리되며, 로그인한 관리자가 `/admins`
페이지에서 추가/삭제할 수 있습니다.

`ADMIN_EMAILS` 환경변수는 **부트스트랩 및 비상 복구용 fallback**입니다. DB가
비어있거나 락아웃 상황에서 이 환경변수에 등록된 이메일은 항상 로그인 가능합니다.
운영 안정화 후 1명 정도만 유지하는 것을 권장합니다.

### 첫 관리자 추가

1. `.env.local`의 `ADMIN_EMAILS`에 자신의 Slack 이메일을 등록.
2. `pnpm dev`로 앱 실행 후 Slack 로그인.
3. `/admins` 페이지에서 동료 관리자들을 DB에 추가.
4. (선택) 안정화 후 `ADMIN_EMAILS`에서 일반 관리자 이메일을 제거하고 비상용 1명만 유지.

### 권한 회수

`/admins`에서 관리자를 삭제하면, 해당 사용자의 기존 JWT 세션은 다음 요청 시
즉시 무효화되어 자동 로그아웃됩니다 (NextAuth `jwt` 콜백이 매 요청마다
DB를 재검증하기 때문).

## 크론 트리거

`/api/cron/notify` 엔드포인트를 **매 15분(`*/15 * * * *`)** 주기로 호출하도록 외부 스케줄러(Vercel Cron 등)에 설정합니다. 관리자가 `/rules` 페이지에서 지정한 **발송 시각(HH:MM, KST)**의 15분 윈도우 안에 들어온 호출만 실제 메시지를 발송합니다. 그 외 호출은 즉시 무시됩니다.

```bash
curl -X POST https://<your-host>/api/cron/notify \
  -H "Authorization: Bearer $CRON_SECRET"
```
