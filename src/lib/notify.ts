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
  const eventDate = getEventDate(employee, String(rule.type), today)
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
