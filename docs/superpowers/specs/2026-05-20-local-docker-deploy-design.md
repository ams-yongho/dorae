# 로컬 도커 배포 설계

## 개요

`dorae`(Next.js 16 + Prisma + NextAuth + Slack 알리미)를 사내 머신에서 24/7 상시 가동하기 위해 도커 컴포즈로 배포한다. 호스트 머신의 `localhost`에서만 접근하며, DB는 **호스트의 기존 Postgres**를 그대로 사용한다. 크론 트리거(`/api/cron/notify`)는 별도 사이드카 컨테이너가 15분마다 호출한다.

## 결정 사항 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | 배포 형태 | docker compose, 2 컨테이너(`app`, `cron`) |
| 2 | 빌드 방식 | Next.js `output: 'standalone'` 멀티스테이지 |
| 3 | DB | **호스트 머신의 기존 Postgres** (도커 안에 db 컨테이너 두지 않음) |
| 4 | 호스트 접근 | `host.docker.internal` (Linux 호환 위해 `host-gateway` 명시) |
| 5 | 마이그레이션 | app entrypoint에서 `prisma migrate deploy` 자동 |
| 6 | 시드 | 수동 1회 (`docker compose exec app pnpm db:seed`) |
| 7 | 크론 | alpine + crond 사이드카, 컨테이너 간 DNS로 `app:3000` 호출 |
| 8 | 외부 노출 | `app`만 `127.0.0.1:3000:3000` (호스트 loopback) |
| 9 | 시크릿 | 루트 `.env` 파일(gitignore), compose가 로드 |
| 10 | 시간대 | 컨테이너에 `TZ=Asia/Seoul` 명시 |

---

## 1. 아키텍처

```
┌───────────────────────────── 호스트 머신 ─────────────────────────────┐
│                                                                       │
│   Postgres (기존, :5432)  ◀─────────────┐                              │
│                                          │                            │
│  ┌──────────── docker compose 네트워크 ──┼──────────────────────────┐ │
│  │                                       │                          │ │
│  │   app  ─────────► host.docker.internal:5432 (호스트 Postgres)    │ │
│  │   :3000                                                          │ │
│  │     ▲                                                            │ │
│  │     │ POST /api/cron/notify (15분 간격)                          │ │
│  │     │                                                            │ │
│  │   cron (crond + curl)                                            │ │
│  │                                                                  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│   브라우저 ──► http://localhost:3000  ──► app 컨테이너                 │
└───────────────────────────────────────────────────────────────────────┘
```

- `app`만 호스트 loopback에 포트 매핑: `127.0.0.1:3000:3000`. LAN 노출 안 함.
- `cron`은 외부 포트 없음. compose 내부 DNS(`app`)로만 통신.
- 양쪽 컨테이너 모두 호스트 Postgres에 닿기 위해 `extra_hosts: ["host.docker.internal:host-gateway"]` 명시.

---

## 2. 파일 구성

신규 추가:
```
Dockerfile                      # app 멀티스테이지 빌드
.dockerignore
docker-compose.yml
.env.docker.example             # 도커 운영용 env 템플릿
docker/
  app/
    entrypoint.sh               # migrate deploy → node server.js
  cron/
    Dockerfile                  # alpine + curl + tini
    crontab                     # */15 * * * * /usr/local/bin/notify.sh
    notify.sh                   # env에서 CRON_SECRET 읽어 curl 호출
```

수정:
- `next.config.ts` — `output: 'standalone'` 추가
- `README.md` — "로컬 도커 배포" 섹션 추가 (사전 조건/운영 명령/트러블슈팅)

---

## 3. app 이미지 (멀티스테이지)

3단계 스테이지:

**deps** (`node:20-alpine`)
- corepack으로 pnpm 활성화
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `prisma/` 복사
- `pnpm install --frozen-lockfile` — postinstall이 `prisma generate` 자동 실행

**builder** (`node:20-alpine`)
- deps의 `node_modules` 복사 + 전체 소스 복사
- `pnpm build` — Next standalone 산출물 생성 (`.next/standalone`, `.next/static`)

**runner** (`node:20-alpine`, 슬림)
- `apk add --no-cache tini openssl` (prisma 엔진이 openssl 필요)
- 비-root user `node`로 전환
- 다음만 복사:
  - `.next/standalone/` → `/app/`
  - `.next/static/` → `/app/.next/static/`
  - `public/` → `/app/public/`
  - `prisma/` (schema + migrations)
  - `node_modules/.prisma/`, `node_modules/@prisma/client/`, `node_modules/prisma/` (migrate deploy CLI용)
  - `docker/app/entrypoint.sh`
- `ENV NODE_ENV=production TZ=Asia/Seoul PORT=3000 HOSTNAME=0.0.0.0`
- `ENTRYPOINT ["/sbin/tini", "--"]`
- `CMD ["./entrypoint.sh"]`

**entrypoint.sh**:
```sh
#!/bin/sh
set -e
npx prisma migrate deploy
exec node server.js
```

---

## 4. cron 사이드카

`docker/cron/Dockerfile`:
```dockerfile
FROM alpine:3.20
RUN apk add --no-cache curl tini
COPY crontab /etc/crontabs/root
COPY notify.sh /usr/local/bin/notify.sh
RUN chmod +x /usr/local/bin/notify.sh
ENV TZ=Asia/Seoul
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["crond", "-f", "-l", "2"]
```

`docker/cron/crontab`:
```
*/15 * * * * /usr/local/bin/notify.sh >> /proc/1/fd/1 2>&1
```

`docker/cron/notify.sh`:
```sh
#!/bin/sh
set -e
: "${CRON_SECRET:?CRON_SECRET is required}"
: "${APP_URL:=http://app:3000}"
curl -sS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/cron/notify"
echo
```

> alpine `crond`는 자식 프로세스에 환경변수를 그대로 물려주지 않는 경우가 있으므로, **wrapper 스크립트가 직접 env를 읽도록** 구성한다. compose는 `env_file: .env`로 `CRON_SECRET`을 컨테이너 env에 주입.

---

## 5. docker-compose.yml (요지)

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    env_file: .env
    environment:
      TZ: Asia/Seoul
    ports:
      - "127.0.0.1:3000:3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped

  cron:
    build:
      context: ./docker/cron
    env_file: .env
    environment:
      APP_URL: http://app:3000
      TZ: Asia/Seoul
    depends_on:
      - app
    restart: unless-stopped
```

볼륨/네트워크 추가 정의 없음 (compose 기본 bridge).

---

## 6. 환경 변수 (`.env`)

루트의 `.env`는 **gitignore 대상**. `.env.docker.example`을 새로 추가해 템플릿 제공.

```
# 호스트 Postgres
DATABASE_URL=postgresql://USER:PASSWORD@host.docker.internal:5432/dorae
DIRECT_URL=postgresql://USER:PASSWORD@host.docker.internal:5432/dorae

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=

# Admin
ADMIN_EMAILS=

# Cron
CRON_SECRET=

# 알림 fallback
NOTIFICATION_FALLBACK_CHANNEL=
```

`.env.local`(호스트 개발용)은 기존 그대로 유지.

---

## 7. 호스트 Postgres 사전 조건

`README.md`에 다음 트러블슈팅 섹션 추가:

1. **DB/유저 준비**: `dorae` 데이터베이스와 접속 가능한 유저가 있어야 함.
   ```bash
   createdb dorae
   createuser -P dorae
   ```
2. **외부 접속 허용**: Postgres.app/Homebrew 기본 설치는 보통 `localhost`만 듣고 있어 도커 브리지에서 접속이 막힌다. 다음을 1회 설정:
   - `postgresql.conf`: `listen_addresses = '*'`
   - `pg_hba.conf`에 한 줄 추가:
     ```
     host  all  all  127.0.0.0/8     scram-sha-256
     host  all  all  172.16.0.0/12   scram-sha-256   # docker bridge 기본 대역
     ```
   - `brew services restart postgresql` (또는 Postgres.app 재시작)
3. **사전 확인**: `psql "$DATABASE_URL"` 호스트에서 1회 성공 확인.

---

## 8. 운영 명령 (README 추가분)

```bash
# 빌드 + 기동 (백그라운드)
docker compose up -d --build

# 로그
docker compose logs -f app
docker compose logs -f cron

# 컨테이너 진입
docker compose exec app sh

# 시드 (최초 1회 수동)
docker compose exec app pnpm db:seed

# 호스트 psql로 직접 DB 확인
psql "$DATABASE_URL"

# 정지
docker compose down

# 재배포 (코드 갱신 후)
git pull && docker compose up -d --build
```

---

## 9. 검증 절차 (smoke test)

1. `psql "$DATABASE_URL"` → 호스트에서 DB 접속 성공.
2. `docker compose up -d --build` → 두 컨테이너 모두 `Up`.
3. `docker compose logs app`에 `prisma migrate deploy ... ✔` 라인 확인.
4. `curl -I http://localhost:3000` → 200 또는 307(로그인 리다이렉트).
5. 브라우저에서 `http://localhost:3000` 접속 → Slack 로그인 1회 통과.
6. `docker compose logs -f cron` → 15분 안에 `notify.sh` 호출 1회 관찰.
7. `docker compose logs app` → `/api/cron/notify` POST 처리 로그 확인.
8. `docker compose restart` 후 데이터(관리자/규칙) 보존 확인 (호스트 DB 사용이므로 당연).

---

## 10. 트레이드오프 / 주의점

- **NextAuth + Slack OAuth**: Slack 앱의 redirect URL에 `http://localhost:3000/api/auth/callback/slack`이 등록돼 있어야 함. localhost 전용이라 추가 작업 없음.
- **15분 윈도우 정렬**: cron은 `*/15`로 정시(00/15/30/45)에 트리거. 기존 알림 규칙의 "발송 시각 HH:MM의 15분 윈도우" 로직과 정합.
- **호스트 Postgres 의존**: 호스트 DB가 죽으면 앱도 같이 실패. 백업/모니터링은 호스트 Postgres 운영 정책에 위임 (이번 스코프 밖).
- **이미지 크기**: standalone + alpine 조합으로 ~200MB 수준 예상. prisma 엔진(.so)이 차지하는 비중이 큼.
- **Linux 이전성**: 사내 다른 머신(Linux)으로 옮길 때 `host-gateway`가 자동 동작하도록 `extra_hosts` 명시. 단, Linux에서는 호스트 Postgres의 `listen_addresses`/방화벽 설정이 macOS와 다를 수 있음.
- **백업**: 이번 설계 밖. 추후 필요 시 호스트 측 `pg_dump` 크론(launchd/systemd)으로 별도 처리.

---

## 11. 변경 파일 목록

신규:
- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `.env.docker.example`
- `docker/app/entrypoint.sh`
- `docker/cron/Dockerfile`
- `docker/cron/crontab`
- `docker/cron/notify.sh`

수정:
- `next.config.ts` — `output: 'standalone'` 추가
- `README.md` — "로컬 도커 배포" 섹션 추가
- `.gitignore` — `.env` 추가 (이미 있으면 생략)
