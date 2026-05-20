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

---

## 로컬 도커 배포 (사내 상시 가동용)

호스트 머신에서 `docker compose`로 띄워 24/7 가동한다. 데이터는 **호스트의 기존 Postgres**에 그대로 쌓인다.

### 사전 조건

1. Docker Desktop(macOS) 또는 Docker Engine + compose v2 설치.
2. 호스트 Postgres에 `dorae` DB와 접속 가능한 유저 준비.
   ```bash
   createdb dorae
   createuser -P dorae   # 패스워드 입력
   ```
3. 호스트 Postgres가 **도커 브리지에서 접속 가능**해야 한다. Postgres.app/Homebrew 기본 설치는 `localhost`만 듣고 있어 도커에서 접속이 막힌다. 1회 설정:
   - `postgresql.conf`: `listen_addresses = '*'`
   - `pg_hba.conf`에 한 줄 추가:
     ```
     host  all  all  127.0.0.0/8     scram-sha-256
     host  all  all  172.16.0.0/12   scram-sha-256
     ```
   - Postgres 재시작 (`brew services restart postgresql@16` 등).
4. 호스트에서 접속 확인:
   ```bash
   psql "postgresql://dorae:PASSWORD@127.0.0.1:5432/dorae" -c '\conninfo'
   ```

### 환경 변수

```bash
cp .env.docker.example .env
# .env 열어서 DATABASE_URL, NEXTAUTH_SECRET, SLACK_*, ADMIN_EMAILS, CRON_SECRET 채우기
```

### 기동

```bash
docker compose up -d --build
docker compose logs -f app
```

브라우저: http://localhost:3000

### 운영 명령

| 명령 | 동작 |
|---|---|
| `docker compose up -d --build` | 빌드 + 백그라운드 기동 |
| `docker compose logs -f app` | 앱 로그 |
| `docker compose logs -f cron` | 크론 로그 (15분마다 호출 흔적) |
| `docker compose exec app sh` | app 컨테이너 진입 |
| `docker compose exec app pnpm db:seed` | 시드 수동 1회 |
| `docker compose restart app` | app만 재기동 |
| `docker compose down` | 정지 (DB는 호스트라 영향 없음) |
| `git pull && docker compose up -d --build` | 코드 갱신 후 재배포 |

### 트러블슈팅

- **`prisma migrate deploy` 실패 (`P1001` 등)**: 호스트 Postgres가 도커 브리지를 안 듣는다. 위 사전 조건 3번 재확인.
- **Slack 로그인 후 redirect 오류**: Slack 앱의 OAuth Redirect URL에 `http://localhost:3000/api/auth/callback/slack` 등록 필요.
- **`/api/cron/notify`가 401**: `.env`의 `CRON_SECRET`이 비었거나 앱/cron 컨테이너에 다른 값이 들어갔다. `docker compose up -d`로 양쪽 모두 재기동.
