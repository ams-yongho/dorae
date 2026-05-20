# 로컬 도커 부트스트랩 런북 설계

## 개요

PR #7 (`feat(docker): 로컬 도커 배포 구성 추가`)로 머지된 도커 배포 구성을 **사용자 머신에서 처음부터 24/7 가동 상태까지** 한 번에 가져가기 위한 부트스트랩 런북 + 부트스트랩/검증/운영 자동화 스크립트를 추가한다.

## 결정 사항 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | 런북 산출물 | 마크다운 단일 파일 (체크박스 런북) |
| 2 | 런북 위치 | `docs/superpowers/plans/2026-05-21-local-docker-bootstrap.md` |
| 3 | 대상 환경 | macOS (Docker Desktop) 1차, Linux는 차이점 메모로 보완 |
| 4 | 호스트 Postgres 가정 | Homebrew/Postgres.app 등 이미 설치돼 있음. 없으면 별도 단계로 안내 |
| 5 | 기존 인프라 코드 | 변경 없음. 기존 `Dockerfile` / `docker-compose.yml` / `.env.docker.example` 사용 |
| 6 | 자동화 스크립트 | 3개 추가 (`docker-precheck.sh`, `docker-verify.sh`, `docker-secrets.sh`) + npm script 단축 |
| 7 | 자동화 스코프 | 사전 점검·기동 후 검증·시크릿 생성·운영 단축. **건드리지 않는 것:** `postgresql.conf`/`pg_hba.conf` 자동 편집, `.env` 인터랙티브 입력 |
| 8 | 검증 방식 | 각 섹션 끝에 "기대 결과" + "실패 시 1차 디버깅". 자동화 가능한 검증은 `docker-verify.sh` 한 줄로도 실행 |
| 9 | 트러블슈팅 | 자주 막히는 5케이스만 (Postgres 접속, Slack 콜백, 마이그레이션, cron 무동작, 포트 충돌) |

---

## 1. 문서 구조

전체 9개 섹션. 각 섹션은 "한 번에 끝낼 수 있는 작업 단위"로 구성하고, 체크박스 `- [ ]`를 사용한다.

```
0. 사용 안내 (이 문서를 어떻게 따라가는가)
1. 사전 점검
2. 호스트 Postgres 준비
3. Slack 앱 설정
4. 시크릿 생성
5. .env 작성
6. 기동
7. 검증 6가지
8. 운영 명령 모음
9. 트러블슈팅
```

각 작업 항목은 다음 3요소를 포함한다:

1. **실행 명령** — 복붙 가능한 한 줄 또는 짧은 블록
2. **기대 결과** — "이게 보이면 성공"
3. **실패 시 1차 디버깅** — 가장 자주 막히는 원인 1개 + 확인 명령 (전체 트러블슈팅은 9번 섹션에 모음)

---

## 2. 섹션별 상세

### 섹션 1 — 사전 점검

- Docker Desktop 가동 확인: `docker version` (Server 라인 존재)
- compose v2: `docker compose version` (≥ 2.0)
- 호스트 Postgres 가동: `pg_isready -h 127.0.0.1 -p 5432`
- worktree/리포 루트에서 작업 중임 확인: `ls Dockerfile docker-compose.yml`

기대 결과: 4개 모두 OK. Postgres가 없으면 섹션 2에서 설치 옵션 안내.

### 섹션 2 — 호스트 Postgres 준비

- DB/유저 생성:
  ```
  createdb dorae
  createuser -P dorae   # 패스워드 입력
  psql -d dorae -c "GRANT ALL ON SCHEMA public TO dorae;"
  ```
- `postgresql.conf` 수정: `listen_addresses = '*'`
- `pg_hba.conf` 추가 라인:
  ```
  host  all  all  127.0.0.0/8     scram-sha-256
  host  all  all  172.16.0.0/12   scram-sha-256
  ```
- 재시작: `brew services restart postgresql@16` (Homebrew 기준; Postgres.app는 GUI 재시작)
- 호스트 접속 확인: `psql "postgresql://dorae:PW@127.0.0.1:5432/dorae" -c '\conninfo'`
- **도커에서 접속 확인** (이게 핵심):
  ```
  docker run --rm postgres:16 \
    psql "postgresql://dorae:PW@host.docker.internal:5432/dorae" -c 'SELECT 1'
  ```
  → `1` 출력되면 통과. 여기서 막히면 보통 `pg_hba.conf` 또는 `listen_addresses`.

### 섹션 3 — Slack 앱 설정

- Slack App 대시보드(https://api.slack.com/apps)에서 앱 열기
- **OAuth & Permissions** → Redirect URLs에 추가: `http://localhost:3000/api/auth/callback/slack`
- 다음 4개 값 확보(메모장에 임시 보관):
  - Bot User OAuth Token (`xoxb-...`)
  - Client ID
  - Client Secret
  - Signing Secret

기대 결과: 4개 값 모두 손에 있고 Redirect URL이 정확히 등록됨.

### 섹션 4 — 시크릿 생성

```
openssl rand -base64 32   # NEXTAUTH_SECRET용
openssl rand -base64 32   # CRON_SECRET용
```

기대 결과: 32바이트 base64 문자열 2개.

### 섹션 5 — `.env` 작성

```
cp .env.docker.example .env
```

채워야 할 키 (한 줄씩 명시):

- `DATABASE_URL`, `DIRECT_URL` — `host.docker.internal` 그대로 두고 USER/PASSWORD만 수정
- `NEXTAUTH_URL=http://localhost:3000` (그대로)
- `NEXTAUTH_SECRET` — 섹션 4 첫 번째 값
- `SLACK_BOT_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` — 섹션 3
- `ADMIN_EMAILS` — 본인 Slack 이메일 (콤마 구분 가능)
- `CRON_SECRET` — 섹션 4 두 번째 값
- `NOTIFICATION_FALLBACK_CHANNEL` — 선택, 비워둬도 됨

검증:
```
grep -E '^(DATABASE_URL|NEXTAUTH_SECRET|SLACK_BOT_TOKEN|CRON_SECRET|ADMIN_EMAILS)=' .env | grep -v '=$'
```
→ 5줄 모두 출력되면 빈 값 없음.

### 섹션 6 — 기동

```
docker compose up -d --build
docker compose ps
```

기대 결과: `app`, `cron` 두 서비스 모두 `Up` 상태. 첫 빌드는 3~5분 소요.

### 섹션 7 — 검증 6가지

PR #7 Test plan과 동일한 체크리스트:

1. `docker compose logs app | grep "prisma migrate deploy"` → 성공 라인 + Next 서버 기동 라인
2. `curl -I http://localhost:3000` → `HTTP/1.1 200` 또는 `307`
3. 브라우저로 `http://localhost:3000` → Slack 로그인 성공
4. `/admins` 페이지 정상 표시 (본인 이메일이 `ADMIN_EMAILS`에 있어야 접근 가능)
5. `docker compose exec app pnpm db:seed` → "Seed completed" 류 메시지
6. 다음 정시(00/15/30/45 KST) 후 `docker compose logs cron`에 `[cron] ... POST /api/cron/notify` 라인 + `docker compose logs app`에 처리 흔적

### 섹션 8 — 운영 명령 모음

| 작업 | 명령 |
|---|---|
| 재시작 | `docker compose restart` |
| 로그 팔로우 | `docker compose logs -f app` |
| 코드 업데이트 | `git pull && docker compose up -d --build` |
| 시드 재실행 | `docker compose exec app pnpm db:seed` |
| Prisma Studio | 호스트에서 `pnpm db:studio` (DB는 호스트 Postgres라 그대로 동작) |
| 백업 | `pg_dump -h 127.0.0.1 -U dorae dorae > dorae-$(date +%F).sql` |
| 완전 중지 | `docker compose down` (데이터는 호스트 DB라 무관) |

### 섹션 9 — 트러블슈팅

5케이스만:

1. **`host.docker.internal` 접속 실패**
   - 증상: `docker compose logs app`에 `connect ECONNREFUSED` 또는 `password authentication failed`
   - 1차 확인: `docker run --rm postgres:16 psql "postgresql://dorae:PW@host.docker.internal:5432/dorae" -c 'SELECT 1'`
   - 흔한 원인: `listen_addresses = '*'` 미적용, `pg_hba.conf`에 `172.16.0.0/12` 누락, Postgres 재시작 누락

2. **Slack 로그인 후 `redirect_uri` mismatch**
   - 1차 확인: Slack App OAuth Redirect URLs에 **정확히** `http://localhost:3000/api/auth/callback/slack`
   - 끝에 슬래시 없음, `http`(https 아님), 포트 명시

3. **마이그레이션 실패로 app 컨테이너가 Up이 안 됨**
   - 1차 확인: `docker compose logs app | head -50`에서 에러 원문
   - 흔한 원인: DB 접속 실패(케이스 1), 권한 부족(`GRANT ALL ON SCHEMA public`)

4. **cron이 호출은 하는데 알림이 안 나감**
   - 1차 확인: `docker compose logs app | grep "/api/cron/notify"`로 200 응답인지
   - `/rules`의 발송 시각이 현재 시각의 15분 윈도우 안에 들어와야 발송됨. 테스트하려면 발송 시각을 가까운 미래로 잠시 옮김

5. **포트 3000 충돌**
   - 증상: `bind: address already in use`
   - 1차 확인: `lsof -nP -iTCP:3000 -sTCP:LISTEN`
   - 흔한 원인: 호스트의 `pnpm dev`가 떠 있음 → 종료 후 `compose up` 재시도

---

## 3. 자동화 스크립트 명세

신규 파일:

```
scripts/
  docker-precheck.sh    # 사전 점검 (Docker, compose, 호스트 Postgres, 도커→호스트 접속, .env 키 존재)
  docker-verify.sh      # 기동 후 검증 (마이그레이션 로그, HTTP 200, seed 가능, cron 로그)
  docker-secrets.sh     # NEXTAUTH_SECRET / CRON_SECRET 2개 한 번에 출력
```

`package.json`에 npm script 추가:

| 명령 | 동작 |
|---|---|
| `pnpm docker:precheck` | `scripts/docker-precheck.sh` |
| `pnpm docker:secrets` | `scripts/docker-secrets.sh` |
| `pnpm docker:up` | `docker compose up -d --build` |
| `pnpm docker:down` | `docker compose down` |
| `pnpm docker:logs` | `docker compose logs -f --tail=100` |
| `pnpm docker:verify` | `scripts/docker-verify.sh` |
| `pnpm docker:seed` | `docker compose exec app pnpm db:seed` |
| `pnpm docker:restart` | `docker compose restart` |

### 3.1 `docker-precheck.sh`

`set -euo pipefail`로 시작. 다음을 순서대로 확인하고, 실패하면 무엇이 왜 실패했는지 + 다음 행동을 출력하고 비-0으로 종료.

1. `docker version` (Server 라인) → 실패 시 "Docker Desktop 실행 필요"
2. `docker compose version` (≥ 2.0) → 실패 시 "compose v2 필요"
3. `command -v pg_isready` → 없으면 스킵하지 말고 경고
4. `pg_isready -h 127.0.0.1 -p 5432` → 실패 시 "호스트 Postgres 미가동"
5. `.env` 존재 → 없으면 "`.env.docker.example` 복사 후 채우기" 안내
6. `.env`에서 다음 키가 비어있지 않은지: `DATABASE_URL`, `NEXTAUTH_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `ADMIN_EMAILS`, `CRON_SECRET`
7. **도커→호스트 Postgres 접속 확인** — `.env`에서 `DATABASE_URL` 파싱해 `docker run --rm postgres:16 psql "$URL" -c 'SELECT 1'`. 실패 시 "`pg_hba.conf` / `listen_addresses` 점검" 안내

모두 통과하면 `OK: ready to run 'pnpm docker:up'` 출력.

### 3.2 `docker-verify.sh`

`docker compose ps`로 두 서비스 `Up` 확인 후:

1. `docker compose logs app --tail=200 | grep -q "prisma migrate deploy"` → migrate 라인 존재
2. `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000` → `200` 또는 `307`
3. `docker compose exec -T app pnpm db:seed` → 종료 코드 0 (멱등이라 재실행 안전)
4. cron 로그: `docker compose logs cron --tail=50` 출력. 정시 전이면 "다음 정시(00/15/30/45) 후 다시 실행하세요" 안내

각 항목 `[PASS]` / `[FAIL]` 형식으로 출력. 마지막에 통과 개수 요약.

브라우저 Slack 로그인 / `/admins` 접근은 수동이므로 출력 끝에 별도 안내.

### 3.3 `docker-secrets.sh`

```sh
#!/usr/bin/env bash
set -euo pipefail
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
```

복사해서 `.env`에 붙이는 용도.

### 3.4 런북-스크립트 연계

런북 각 섹션은 **(a) 단축 명령 + (b) 손으로 푸는 내부 명령**을 둘 다 노출한다. 예:

```
### 섹션 1 — 사전 점검

자동: `pnpm docker:precheck`

수동(스크립트가 안 돌 때): 아래 명령을 직접 실행
- docker version
- docker compose version
- ...
```

이렇게 하면 자동화가 막혀도 사용자가 원인을 파악·복구할 수 있다.

---

## 4. 비범위 (이번 작업에서 하지 않는 것)

- **`postgresql.conf` / `pg_hba.conf` 자동 편집** — sudo 필요, OS/설치 방식별 경로 차이, 잘못 건드리면 위험. 런북에 명령만 안내
- **`.env` 인터랙티브 입력기** — Slack 토큰 4개를 prompt하는 건 잘 안 쓰임. 검증만 자동화
- healthcheck / log rotation / restart 정책 강화 — 첫 가동 후 실제 통증 보고 별도 작업
- LAN 노출 / HTTPS / 리버스 프록시 — 사내 머신 loopback 가정에서 불필요
- watchtower 자동 업데이트 — `git pull && pnpm docker:up` 수동으로 충분

위 항목들이 필요해지면 각자 별도 spec/plan으로 진행한다.

---

## 5. 검증 방법

산출물은 마크다운 1개 + 셸 스크립트 3개 + `package.json` 수정이다. 검증은 두 단계:

1. **셀프 리뷰** — 작성 후, 각 명령이 macOS + Homebrew Postgres 기준으로 실제 동작하는지 (문법, 옵션, 출력 형식). 스크립트는 `bash -n` syntax 체크 + 실제 호출
2. **사용자 1회 실행** — 사용자가 런북을 처음부터 끝까지 따라가서 검증 6가지를 모두 통과하면 완료. `pnpm docker:precheck` / `pnpm docker:verify`가 그린이어야 함. 막히는 지점은 트러블슈팅 섹션에 피드백 반영
