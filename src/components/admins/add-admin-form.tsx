'use client'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAdmin } from '@/actions/admins'

export function AddAdminForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createAdmin(formData)
      if (result.success) {
        formRef.current?.reset()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="email">새 관리자 이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="admin@example.com"
            className="border-border"
          />
        </div>
        <Button
          type="submit"
          disabled={isPending}
          className="bg-coral hover:bg-coral-dark text-white"
        >
          {isPending ? '추가 중...' : '추가'}
        </Button>
      </div>
    </form>
  )
}
