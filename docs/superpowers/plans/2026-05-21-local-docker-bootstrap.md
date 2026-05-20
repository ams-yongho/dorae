# 로컬 도커 부트스트랩 런북

> **목표:** PR #7로 머지된 도커 구성을 처음부터 24/7 가동 상태까지 한 번에 가져간다.
> **소요 시간:** 첫 가동 30~40분 (호스트 Postgres가 이미 준비돼 있다면 15분).
> **체크박스를 위에서부터 차례로 따라가세요.** 각 섹션은 (a) 자동 명령 (b) 손으로 푸는 수동 명령을 둘 다 보여줍니다.

스펙: [docs/superpowers/specs/2026-05-21-local-docker-bootstrap-design.md](../specs/2026-05-21-local-docker-bootstrap-design.md)

---

## 섹션 1 — 사전 점검

호스트가 도커를 띄울 준비가 됐는지 한 번에 확인.

- [ ] **자동:** `pnpm docker:precheck`

기대 결과: 6단계 모두 `[PASS]` + 마지막에 `OK: 'pnpm docker:up'로 기동할 수 있습니다.`

실패한 단계가 있으면 그 단계의 안내(`→ ...`)를 따라 해결하고 다시 실행.

수동(precheck가 안 도는 경우 직접 확인):

```bash
docker version                        # Server 라인 존재
docker compose version                # ≥ 2.0
pg_isready -h 127.0.0.1 -p 5432       # accepting connections
test -f .env && echo OK               # .env 존재
```

---

## 섹션 2 — 호스트 Postgres 준비

> 이미 `dorae` DB가 도커에서 접속 가능한 상태라면 (`pnpm docker:precheck` 6단계 통과) 이 섹션 스킵.

- [ ] **DB / 유저 생성**

  ```bash
  createdb dorae
  createuser -P dorae    # 패스워드 입력
  psql -d dorae -c "GRANT ALL ON SCHEMA public TO dorae;"
  ```

- [ ] **`postgresql.conf` 수정** — `listen_addresses` 변경

  파일 위치 예시:
  - Homebrew: `/opt/homebrew/var/postgresql@16/postgresql.conf`
  - Postgres.app: `~/Library/Application Support/Postgres/var-16/postgresql.conf`

  ```
  listen_addresses = '*'
  ```

- [ ] **`pg_hba.conf`에 두 줄 추가** (같은 디렉터리)

  ```
  host  all  all  127.0.0.0/8     scram-sha-256
  host  all  all  172.16.0.0/12   scram-sha-256
  ```

- [ ] **Postgres 재시작**

  ```bash
  brew services restart postgresql@16   # Homebrew 기준
  # Postgres.app: 메뉴에서 Restart
  ```

- [ ] **호스트에서 접속 확인**

  ```bash
  psql "postgresql://dorae:PASSWORD@127.0.0.1:5432/dorae" -c '\conninfo'
  ```

- [ ] **도커에서 접속 확인** (가장 중요)

  ```bash
  docker run --rm --add-host=host.docker.internal:host-gateway postgres:16 \
    psql "postgresql://dorae:PASSWORD@host.docker.internal:5432/dorae" -c 'SELECT 1'
  ```

  기대 결과: `?column?\n----------\n        1`

  여기서 막히면 보통 `pg_hba.conf` 또는 `listen_addresses` 미적용. Postgres 재시작을 까먹은 경우가 가장 흔함.

---

## 섹션 3 — Slack 앱 설정

Slack App 대시보드: <https://api.slack.com/apps>

- [ ] 앱 열기 (없으면 새로 만들기)
- [ ] **OAuth & Permissions → Redirect URLs** 에 추가

  ```
  http://localhost:3000/api/auth/callback/slack
  ```

  ⚠️ 끝에 슬래시 없음. `http` (https 아님). 포트 명시.

- [ ] 다음 4개 값을 메모장에 임시 보관:
  - **Bot User OAuth Token** (`xoxb-...`) — OAuth & Permissions 페이지
  - **Client ID** — Basic Information
  - **Client Secret** — Basic Information
  - **Signing Secret** — Basic Information

---

## 섹션 4 — 시크릿 생성

- [ ] **자동:** `pnpm docker:secrets`

  ```
  NEXTAUTH_SECRET=...32바이트 base64...
  CRON_SECRET=...32바이트 base64...
  ```

  이 두 줄을 그대로 복사해서 다음 섹션의 `.env`에 붙입니다.

수동:

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
```

---

## 섹션 5 — `.env` 작성

- [ ] **템플릿 복사**

  ```bash
  cp .env.docker.example .env
  ```

- [ ] **`.env`를 열어 다음 키를 채우기**

  | 키 | 값 |
  |---|---|
  | `DATABASE_URL` | `host.docker.internal`은 그대로 두고 USER/PASSWORD만 수정 |
  | `DIRECT_URL` | `DATABASE_URL`과 동일 |
  | `NEXTAUTH_URL` | `http://localhost:3000` (그대로) |
  | `NEXTAUTH_SECRET` | 섹션 4 첫 번째 값 |
  | `SLACK_BOT_TOKEN` | 섹션 3 (`xoxb-...`) |
  | `SLACK_CLIENT_ID` | 섹션 3 |
  | `SLACK_CLIENT_SECRET` | 섹션 3 |
  | `SLACK_SIGNING_SECRET` | 섹션 3 |
  | `ADMIN_EMAILS` | 본인 Slack 이메일 (콤마 구분 가능) |
  | `CRON_SECRET` | 섹션 4 두 번째 값 |
  | `NOTIFICATION_FALLBACK_CHANNEL` | 비워둬도 됨 |

- [ ] **검증** — 섹션 1 자동 점검을 한 번 더 돌려 모든 키가 채워졌는지 확인

  ```bash
  pnpm docker:precheck
  ```

  6단계 모두 `[PASS]`여야 다음 섹션 진행.

---

## 섹션 6 — 기동

- [ ] **자동:** `pnpm docker:up`

  ```bash
  pnpm docker:up
  ```

  첫 빌드는 3~5분 소요. `app` / `cron` 두 서비스가 모두 `Up` 상태가 돼야 함.

- [ ] **상태 확인**

  ```bash
  docker compose ps
  ```

수동(내부 명령): `docker compose up -d --build`

---

## 섹션 7 — 검증

- [ ] **자동:** `pnpm docker:verify`

  자동으로 확인하는 것:
  1. `app` / `cron` 컨테이너 `Up`
  2. entrypoint 마이그레이션 로그
  3. `http://localhost:3000` 응답 (200/302/307)
  4. `pnpm db:seed` 멱등 실행 성공
  5. cron 트리거 기록 (정시 전이면 `[WAIT]` 표시 — 정상)

- [ ] **수동으로만 가능한 확인**

  - [ ] 브라우저로 `http://localhost:3000` 접속 → Slack 로그인 성공
  - [ ] 로그인 후 `/admins` 페이지 정상 표시 (ADMIN_EMAILS에 본인 이메일이 있어야 접근 가능)
  - [ ] 다음 정시(00/15/30/45 KST) 도래 후 `docker compose logs cron`에 `[cron] ... POST /api/cron/notify` 라인 + `docker compose logs app`에 처리 흔적

---

## 섹션 8 — 운영 명령 모음

| 작업 | 명령 |
|---|---|
| 로그 팔로우 | `pnpm docker:logs` |
| 재시작 | `pnpm docker:restart` |
| 시드 재실행 | `pnpm docker:seed` |
| 코드 업데이트 후 재빌드 | `git pull && pnpm docker:up` |
| 완전 중지 | `pnpm docker:down` |
| Prisma Studio (호스트에서) | `pnpm db:studio` |
| 백업 | `pg_dump -h 127.0.0.1 -U dorae dorae > dorae-$(date +%F).sql` |
| 복원 | `psql -h 127.0.0.1 -U dorae -d dorae -f dorae-YYYY-MM-DD.sql` |

데이터는 호스트 Postgres에 있으므로 `docker compose down`/재빌드를 해도 데이터는 보존됩니다.

---

## 섹션 9 — 트러블슈팅

### 1. `host.docker.internal` 접속 실패

- 증상: `docker compose logs app`에 `connect ECONNREFUSED` 또는 `password authentication failed`
- 1차 확인:
  ```bash
  docker run --rm --add-host=host.docker.internal:host-gateway postgres:16 \
    psql "postgresql://dorae:PW@host.docker.internal:5432/dorae" -c 'SELECT 1'
  ```
- 흔한 원인:
  - `listen_addresses = '*'` 미적용
  - `pg_hba.conf`에 `172.16.0.0/12` 라인 누락
  - Postgres 재시작 누락
  - 패스워드 오타

### 2. Slack 로그인 후 `redirect_uri` mismatch

- 1차 확인: Slack App OAuth Redirect URLs에 **정확히** `http://localhost:3000/api/auth/callback/slack`
- 흔한 실수: 끝에 슬래시, `https`, 포트 누락

### 3. 마이그레이션 실패로 app 컨테이너가 Up이 안 됨

- 1차 확인:
  ```bash
  docker compose logs app | head -50
  ```
- 흔한 원인: DB 접속 실패(케이스 1), 권한 부족(`GRANT ALL ON SCHEMA public TO dorae` 누락)

### 4. cron이 호출은 하는데 알림이 안 나감

- 1차 확인:
  ```bash
  docker compose logs app | grep "/api/cron/notify"
  ```
  → 200 응답이어야 정상.
- 알림이 나가는 조건: `/rules`의 발송 시각이 현재 시각의 15분 윈도우 안에 있어야 함.
- 테스트하려면 `/rules`에서 발송 시각을 가까운 미래(다음 15분 안)로 잠시 옮기고 기다림.

### 5. 포트 3000 충돌

- 증상: `bind: address already in use`
- 1차 확인:
  ```bash
  lsof -nP -iTCP:3000 -sTCP:LISTEN
  ```
- 흔한 원인: 호스트의 `pnpm dev`가 떠 있음. 종료 후 `pnpm docker:up` 재시도.
