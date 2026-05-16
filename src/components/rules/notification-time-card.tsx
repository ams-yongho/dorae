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
