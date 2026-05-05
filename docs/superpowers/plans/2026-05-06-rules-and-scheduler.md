# 알림 규칙 관리 + 자동 발송 스케줄러 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 알림 규칙(BIRTHDAY/ANNIVERSARY/CHECKUP/LEAVE_EXPIRY)을 편집하고, 매일 오전 10시에 cron이 `/api/cron/notify`를 호출해 해당 직원에게 Slack DM을 자동 발송한다.

**Architecture:** Rules UI는 4개 고정 카드로 구성되며 server action으로 DB를 업데이트한다. 알림 로직은 `src/lib/notify.ts`에 분리하고, cron API route가 이를 호출한다. 인증은 `CRON_SECRET` Bearer 토큰으로 처리한다.

**Tech Stack:** Next.js 16, Prisma 5, @slack/web-api, date-fns 4, Tailwind CSS 4, shadcn/ui

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/actions/rules.ts` | updateRule, toggleRule server actions |
| `src/components/rules/rule-card.tsx` | 규칙 카드 (표시 + 인라인 편집 폼) |
| `src/app/(protected)/rules/page.tsx` | 규칙 목록 페이지 (기존 껍데기 교체) |
| `src/lib/notify.ts` | 날짜 계산 + 템플릿 렌더링 + DM 발송 로직 |
| `src/app/api/cron/notify/route.ts` | cron POST 엔드포인트 |

---

## Task 1: Rules Server Actions

**Files:**
- Create: `src/actions/rules.ts`

- [ ] **Step 1: Create the file**

```ts
'use server'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types'

export async function updateRule(
  id: string,
  data: {
    daysBefore: number[]
    messageTemplate: string
    remainingThreshold: number | null
  }
): Promise<ActionResult> {
  try {
    await db.notificationRule.update({
      where: { id },
      data: {
        daysBefore: data.daysBefore,
        messageTemplate: data.messageTemplate,
        remainingThreshold: data.remainingThreshold,
      },
    })
    revalidatePath('/rules')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function toggleRule(
  id: string,
  isEnabled: boolean
): Promise<ActionResult> {
  try {
    await db.notificationRule.update({
      where: { id },
      data: { isEnabled },
    })
    revalidatePath('/rules')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/rules.ts
git commit -m "feat: add rules server actions (update, toggle)"
```

---

## Task 2: Rule Card Component

**Files:**
- Create: `src/components/rules/rule-card.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'
import { useState, useTransition } from 'react'
import { updateRule, toggleRule } from '@/actions/rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { NotificationRule } from '@prisma/client'

const TYPE_LABELS: Record<string, string> = {
  BIRTHDAY: '🎂 생일',
  ANNIVERSARY: '🥂 입사 기념일',
  CHECKUP: '🏥 건강검진',
  LEAVE_EXPIRY: '📅 연차 소진',
}

const TEMPLATE_HINT = '사용 가능한 변수: {name} {days} {date} {remaining} {years}'

interface Props {
  rule: NotificationRule
}

export function RuleCard({ rule }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [daysInput, setDaysInput] = useState(rule.daysBefore.join(', '))
  const [template, setTemplate] = useState(rule.messageTemplate)
  const [threshold, setThreshold] = useState(
    rule.remainingThreshold != null ? String(rule.remainingThreshold) : ''
  )

  function handleToggle() {
    startTransition(async () => {
      await toggleRule(rule.id, !rule.isEnabled)
    })
  }

  function handleSave() {
    const daysBefore = daysInput
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0)

    if (daysBefore.length === 0) {
      setError('며칠 전 값을 하나 이상 입력해 주세요')
      return
    }
    if (!template.trim()) {
      setError('메시지 템플릿을 입력해 주세요')
      return
    }

    startTransition(async () => {
      const result = await updateRule(rule.id, {
        daysBefore,
        messageTemplate: template,
        remainingThreshold: threshold ? parseInt(threshold, 10) : null,
      })
      if (result.success) {
        setIsEditing(false)
        setError(null)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="bg-paper border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-fraunces text-lg font-semibold text-ink">
          {TYPE_LABELS[rule.type] ?? rule.type}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggle}
            disabled={isPending}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              rule.isEnabled ? 'bg-coral' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                rule.isEnabled ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-xs text-stone">{rule.isEnabled ? '활성' : '비활성'}</span>
        </div>
      </div>

      {!isEditing ? (
        <>
          <div className="space-y-1">
            <p className="text-xs text-stone">발송 시점</p>
            <p className="text-sm text-ink font-mono">
              {rule.daysBefore.join(', ')}일 전
            </p>
          </div>
          {rule.remainingThreshold != null && (
            <div className="space-y-1">
              <p className="text-xs text-stone">잔여 연차 임계값</p>
              <p className="text-sm text-ink font-mono">{rule.remainingThreshold}일 초과 시 발송</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-stone">메시지 템플릿</p>
            <p className="text-sm text-graphite whitespace-pre-wrap break-words">
              {rule.messageTemplate}
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

          <div className="space-y-1.5">
            <Label className="text-xs">발송 시점 (쉼표로 구분, 단위: 일)</Label>
            <Input
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              placeholder="예: 30, 7, 1"
              className="border-border font-mono text-sm"
            />
          </div>

          {rule.type === 'LEAVE_EXPIRY' && (
            <div className="space-y-1.5">
              <Label className="text-xs">잔여 연차 임계값 (이 값 초과 시 발송)</Label>
              <Input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                type="number"
                min={0}
                placeholder="예: 3"
                className="border-border font-mono text-sm w-32"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">메시지 템플릿</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              className="border-border resize-none text-sm"
            />
            <p className="text-xs text-stone">{TEMPLATE_HINT}</p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isPending}
              className="bg-coral hover:bg-coral-dark text-white text-sm"
            >
              {isPending ? '저장 중...' : '저장'}
            </Button>
            <Button
              variant="outline"
              className="border-border text-sm"
              onClick={() => {
                setIsEditing(false)
                setError(null)
                setDaysInput(rule.daysBefore.join(', '))
                setTemplate(rule.messageTemplate)
                setThreshold(rule.remainingThreshold != null ? String(rule.remainingThreshold) : '')
              }}
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/rules/rule-card.tsx
git commit -m "feat: add RuleCard component with inline edit"
```

---

## Task 3: Rules Page

**Files:**
- Modify: `src/app/(protected)/rules/page.tsx`

- [ ] **Step 1: Replace rules page**

```tsx
import { db } from '@/lib/db'
import { RuleCard } from '@/components/rules/rule-card'

export default async function RulesPage() {
  const rules = await db.notificationRule.findMany({
    orderBy: { type: 'asc' },
  })

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">알림 규칙</h1>
        <p className="text-stone text-sm mt-0.5">알림 발송 규칙을 설정합니다</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Start dev server and verify**

```bash
pnpm dev
```

브라우저에서 `http://localhost:3000/rules` 접속.
- 4개 카드가 2열 그리드로 표시되는지 확인
- 토글 클릭 시 활성/비활성 변경 확인
- 편집 → 저장 후 값이 반영되는지 확인

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected\)/rules/page.tsx
git commit -m "feat: implement rules management page"
```

---

## Task 4: Notification Logic

**Files:**
- Create: `src/lib/notify.ts`

이 파일이 전체 알림 로직을 담당한다. 날짜 계산, 템플릿 렌더링, DM 발송, 로그 기록.

- [ ] **Step 1: Create notify.ts**

```ts
import { addMonths, differenceInDays, startOfDay } from 'date-fns'
import { db } from '@/lib/db'
import { sendDM } from '@/lib/slack'
import type { User, NotificationRule } from '@prisma/client'

export interface NotifyResult {
  sent: number
  failed: number
  skipped: number
}

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

function getEventDate(employee: User, type: string, today: Date): Date | null {
  const year = today.getFullYear()

  if (type === 'BIRTHDAY') {
    const candidate = new Date(year, employee.birthday.getMonth(), employee.birthday.getDate())
    return candidate < today ? new Date(year + 1, candidate.getMonth(), candidate.getDate()) : candidate
  }

  if (type === 'ANNIVERSARY') {
    const candidate = new Date(year, employee.hireDate.getMonth(), employee.hireDate.getDate())
    return candidate < today ? new Date(year + 1, candidate.getMonth(), candidate.getDate()) : candidate
  }

  if (type === 'CHECKUP') {
    if (!employee.lastCheckupDate) return null
    return addMonths(employee.lastCheckupDate, employee.checkupCycleMonths)
  }

  if (type === 'LEAVE_EXPIRY') {
    if (employee.leaveYearBasis === 'CALENDAR') {
      return new Date(year, 11, 31)
    }
    const candidate = new Date(year, employee.hireDate.getMonth(), employee.hireDate.getDate())
    return candidate < today ? new Date(year + 1, candidate.getMonth(), candidate.getDate()) : candidate
  }

  return null
}

function formatKoDate(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

export async function runNotifications(): Promise<NotifyResult> {
  const today = startOfDay(new Date())
  const result: NotifyResult = { sent: 0, failed: 0, skipped: 0 }

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

async function handleDateRule(
  rule: NotificationRule,
  employee: User,
  today: Date,
  result: NotifyResult
): Promise<void> {
  const eventDate = getEventDate(employee, rule.type, today)
  if (!eventDate) { result.skipped++; return }

  const daysUntil = differenceInDays(startOfDay(eventDate), today)

  if (!rule.daysBefore.includes(daysUntil)) { result.skipped++; return }

  const years = rule.type === 'ANNIVERSARY'
    ? eventDate.getFullYear() - employee.hireDate.getFullYear()
    : 0

  const message = renderTemplate(rule.messageTemplate, {
    name: employee.name,
    days: daysUntil,
    date: formatKoDate(eventDate),
    years,
    remaining: employee.annualLeaveTotal - employee.annualLeaveUsed,
  })

  await sendAndLog({ rule, employee, triggerDate: eventDate, daysBefore: daysUntil, message, result })
}

async function handleLeaveExpiry(
  rule: NotificationRule,
  employee: User,
  today: Date,
  result: NotifyResult
): Promise<void> {
  const remaining = employee.annualLeaveTotal - employee.annualLeaveUsed
  if (remaining <= (rule.remainingThreshold ?? 0)) { result.skipped++; return }

  const periodEnd = getEventDate(employee, 'LEAVE_EXPIRY', today)
  if (!periodEnd) { result.skipped++; return }

  const daysUntil = differenceInDays(startOfDay(periodEnd), today)

  if (!rule.daysBefore.includes(daysUntil)) { result.skipped++; return }

  const message = renderTemplate(rule.messageTemplate, {
    name: employee.name,
    days: daysUntil,
    date: formatKoDate(periodEnd),
    remaining,
    years: 0,
  })

  await sendAndLog({ rule, employee, triggerDate: periodEnd, daysBefore: daysUntil, message, result })
}

async function sendAndLog(params: {
  rule: NotificationRule
  employee: User
  triggerDate: Date
  daysBefore: number
  message: string
  result: NotifyResult
}): Promise<void> {
  const { rule, employee, triggerDate, daysBefore, message, result } = params

  const existing = await db.notificationLog.findUnique({
    where: {
      userId_ruleId_triggerDate_daysBefore: {
        userId: employee.id,
        ruleId: rule.id,
        triggerDate,
        daysBefore,
      },
    },
  })
  if (existing) { result.skipped++; return }

  try {
    await sendDM(employee.slackUserId, message)
    await db.notificationLog.create({
      data: {
        userId: employee.id,
        ruleId: rule.id,
        triggerDate,
        daysBefore,
        sentAt: new Date(),
        status: 'SENT',
        messageContent: message,
      },
    })
    result.sent++
  } catch (err) {
    await db.notificationLog.create({
      data: {
        userId: employee.id,
        ruleId: rule.id,
        triggerDate,
        daysBefore,
        status: 'FAILED',
        messageContent: message,
        errorMessage: String(err),
      },
    })
    result.failed++
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notify.ts
git commit -m "feat: add notification logic (date calc, template, DM, logging)"
```

---

## Task 5: Cron API Route

**Files:**
- Create: `src/app/api/cron/notify/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { runNotifications } from '@/lib/notify'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runNotifications()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Test manually**

dev server가 실행 중인 상태에서:

```bash
curl -X POST http://localhost:3000/api/cron/notify \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Expected response:
```json
{"sent": 0, "failed": 0, "skipped": 0}
```
(직원과 규칙 데이터에 따라 숫자가 달라질 수 있음)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/notify/route.ts
git commit -m "feat: add cron notify API route with CRON_SECRET auth"
```

---

## Task 6: crontab 등록 안내

- [ ] **Step 1: crontab 설정**

터미널에서 아래 명령으로 crontab 편집기를 열어 등록한다:

```bash
crontab -e
```

시스템 타임존이 KST(Asia/Seoul)인 경우 아래 줄 추가:
```
0 10 * * * curl -s -X POST http://localhost:3000/api/cron/notify -H "Authorization: Bearer <.env.local의 CRON_SECRET 값>" >> /tmp/dorae-cron.log 2>&1
```

시스템 타임존 확인:
```bash
date +%Z
# KST 출력이면 0 10, UTC 출력이면 0 1 사용
```

- [ ] **Step 2: 등록 확인**

```bash
crontab -l
```

등록한 줄이 보이면 완료.

---

## 완료 체크리스트

- [ ] `/rules` 페이지에서 4개 규칙 카드 표시
- [ ] 토글로 활성/비활성 전환
- [ ] 편집 폼에서 daysBefore, 메시지 템플릿, 임계값 수정 후 저장
- [ ] `POST /api/cron/notify` 호출 시 올바른 응답 반환
- [ ] 인증 없이 호출 시 401 반환
- [ ] crontab에 매일 10시 KST 실행 등록
