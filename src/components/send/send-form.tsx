'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { sendManualDM } from '@/actions/send'
import type { User } from '@prisma/client'

interface Props {
  employees: Pick<User, 'id' | 'name' | 'email'>[]
}

export function SendForm({ employees }: Props) {
  const [isPending, startTransition] = useTransition()
  const [userId, setUserId] = useState('')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !message.trim()) return
    startTransition(async () => {
      const res = await sendManualDM(userId, message)
      setResult(res.success
        ? { ok: true, msg: 'DM이 발송되었습니다 ✓' }
        : { ok: false, msg: res.error })
      if (res.success) setMessage('')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {result && (
        <div
          className={`rounded-lg p-3 text-sm ${
            result.ok
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {result.msg}
        </div>
      )}

      <div className="space-y-2">
        <Label>수신 직원</Label>
        <Select value={userId} onValueChange={(v) => setUserId(v ?? '')}>
          <SelectTrigger className="border-border">
            <SelectValue placeholder="직원을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.name} ({emp.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">메시지</Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Slack DM으로 전송할 메시지를 입력하세요..."
          rows={5}
          className="border-border resize-none"
        />
        <p className="text-xs text-stone">{message.length}자</p>
      </div>

      <Button
        type="submit"
        disabled={isPending || !userId || !message.trim()}
        className="bg-coral hover:bg-coral-dark text-white"
      >
        {isPending ? '발송 중...' : 'Slack DM 발송'}
      </Button>
    </form>
  )
}
