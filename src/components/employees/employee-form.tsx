'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SlackMemberSearch } from './slack-member-search'
import { createEmployee, updateEmployee } from '@/actions/employees'
import type { User } from '@prisma/client'

interface Props {
  employee?: User
}

const CHECKUP_CYCLE_ITEMS = [
  { value: '12', label: '12개월 (매년)' },
  { value: '24', label: '24개월 (격년)' },
]

const LEAVE_BASIS_ITEMS = [
  { value: 'CALENDAR', label: '달력 연도 (1/1 ~ 12/31)' },
  { value: 'HIRE_DATE', label: '입사일 기준' },
]

export function EmployeeForm({ employee }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [slackUserId, setSlackUserId] = useState(employee?.slackUserId ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    formData.set('slackUserId', slackUserId)
    startTransition(async () => {
      const result = employee
        ? await updateEmployee(employee.id, formData)
        : await createEmployee(formData)
      if (result.success) {
        router.push('/employees')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-lg">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">이름</Label>
        <Input id="name" name="name" defaultValue={employee?.name} required className="border-border" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">이메일</Label>
        <Input id="email" name="email" type="email" defaultValue={employee?.email} required className="border-border" />
      </div>

      <div className="space-y-2">
        <Label>Slack 계정</Label>
        <SlackMemberSearch value={slackUserId} onChange={setSlackUserId} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="birthday">생일</Label>
          <DatePicker
            id="birthday"
            name="birthday"
            defaultValue={employee?.birthday}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hireDate">입사일</Label>
          <DatePicker
            id="hireDate"
            name="hireDate"
            defaultValue={employee?.hireDate}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lastCheckupDate">마지막 건강검진일</Label>
        <DatePicker
          id="lastCheckupDate"
          name="lastCheckupDate"
          defaultValue={employee?.lastCheckupDate}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="checkupCycleMonths">건강검진 주기</Label>
        <Select
          name="checkupCycleMonths"
          defaultValue={String(employee?.checkupCycleMonths ?? 12)}
          items={CHECKUP_CYCLE_ITEMS}
        >
          <SelectTrigger id="checkupCycleMonths" className="border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHECKUP_CYCLE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="leaveYearBasis">연차 회계연도</Label>
        <Select
          name="leaveYearBasis"
          defaultValue={employee?.leaveYearBasis ?? 'CALENDAR'}
          items={LEAVE_BASIS_ITEMS}
        >
          <SelectTrigger id="leaveYearBasis" className="border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAVE_BASIS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="annualLeaveTotal">연차 총 일수</Label>
          <Input
            id="annualLeaveTotal"
            name="annualLeaveTotal"
            type="number"
            min={0}
            defaultValue={employee?.annualLeaveTotal ?? 15}
            className="border-border font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="annualLeaveUsed">사용 연차</Label>
          <Input
            id="annualLeaveUsed"
            name="annualLeaveUsed"
            type="number"
            min={0}
            defaultValue={employee?.annualLeaveUsed ?? 0}
            className="border-border font-mono"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-coral hover:bg-coral-dark text-white"
        >
          {isPending ? '저장 중...' : employee ? '수정 저장' : '직원 추가'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-border"
          onClick={() => router.back()}
        >
          취소
        </Button>
      </div>
    </form>
  )
}
