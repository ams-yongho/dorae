# 로컬 도커 배포 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dorae`(Next.js 16 + Prisma + NextAuth + Slack 알리미)를 사내 머신에서 24/7 상시 가동하기 위한 docker-compose 구성을 추가한다. DB는 호스트의 기존 Postgres를 사용하고, 크론은 사이드카 컨테이너가 15분마다 트리거한다.

**Architecture:** 2개 컨테이너(`app`, `cron`) compose. app은 Next.js standalone 멀티스테이지 빌드, cron은 alpine + crond 사이드카로 compose 내부 DNS(`app:3000`)에 POST. 호스트 Postgres는 `host.docker.internal` (Linux 호환 위해 `host-gateway` 명시).

**Tech Stack:** Docker, docker-compose v2, node:20-alpine, alpine:3.20, Next.js 16(`output: 'standalone'`), Prisma 5, pnpm 9 (corepack).

**Spec:** [docs/superpowers/specs/2026-05-20-local-docker-deploy-design.md](../specs/2026-05-20-local-docker-deploy-design.md)

---

## File Structure

신규 파일:
- `Dockerfile` — app 멀티스테이지 빌드 (deps/builder/runner)
- `.dockerignore` — 빌드 컨텍스트에서 제외할 파일들
- `docker-compose.yml` — app + cron 서비스 정의
- `.env.docker.example` — 도커 운영용 env 템플릿
- `docker/app/entrypoint.sh` — `prisma migrate deploy` → `node server.js`
- `docker/cron/Dockerfile` — cron 사이드카 이미지
- `docker/cron/crontab` — crontab 라인 1개
- `docker/cron/notify.sh` — env에서 `CRON_SECRET` 읽어 curl 호출

수정 파일:
- `next.config.ts` — `output: 'standalone'` 추가
- `.gitignore` — `!.env.docker.example` 예외 라인 추가 (기존 `.env*` 규칙이 가림)
- `README.md` — "로컬 도커 배포" 섹션 추가

각 파일 1개 책임. compose는 인프라 정의, app/cron Dockerfile은 각자 이미지 빌드만, entrypoint/notify.sh는 각각 한 가지 시점의 한 가지 작업.

---

## Task 1: 빌드 준비 (Next standalone + ignore 파일)

**Files:**
- Modify: `next.config.ts`
- Modify: `.gitignore`
- Create: `.dockerignore`

- [ ] **Step 1: `next.config.ts`에 standalone 출력 옵션 추가**

기존 파일 내용을 다음으로 교체:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: standalone 빌드 검증**

```bash
pnpm install
pnpm build
ls .next/standalone/server.js
ls .next/standalone/package.json
```
Expected: 두 파일 모두 존재. 빌드 로그 끝에 `Creating an optimized production build ... ✓`.

만약 `.next/standalone/`이 만들어지지 않으면 다음 작업을 진행하기 전에 Next.js 버전(`pnpm why next`)과 `next.config.ts` 적용 여부(빌드 로그 상단)를 다시 확인.

- [ ] **Step 3: `.gitignore`에 `.env.docker.example` 예외 추가**

기존 파일의 다음 두 줄
```
.env*
!.env.local.example
```
을 다음으로 교체:
```
.env*
!.env.local.example
!.env.docker.example
```

- [ ] **Step 4: `.dockerignore` 생성**

`/Users/yonghokim/Documents/GitHub/amass/dorae/.claude/worktrees/goofy-knuth-3c8a77/.dockerignore` (worktree 루트):

```
# git
.git
.gitignore

# deps & build outputs
node_modules
.next
out
build
coverage

# env
.env
.env.*
!.env.docker.example

# editor / OS
.DS_Store
*.tsbuildinfo
.vscode
.idea

# docs/spec/claude
docs
.claude
.serena
AGENTS.md
CLAUDE.md
README.md

# tests/dev-only
*.test.ts

# logs
*.log
npm-debug.log*
yarn-debug.log*
.pnpm-debug.log*
```

- [ ] **Step 5: 커밋**

```bash
git add next.config.ts .gitignore .dockerignore
git commit -m "chore(docker): Next standalone 출력 + .dockerignore 추가"
```

---

## Task 2: app Dockerfile (멀티스테이지)

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: 멀티스테이지 Dockerfile 작성**

`/Users/yonghokim/Documents/GitHub/amass/dorae/.claude/worktrees/goofy-knuth-3c8a77/Dockerfile` (worktree 루트):

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- deps ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# corepack: pnpm 활성화
RUN corepack enable

# 의존성 파일만 먼저 복사 (캐시 최적화)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# prisma schema는 postinstall(`prisma generate`)에 필요
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# ---------- builder ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- runner ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache tini openssl
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Seoul

# next.js standalone 산출물
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# prisma migrate deploy를 entrypoint에서 돌리기 위해 CLI/엔진/스키마/마이그레이션 복사
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# entrypoint
COPY docker/app/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# 비-root 유저
USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
```

- [ ] **Step 2: 빌드 검증 (entrypoint.sh가 아직 없어 일부 실패 예상)**

```bash
docker build -t dorae-app:test --target builder .
```
Expected: `builder` 스테이지까지 성공. 마지막 로그에 `naming to docker.io/library/dorae-app:test` 또는 빌드 완료 메시지.

> 전체 빌드는 Task 3에서 entrypoint.sh 추가 후 수행한다.

- [ ] **Step 3: 커밋**

```bash
git add Dockerfile
git commit -m "feat(docker): app 멀티스테이지 Dockerfile 추가"
```

---

## Task 3: app entrypoint 스크립트

**Files:**
- Create: `docker/app/entrypoint.sh`

- [ ] **Step 1: `docker/app/` 디렉토리 생성 및 스크립트 작성**

```bash
mkdir -p docker/app
```

`/Users/yonghokim/Documents/GitHub/amass/dorae/.claude/worktrees/goofy-knuth-3c8a77/docker/app/entrypoint.sh`:

```sh
#!/bin/sh
set -e

echo "[entrypoint] prisma migrate deploy"
npx --no-install prisma migrate deploy

echo "[entrypoint] starting Next.js standalone server on :${PORT:-3000}"
exec node server.js
```

- [ ] **Step 2: 실행권한 부여 (git에 기록되도록)**

```bash
chmod +x docker/app/entrypoint.sh
git update-index --chmod=+x docker/app/entrypoint.sh 2>/dev/null || true
```

- [ ] **Step 3: 전체 app 이미지 빌드 검증**

```bash
docker build -t dorae-app:test .
```
Expected: 마지막 단계까지 성공. `runner` 스테이지에서 `COPY docker/app/entrypoint.sh ./entrypoint.sh`와 `chmod +x` 모두 통과.

- [ ] **Step 4: 컨테이너 단독 부트 확인 (DB 없이 — migrate 실패해야 정상)**

```bash
docker run --rm --name dorae-test \
  -e DATABASE_URL='postgresql://invalid:invalid@127.0.0.1:1/none' \
  dorae-app:test
```
Expected: 로그 첫 줄에 `[entrypoint] prisma migrate deploy` 출력 후 DB 접속 실패로 종료. **이미지 자체는 정상**임을 의미. 메시지에 `[entrypoint] prisma migrate deploy`가 보이지 않는다면 entrypoint 복사/권한 문제.

- [ ] **Step 5: 커밋**

```bash
git add docker/app/entrypoint.sh
git commit -m "feat(docker): app entrypoint 스크립트 (migrate + serve)"
```

---

## Task 4: cron 사이드카 이미지

**Files:**
- Create: `docker/cron/Dockerfile`
- Create: `docker/cron/crontab`
- Create: `docker/cron/notify.sh`

- [ ] **Step 1: `docker/cron/` 디렉토리 생성**

```bash
mkdir -p docker/cron
```

- [ ] **Step 2: `docker/cron/notify.sh` 작성**

```sh
#!/bin/sh
set -e

: "${CRON_SECRET:?CRON_SECRET is required}"
: "${APP_URL:=http://app:3000}"

echo "[cron] $(date -Iseconds) POST ${APP_URL}/api/cron/notify"
curl -sS -X POST \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/notify"
echo
```

- [ ] **Step 3: `docker/cron/crontab` 작성 (마지막 줄에 개행 필수)**

```
*/15 * * * * /usr/local/bin/notify.sh >> /proc/1/fd/1 2>&1
```

> crond는 파일 끝에 newline이 없으면 마지막 줄을 무시한다. 작성 후 `tail -c 1 docker/cron/crontab | xxd`로 `0a`(LF)가 보이는지 확인.

- [ ] **Step 4: `docker/cron/Dockerfile` 작성**

```dockerfile
FROM alpine:3.20

RUN apk add --no-cache curl tini tzdata && \
    cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

COPY crontab /etc/crontabs/root
COPY notify.sh /usr/local/bin/notify.sh
RUN chmod +x /usr/local/bin/notify.sh

ENV TZ=Asia/Seoul

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["crond", "-f", "-l", "2"]
```

- [ ] **Step 5: 실행권한 + 빌드 검증**

```bash
chmod +x docker/cron/notify.sh
git update-index --chmod=+x docker/cron/notify.sh 2>/dev/null || true

docker build -t dorae-cron:test ./docker/cron
```
Expected: 마지막 라인 빌드 성공.

- [ ] **Step 6: cron 컨테이너 동작 smoke test (`CRON_SECRET` 없이 실패해야 정상)**

```bash
docker run --rm dorae-cron:test /usr/local/bin/notify.sh 2>&1 | head -3
```
Expected: `CRON_SECRET is required` 메시지로 종료. notify.sh가 정상 실행되는 증거.

- [ ] **Step 7: 커밋**

```bash
git add docker/cron/Dockerfile docker/cron/crontab docker/cron/notify.sh
git commit -m "feat(docker): cron 사이드카 이미지 (crond + curl wrapper)"
```

---

## Task 5: docker-compose 구성

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.docker.example`

- [ ] **Step 1: `docker-compose.yml` 작성**

`/Users/yonghokim/Documents/GitHub/amass/dorae/.claude/worktrees/goofy-knuth-3c8a77/docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: dorae-app:local
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
    image: dorae-cron:local
    env_file: .env
    environment:
      APP_URL: http://app:3000
      TZ: Asia/Seoul
    depends_on:
      - app
    restart: unless-stopped
```

- [ ] **Step 2: `.env.docker.example` 작성**

`/Users/yonghokim/Documents/GitHub/amass/dorae/.claude/worktrees/goofy-knuth-3c8a77/.env.docker.example`:

```
# ===== 호스트 Postgres 연결 =====
# 도커에서 호스트로 접속하기 위해 host.docker.internal 사용 (compose에서 host-gateway 매핑)
DATABASE_URL=postgresql://USER:PASSWORD@host.docker.internal:5432/dorae
DIRECT_URL=postgresql://USER:PASSWORD@host.docker.internal:5432/dorae

# ===== NextAuth =====
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# ===== Slack =====
SLACK_BOT_TOKEN=xoxb-...
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=

# ===== 관리자 부트스트랩(fallback) =====
ADMIN_EMAILS=

# ===== 크론 인증 =====
CRON_SECRET=

# ===== 알림 fallback 채널 (선택) =====
NOTIFICATION_FALLBACK_CHANNEL=
```

- [ ] **Step 3: compose 설정 문법 검증**

`.env`가 아직 없으면 빈 파일 임시 생성 후 config 검증:

```bash
[ -f .env ] || touch .env
docker compose config > /dev/null && echo "compose config OK"
```
Expected: `compose config OK` 출력. 에러 발생 시 yaml 들여쓰기/키 이름 점검.

> 이 빈 `.env`는 gitignore 대상이라 커밋되지 않는다. 실제 값은 운영자가 `.env.docker.example`을 보고 채운다.

- [ ] **Step 4: compose 빌드 검증**

```bash
docker compose build
```
Expected: `app`, `cron` 두 이미지 모두 빌드 성공. 마지막 줄에 `Successfully built` 또는 BuildKit의 `naming to ...` 메시지 2개.

- [ ] **Step 5: 커밋**

```bash
git add docker-compose.yml .env.docker.example
git commit -m "feat(docker): compose + .env.docker.example 추가"
```

---

## Task 6: README 운영 가이드 추가

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 끝에 도커 섹션 추가**

`README.md`의 기존 마지막 줄 뒤에 다음 내용을 **그대로** append:

```markdown

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
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: 로컬 도커 배포 README 섹션 추가"
```

---

## Task 7: 통합 smoke test (수동, 운영자 머신에서 1회 실행)

**Files:** 변경 없음. 검증만.

> 이 태스크는 코드 수정 없이 운영자(또는 구현자)가 자기 머신에서 실제로 띄워 동작을 확인한다. 실패 시 앞 태스크로 돌아가 수정.

- [ ] **Step 1: 호스트 Postgres 접속 확인**

```bash
psql "$(grep '^DATABASE_URL' .env | cut -d= -f2- | tr -d '\"')" -c 'SELECT 1;'
```
Expected: `?column? \n----------\n 1\n(1 row)`

- [ ] **Step 2: compose up**

```bash
docker compose up -d --build
docker compose ps
```
Expected: 두 컨테이너 `STATUS=Up`.

- [ ] **Step 3: 마이그레이션 로그 확인**

```bash
docker compose logs app | grep -E "(prisma migrate|Listening|started|server)"
```
Expected: `[entrypoint] prisma migrate deploy` 라인 + 그 아래 `All migrations have been successfully applied.` 또는 `No pending migrations`, 이어서 Next 서버 기동 로그.

- [ ] **Step 4: HTTP 응답 확인**

```bash
curl -sI http://localhost:3000
```
Expected: `HTTP/1.1 200` 또는 `HTTP/1.1 307` (로그인 리다이렉트).

- [ ] **Step 5: 브라우저 로그인 1회 통과**

`http://localhost:3000` 접속 → Slack 로그인 → `/admins`/`/rules` 페이지 정상 표시 확인.

- [ ] **Step 6: 시드 (최초 1회)**

```bash
docker compose exec app pnpm db:seed
```
Expected: 시드 스크립트의 마지막 로그까지 에러 없음.

- [ ] **Step 7: 크론 동작 확인 (최대 15분 대기)**

```bash
docker compose logs -f cron
```
Expected: 다음 정시(00/15/30/45) 도래 시 `[cron] <timestamp> POST http://app:3000/api/cron/notify` 라인 1회 출력.

동시에 다른 터미널에서:
```bash
docker compose logs -f app | grep cron/notify
```
Expected: app 쪽에 `/api/cron/notify` 처리 로그.

- [ ] **Step 8: 재기동 후 데이터 보존 확인**

```bash
docker compose restart
sleep 5
curl -sI http://localhost:3000
# 브라우저에서 직전 추가한 관리자/규칙이 그대로인지 확인
```
Expected: 200/307 + 데이터 유지 (호스트 DB이므로 당연).

- [ ] **Step 9: 결과 기록 (선택)**

수동 검증 결과를 `docs/superpowers/plans/2026-05-20-local-docker-deploy.md` 마지막에 체크리스트로 남기거나, PR 본문에 첨부.

---

## 자체 점검 노트

- **Spec coverage**: 스펙 §1~§10 모든 항목 태스크에 대응. §11 변경 파일 목록 = 본 플랜 신규/수정 파일 목록과 일치.
- **호스트 Postgres 의존**: Task 5/7에서 사전 접속 검증 단계를 명시해 도커 빌드 성공 ≠ 동작 성공의 함정을 줄임.
- **권한 문제**: `entrypoint.sh`와 `notify.sh` 둘 다 `chmod +x` + `git update-index --chmod=+x`로 실행 비트를 git에 기록.
- **crontab newline**: alpine crond의 흔한 함정을 Task 4 Step 3 노트로 명시.
