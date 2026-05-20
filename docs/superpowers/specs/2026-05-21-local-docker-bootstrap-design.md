# 로컬 도커 부트스트랩 런북 설계

## 개요

PR #7 (`feat(docker): 로컬 도커 배포 구성 추가`)로 머지된 도커 배포 구성을 **사용자 머신에서 처음부터 24/7 가동 상태까지** 한 번에 가져가기 위한 부트스트랩 런북을 작성한다. 코드 변경은 없다. 산출물은 마크다운 문서 1개.

## 결정 사항 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | 산출물 형태 | 마크다운 단일 파일 (체크박스 런북) |
| 2 | 위치 | `docs/superpowers/plans/2026-05-21-local-docker-bootstrap.md` |
| 3 | 대상 환경 | macOS (Docker Desktop) 1차, Linux는 차이점 메모로 보완 |
| 4 | 호스트 Postgres 가정 | Homebrew/Postgres.app 등 이미 설치돼 있음. 없으면 별도 단계로 안내 |
| 5 | 코드 변경 | 없음. 기존 `Dockerfile` / `docker-compose.yml` / `.env.docker.example` 사용 |
| 6 | 자동화 스크립트 | 추가하지 않음 (YAGNI). 모든 단계는 사용자가 직접 입력하는 명령 |
| 7 | 검증 방식 | 각 섹션 끝에 "기대 결과" + "실패 시 1차 디버깅" |
| 8 | 트러블슈팅 | 자주 막히는 5케이스만 (Postgres 접속, Slack 콜백, 마이그레이션, cron 무동작, 포트 충돌) |

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

## 3. 비범위 (이번 작업에서 하지 않는 것)

- 자동화 스크립트(`scripts/docker-bootstrap.sh`, npm 스크립트) — 1회 부트스트랩이라 ROI 낮음
- healthcheck / log rotation / restart 정책 강화 — 첫 가동 후 실제 통증 보고 별도 작업
- LAN 노출 / HTTPS / 리버스 프록시 — 사내 머신 loopback 가정에서 불필요
- watchtower 자동 업데이트 — `git pull && compose up -d --build` 수동으로 충분

위 항목들이 필요해지면 각자 별도 spec/plan으로 진행한다.

---

## 4. 검증 방법

런북 자체는 산출물 1개의 마크다운 문서다. 검증은 두 단계:

1. **셀프 리뷰** — 작성 후, 각 명령이 macOS + Homebrew Postgres 기준으로 실제 동작하는지 (문법, 옵션, 출력 형식)
2. **사용자 1회 실행** — 사용자가 처음부터 끝까지 따라가서 검증 6가지를 모두 통과하면 완료. 막히는 지점은 트러블슈팅 섹션에 피드백 반영
