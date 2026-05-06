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
  const [isEnabled, setIsEnabled] = useState(rule.isEnabled)

  const [daysInput, setDaysInput] = useState(rule.daysBefore.join(', '))
  const [template, setTemplate] = useState(rule.messageTemplate)
  const [threshold, setThreshold] = useState(
    rule.remainingThreshold != null ? String(rule.remainingThreshold) : ''
  )

  function handleToggle() {
    const next = !isEnabled
    setIsEnabled(next)
    startTransition(async () => {
      const result = await toggleRule(rule.id, next)
      if (!result.success) {
        setIsEnabled(!next)
      }
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
              isEnabled ? 'bg-coral' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                isEnabled ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-xs text-stone">{isEnabled ? '활성' : '비활성'}</span>
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
