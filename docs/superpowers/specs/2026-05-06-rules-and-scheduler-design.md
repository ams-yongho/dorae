# 알림 규칙 관리 + 자동 발송 스케줄러 설계

## 개요

관리자가 알림 규칙을 편집하고, 매일 오전 10시(KST)에 자동으로 직원들에게 Slack DM을 발송하는 기능.

---

## 1. 알림 규칙 관리 UI (`/rules`)

### 구조

- 4개 카드 고정 배치: BIRTHDAY, ANNIVERSARY, CHECKUP, LEAVE_EXPIRY
- 각 카드: 활성/비활성 토글 + 편집 버튼
- 편집: 인라인 폼으로 수정

### 편집 항목

| 필드 | 설명 | 비고 |
|---|---|---|
| `daysBefore` | 며칠 전에 발송할지 (복수 입력) | 예: 30, 7, 1 |
| `messageTemplate` | 메시지 텍스트 | 변수 사용 가능 |
| `isEnabled` | 규칙 활성화 여부 | 토글 |
| `remainingThreshold` | 잔여 연차 임계값 | LEAVE_EXPIRY 전용 |

### 템플릿 변수

- `{{name}}` — 직원 이름
- `{{days_before}}` — 며칠 전
- `{{date}}` — 이벤트 날짜 (예: 5월 15일)

### 초기 데이터 (Seed)

앱 최초 실행 시 4개 기본 규칙을 DB에 생성. 이미 존재하면 건너뜀.

| 타입 | 기본 daysBefore | 기본 메시지 |
|---|---|---|
| BIRTHDAY | [7, 1] | `{{name}}님, 생일이 {{days_before}}일 후({{date}})입니다! 생일휴가 잊지 마세요 🎂` |
| ANNIVERSARY | [7, 1] | `{{name}}님, 입사 기념일이 {{days_before}}일 후({{date}})입니다! 🎉` |
| CHECKUP | [30, 7] | `{{name}}님, 건강검진 예정일이 {{days_before}}일 후({{date}})입니다. 일정을 확인해주세요 🏥` |
| LEAVE_EXPIRY | [30] | `{{name}}님, 연차가 {{leave_remaining}}일 남았습니다. 연말 전에 사용 계획을 세워보세요 📅` |

---

## 2. 자동 알림 스케줄러

### API Route

`POST /api/cron/notify`

- 인증: `Authorization: Bearer <CRON_SECRET>` 헤더
- 응답: `{ sent: number, failed: number, skipped: number }`

### 발송 로직

1. 활성화된 규칙 전체 조회
2. 활성 직원 전체 조회
3. 각 직원 × 각 규칙 조합으로 이벤트 날짜 계산:
   - **BIRTHDAY**: 올해 생일 (월/일 기준, 지났으면 내년)
   - **ANNIVERSARY**: 올해 입사 기념일 (월/일 기준, 지났으면 내년)
   - **CHECKUP**: `lastCheckupDate + checkupCycleMonths`
   - **LEAVE_EXPIRY**: `annualLeaveTotal - annualLeaveUsed <= remainingThreshold`이면 오늘 발송
4. `daysBefore` 배열 중 오늘과 일치하는 항목이 있으면 DM 발송
5. 중복 방지: `NotificationLog` unique constraint `(userId, ruleId, triggerDate, daysBefore)` 활용
6. 결과를 `NotificationLog`에 기록 (SENT / FAILED)

### 템플릿 렌더링

```
{{name}} → 직원 이름
{{days_before}} → 남은 일수
{{date}} → 이벤트 날짜 (M월 D일 형식)
{{leave_remaining}} → annualLeaveTotal - annualLeaveUsed
```

### crontab 설정 (로컬 서버)

```bash
# 시스템 타임존이 KST(Asia/Seoul)인 경우
0 10 * * * curl -X POST http://localhost:3000/api/cron/notify \
  -H "Authorization: Bearer <CRON_SECRET>"

# 시스템 타임존이 UTC인 경우
0 1 * * * curl -X POST http://localhost:3000/api/cron/notify \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## 구현 순서

1. Seed 스크립트 — 4개 기본 규칙 생성
2. Rules server actions — `updateRule`, `toggleRule`
3. Rules UI — 카드 목록 + 편집 폼
4. Cron API route — `/api/cron/notify`
5. 발송 로직 — 날짜 계산 + 템플릿 렌더링 + DM 발송
