# 알림 발송 시각(HH:MM) 전역 설정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 알림에 적용되는 발송 시각(HH:MM, KST)을 단일 설정으로 둔다. 관리자가 `/rules` 페이지에서 시각을 수정할 수 있고, 크론은 그 시각의 15분 윈도우 안에서만 실제 메시지를 발송한다.

**Architecture:** 단일 row만 갖는 `NotificationSettings` 모델(싱글톤)을 도입해 `sendHour`/`sendMinute`를 저장한다. 기존 `NotificationRule.daysBefore: Int[]`와 매칭 로직은 그대로 둔다. `runNotifications()`는 진입 시점에 settings를 한 번 로드하고, 현재 KST 시각이 `[sendHour:sendMinute, +15분)` 윈도우 밖이면 어떤 직원·규칙도 처리하지 않고 즉시 종료한다. 윈도우 안이면 기존 일자 매칭 로직을 그대로 사용. 크론 트리거 주기는 매 15분으로 변경한다.

**Tech Stack:** Next.js 16.2 (App Router), Prisma 5.22 + PostgreSQL, React 19, date-fns 4 + 새로 추가할 `date-fns-tz`, TypeScript 5, Node built-in `node:test` (단위 테스트, `tsx` 로더 사용).

---

## Design Decisions

- **단일 전역 시각**: 모든 알림이 같은 시각에 발송. 규칙별/일자별 시각은 두지 않음. (사용자 결정)
- **분 granularity**: 0/15/30/45 (15분 간격). 크론 주기와 정렬. (사용자 결정)
- **시간대**: KST 고정.
- **크론 주기**: 매 15분(`*/15 * * * *`). 외부 트리거(Vercel Cron, GitHub Actions 등) 같이 변경. (사용자 결정)
- **저장 방식**: 단일 row 싱글톤 모델(`NotificationSettings`). 별도 admin 페이지 대신 `/rules` 상단에 작은 카드 1개로 노출.
- **기본값**: 신규 환경에서는 09:00 KST. 기존 DB는 마이그레이션이 같은 값으로 seed.
- **`NotificationRule.daysBefore: Int[]`**: 그대로 유지 — 이 plan에서는 손대지 않음.

---

## File Structure

- **`prisma/schema.prisma`** (수정): `NotificationSettings` 모델 추가.
- **`prisma/migrations/<ts>_add_notification_settings/migration.sql`** (생성): 테이블 생성 + 싱글톤 row 삽입.
- **`prisma/seed.ts`** (수정): `NotificationSettings` upsert 추가(idempotent).
- **`src/lib/settings.ts`** (생성): 싱글톤 조회/업서트 helper.
- **`src/lib/notify-window.ts`** (생성): KST 시각 분해 + 15분 윈도우 매칭 함수.
- **`src/lib/notify-window.test.ts`** (생성): `node:test` 단위 테스트.
- **`src/lib/notify.ts`** (수정): 진입부에 settings 로드 + 윈도우 체크 추가.
- **`src/actions/settings.ts`** (생성): `updateNotificationSettings` 서버 액션.
- **`src/components/rules/notification-time-card.tsx`** (생성): 시각 설정 카드 UI.
- **`src/app/(protected)/rules/page.tsx`** (수정): settings 로드 후 카드 렌더.
- **`package.json`** (수정): `date-fns-tz`, `tsx` 추가, `test` 스크립트 추가.
- **`README.md`** (수정): 크론 주기 안내 1단락.

---

## Task 1: 의존성·테스트 스크립트 추가

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 런타임 의존성 추가**

Run:
```bash
pnpm add date-fns-tz@^3.2.0
```

Expected: `package.json` dependencies에 `"date-fns-tz": "^3.2.0"` 추가, `pnpm-lock.yaml` 갱신.

- [ ] **Step 2: dev 의존성 + 테스트 스크립트 추가**

Run:
```bash
pnpm add -D tsx@^4.19.2
```

그리고 `package.json`의 `scripts`에 한 줄 추가:

```json
"test": "node --import tsx --test 'src/**/*.test.ts'"
```

- [ ] **Step 3: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add date-fns-tz and node:test runner"
```

---

## Task 2: `NotificationSettings` 싱글톤 모델 추가

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 스키마 수정**

`prisma/schema.prisma`의 다른 모델들과 같은 레벨에 다음 모델을 추가:

```prisma
model NotificationSettings {
  id         String   @id @default("singleton")
  sendHour   Int      @default(9)
  sendMinute Int      @default(0)
  updatedAt  DateTime @updatedAt
}
```

> `id`의 기본값을 `"singleton"`으로 고정해 row가 사실상 하나만 존재하도록 한다. 코드에서도 `where: { id: 'singleton' }`로 접근.

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm prisma migrate dev --name add_notification_settings --create-only`
Expected: `prisma/migrations/<ts>_add_notification_settings/migration.sql` 생성.

- [ ] **Step 3: 마이그레이션에 싱글톤 row INSERT 추가**

생성된 `migration.sql`의 마지막 줄 뒤에 다음을 **수동으로 덧붙인다**:

```sql
-- Seed the singleton row (09:00 KST default)
INSERT INTO "NotificationSettings" ("id", "sendHour", "sendMinute", "updatedAt")
VALUES ('singleton', 9, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
```

- [ ] **Step 4: 마이그레이션 적용**

Run: `pnpm prisma migrate dev`
Expected: 적용 성공. Prisma Client 재생성.

검증:
```bash
pnpm prisma studio
```
Expected: `NotificationSettings` 테이블에 `id='singleton', sendHour=9, sendMinute=0` row 한 개.

- [ ] **Step 5: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add NotificationSettings singleton model"
```

---

## Task 3: `prisma/seed.ts`에 settings upsert 추가

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: 시드 코드에 settings upsert 추가**

기존 `main()`의 상단(rule upsert들 전)에 다음 블록을 추가:

```ts
await db.notificationSettings.upsert({
  where: { id: 'singleton' },
  update: {},
  create: { id: 'singleton', sendHour: 9, sendMinute: 0 },
})
```

즉, 변경된 `prisma/seed.ts`의 `main()` 시작 부분이 다음과 같이 된다:

```ts
async function main() {
  await db.notificationSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', sendHour: 9, sendMinute: 0 },
  })

  await db.notificationRule.upsert({
    where: { id: 'rule-birthday' },
    // ... 기존 그대로
```

- [ ] **Step 2: 시드 실행 (idempotent 검증)**

Run: `pnpm db:seed`
Expected: "Seed complete" 출력. 한 번 더 실행해도 동일하게 성공.

- [ ] **Step 3: 커밋**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): seed NotificationSettings singleton"
```

---

## Task 4: KST 시각 윈도우 함수 — 테스트 먼저

**Files:**
- Create: `src/lib/notify-window.ts`
- Create: `src/lib/notify-window.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/notify-window.test.ts` 생성:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isInWindow, getKstParts } from './notify-window'

describe('isInWindow', () => {
  it('matches when now is exactly at scheduled time', () => {
    // 09:00 KST = 00:00 UTC
    const now = new Date('2026-05-16T00:00:00Z')
    assert.equal(isInWindow(now, 9, 0), true)
  })

  it('matches 14 minutes after scheduled time', () => {
    const now = new Date('2026-05-16T00:14:00Z')
    assert.equal(isInWindow(now, 9, 0), true)
  })

  it('does NOT match 15 minutes after scheduled time', () => {
    const now = new Date('2026-05-16T00:15:00Z')
    assert.equal(isInWindow(now, 9, 0), false)
  })

  it('does NOT match before scheduled time', () => {
    const now = new Date('2026-05-15T23:59:00Z') // 08:59 KST
    assert.equal(isInWindow(now, 9, 0), false)
  })

  it('matches 09:30 schedule within window', () => {
    assert.equal(isInWindow(new Date('2026-05-16T00:30:00Z'), 9, 30), true)
    assert.equal(isInWindow(new Date('2026-05-16T00:44:00Z'), 9, 30), true)
    assert.equal(isInWindow(new Date('2026-05-16T00:45:00Z'), 9, 30), false)
  })

  it('does NOT match different hour', () => {
    const now = new Date('2026-05-16T01:00:00Z') // 10:00 KST
    assert.equal(isInWindow(now, 9, 0), false)
  })
})

describe('getKstParts', () => {
  it('returns KST year/month/day/hour/minute for a UTC instant', () => {
    // 15:00 UTC == 00:00 KST next day
    const parts = getKstParts(new Date('2026-05-16T15:00:00Z'))
    assert.equal(parts.year, 2026)
    assert.equal(parts.month, 5)
    assert.equal(parts.day, 17)
    assert.equal(parts.hour, 0)
    assert.equal(parts.minute, 0)
  })
})
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './notify-window'`.

- [ ] **Step 3: 최소 구현 작성**

`src/lib/notify-window.ts` 생성:

```ts
import { toZonedTime } from 'date-fns-tz'

const KST = 'Asia/Seoul'
const WINDOW_MINUTES = 15

export interface KstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function getKstParts(now: Date): KstParts {
  const zoned = toZonedTime(now, KST)
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
  }
}

export function isInWindow(now: Date, scheduleHour: number, scheduleMinute: number): boolean {
  const parts = getKstParts(now)
  if (parts.hour !== scheduleHour) return false
  const diff = parts.minute - scheduleMinute
  return diff >= 0 && diff < WINDOW_MINUTES
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

Run: `pnpm test`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/notify-window.ts src/lib/notify-window.test.ts
git commit -m "feat(notify): add KST send-time window helpers"
```

---

## Task 5: settings 헬퍼 모듈

**Files:**
- Create: `src/lib/settings.ts`

- [ ] **Step 1: settings 조회/업서트 헬퍼 작성**

`src/lib/settings.ts`:

```ts
import { db } from '@/lib/db'

const SINGLETON_ID = 'singleton'

export interface NotificationSettingsValue {
  sendHour: number
  sendMinute: number
}

export async function getNotificationSettings(): Promise<NotificationSettingsValue> {
  const row = await db.notificationSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, sendHour: 9, sendMinute: 0 },
    select: { sendHour: true, sendMinute: true },
  })
  return row
}

export async function setNotificationSettings(value: NotificationSettingsValue): Promise<void> {
  await db.notificationSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { sendHour: value.sendHour, sendMinute: value.sendMinute },
    create: { id: SINGLETON_ID, sendHour: value.sendHour, sendMinute: value.sendMinute },
  })
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/settings.ts
git commit -m "feat(notify): add settings singleton helpers"
```

---

## Task 6: `notify.ts` 진입부에 시간 윈도우 가드 추가

**Files:**
- Modify: `src/lib/notify.ts`

`runNotifications()`만 변경. 나머지 함수는 그대로 둔다 (일자 매칭 로직 유지).

- [ ] **Step 1: 상단 import 수정**

`src/lib/notify.ts` 상단 import 블록에 다음을 추가/유지:

```ts
import { addMonths, differenceInDays, startOfDay } from 'date-fns'
import { db } from '@/lib/db'
import { sendDM } from '@/lib/slack'
import { getNotificationSettings } from '@/lib/settings'
import { isInWindow } from '@/lib/notify-window'
import type { User, NotificationRule } from '@prisma/client'
```

- [ ] **Step 2: `runNotifications()` 본문 교체**

기존 `runNotifications()`를 다음으로 교체:

```ts
export async function runNotifications(now: Date = new Date()): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, failed: 0, skipped: 0 }

  const settings = await getNotificationSettings()
  if (!isInWindow(now, settings.sendHour, settings.sendMinute)) {
    return result
  }

  const today = startOfDay(now)

  const [rules, employees] = await Promise.all([
    db.notificationRule.findMany({ where: { isEnabled: true } }),
    db.user.findMany({ where: { isActive: true } }),
  ])

  for (const rule of rules) {
    for (const employee of employees) {
      if (rule.type === 'LEAVE_EXPIRY') {
        await handleLeaveExpiry(rule, employee, today, result)
      } else {
        await handleDateRule(rule, employee, today, result)
      }
    }
  }

  return result
}
```

> 다른 helper 함수(`handleDateRule`, `handleLeaveExpiry`, `sendAndLog`, `getEventDate`, `renderTemplate`, `formatKoDate`)는 그대로 유지.

- [ ] **Step 3: 타입체크 + 테스트**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: 에러 없음. 기존 윈도우 테스트 PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/notify.ts
git commit -m "feat(notify): gate sends by configured send-time window"
```

---

## Task 7: `updateNotificationSettings` 서버 액션

**Files:**
- Create: `src/actions/settings.ts`

- [ ] **Step 1: 액션 작성**

`src/actions/settings.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { setNotificationSettings } from '@/lib/settings'
import type { ActionResult } from '@/types'

const VALID_MINUTES = new Set([0, 15, 30, 45])

export async function updateNotificationSettings(input: {
  sendHour: number
  sendMinute: number
}): Promise<ActionResult> {
  const { sendHour, sendMinute } = input

  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) {
    return { success: false, error: '시(hour)는 0~23 사이여야 합니다.' }
  }
  if (!VALID_MINUTES.has(sendMinute)) {
    return { success: false, error: '분(minute)은 0/15/30/45 중 하나여야 합니다.' }
  }

  try {
    await setNotificationSettings({ sendHour, sendMinute })
    revalidatePath('/rules')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/actions/settings.ts
git commit -m "feat(rules): add updateNotificationSettings action"
```

---

## Task 8: 시각 설정 카드 컴포넌트

**Files:**
- Create: `src/components/rules/notification-time-card.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/rules/notification-time-card.tsx`:

```tsx
'use client'
import { useState, useTransition } from 'react'
import { updateNotificationSettings } from '@/actions/settings'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 15, 30, 45] as const

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

interface Props {
  initialHour: number
  initialMinute: number
}

export function NotificationTimeCard({ initialHour, initialMinute }: Props) {
  const [hour, setHour] = useState(initialHour)
  const [minute, setMinute] = useState<number>(initialMinute)
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedHour, setSavedHour] = useState(initialHour)
  const [savedMinute, setSavedMinute] = useState(initialMinute)

  function handleSave() {
    startTransition(async () => {
      const result = await updateNotificationSettings({ sendHour: hour, sendMinute: minute })
      if (result.success) {
        setSavedHour(hour)
        setSavedMinute(minute)
        setIsEditing(false)
        setError(null)
      } else {
        setError(result.error)
      }
    })
  }

  function handleCancel() {
    setHour(savedHour)
    setMinute(savedMinute)
    setIsEditing(false)
    setError(null)
  }

  return (
    <div className="bg-paper border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-fraunces text-lg font-semibold text-ink">⏰ 발송 시각</h3>
        <span className="text-xs text-stone">모든 알림에 공통 적용 · KST</span>
      </div>

      {!isEditing ? (
        <>
          <div className="space-y-1">
            <p className="text-xs text-stone">매일 발송 시각</p>
            <p className="text-2xl text-ink font-mono">
              {pad2(savedHour)}:{pad2(savedMinute)}
            </p>
          </div>
          <Button
            variant="outline"
            className="border-border text-sm"
            onClick={() => setIsEditing(true)}
          >
            편집
          </Button>
        </>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시</Label>
              <select
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="border border-border rounded-md px-3 py-2 text-sm font-mono w-24"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xl text-stone pb-2">:</span>
            <div className="space-y-1.5">
              <Label className="text-xs">분</Label>
              <select
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="border border-border rounded-md px-3 py-2 text-sm font-mono w-24"
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="bg-coral hover:bg-coral-dark text-white text-sm"
            >
              {isPending ? '저장 중...' : '저장'}
            </Button>
            <Button variant="outline" className="border-border text-sm" onClick={handleCancel}>
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

---

## Task 9: `/rules` 페이지에 시각 설정 카드 노출

**Files:**
- Modify: `src/app/(protected)/rules/page.tsx`

- [ ] **Step 1: 페이지 수정**

`src/app/(protected)/rules/page.tsx` 전체 교체:

```tsx
import { db } from '@/lib/db'
import { RuleCard } from '@/components/rules/rule-card'
import { NotificationTimeCard } from '@/components/rules/notification-time-card'
import { getNotificationSettings } from '@/lib/settings'

export default async function RulesPage() {
  const [rules, settings] = await Promise.all([
    db.notificationRule.findMany({ orderBy: { type: 'asc' } }),
    getNotificationSettings(),
  ])

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">알림 규칙</h1>
        <p className="text-stone text-sm mt-0.5">알림 발송 규칙을 설정합니다</p>
      </div>

      <NotificationTimeCard
        initialHour={settings.sendHour}
        initialMinute={settings.sendMinute}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 통과 확인**

Run: `pnpm build`
Expected: 빌드 성공.

- [ ] **Step 3: 커밋 (Task 8 + 9 묶음)**

```bash
git add src/components/rules/notification-time-card.tsx src/app/\(protected\)/rules/page.tsx
git commit -m "feat(rules): UI to edit global send-time (KST)"
```

---

## Task 10: 수동 UI 검증

**Files:** (변경 없음)

- [ ] **Step 1: dev 서버 기동**

Run: `pnpm dev`
브라우저에서 `/rules` 접속(로그인 필요).

- [ ] **Step 2: 카드 표시 확인**

Expected: 페이지 상단에 "⏰ 발송 시각" 카드가 보이고 `09:00`이 표시됨. 기존 4개 규칙 카드(생일/입사 기념일/건강검진/연차 소진)는 그대로 그 아래 그리드에 표시.

- [ ] **Step 3: 편집 → 저장 → 영속성 확인**

[편집] 클릭 → 시 `10`, 분 `30` 선택 → [저장].
Expected: 편집 모드 종료, 카드에 `10:30` 표시. 페이지 새로고침 후에도 `10:30` 유지.

`pnpm prisma studio`로 `NotificationSettings.singleton.sendHour=10, sendMinute=30` 확인.

- [ ] **Step 4: 검증 에러**

브라우저 DevTools 콘솔에서 액션을 직접 호출해 잘못된 값을 보내본다 (또는 일단 스킵). UI에서는 select로 제한돼 있어 잘못된 값이 갈 일은 없음 — 액션 단위 검증은 코드 리뷰로 대체.

- [ ] **Step 5: 커밋 없음 (검증 단계)**

---

## Task 11: `runNotifications()` 윈도우 가드 수동 검증

**Files:** (변경 없음)

- [ ] **Step 1: 윈도우 안에서 트리거**

settings를 현재 시각의 가장 가까운 직전 15분 경계로 설정. 예: 지금이 14:07 KST면 14:00으로.

Run:
```bash
curl -X POST http://localhost:3000/api/cron/notify \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: 일자 매칭이 되는 직원이 있으면 `{ "sent": N, "failed": 0, "skipped": ... }`. 없으면 `sent: 0`이지만 어쨌든 응답은 정상.

- [ ] **Step 2: 윈도우 밖에서 트리거 (가드 검증)**

settings를 멀리 떨어진 시각으로 설정 (예: 현재가 14:07이면 03:00).

위 curl 다시 실행.
Expected: `{ "sent": 0, "failed": 0, "skipped": 0 }` — 윈도우 가드가 즉시 반환했으므로 `skipped` 카운터도 증가하지 않는다.

- [ ] **Step 3: 커밋 없음 (검증 단계)**

---

## Task 12: README의 크론 주기 안내

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 크론 안내 갱신**

`README.md`의 cron 관련 위치를 찾아 다음 문구로 교체하거나, 적절한 위치에 새 섹션으로 추가:

````md
## 크론 트리거

`/api/cron/notify` 엔드포인트를 **매 15분(`*/15 * * * *`)** 주기로 호출하도록 외부 스케줄러(Vercel Cron 등)에 설정합니다. 관리자가 `/rules` 페이지에서 지정한 **발송 시각(HH:MM, KST)**의 15분 윈도우 안에 들어온 호출만 실제 메시지를 발송합니다. 그 외 호출은 즉시 무시됩니다.

```bash
curl -X POST https://<your-host>/api/cron/notify \
  -H "Authorization: Bearer $CRON_SECRET"
```
````

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: document 15-minute cron + send-time window"
```

---

## 완료 기준

- `pnpm exec tsc --noEmit` 통과
- `pnpm test` 통과 (`notify-window.test.ts`)
- `pnpm build` 통과
- `pnpm db:seed` idempotent
- `/rules` 페이지 상단에서 발송 시각(HH:MM, 15분 간격)을 편집·저장하고 페이지 새로고침 후에도 값이 유지됨
- 설정 시각의 15분 윈도우 안에 들어온 `/api/cron/notify` 호출만 알림을 발송하고, 그 외 호출은 `sent: 0, skipped: 0`으로 즉시 반환
