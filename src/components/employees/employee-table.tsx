import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import type { User } from '@prisma/client'

interface EmployeeTableProps {
  employees: User[]
}

export function EmployeeTable({ employees }: EmployeeTableProps) {
  if (employees.length === 0) {
    return (
      <div className="text-center py-16 text-stone">
        <p className="text-lg font-fraunces">직원이 없습니다</p>
        <p className="text-sm mt-1">직원 추가 버튼으로 첫 번째 직원을 등록하세요.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-parchment border-y border-border">
            <th className="text-left px-4 py-3 text-graphite font-medium">이름</th>
            <th className="text-left px-4 py-3 text-graphite font-medium">이메일</th>
            <th className="text-left px-4 py-3 text-graphite font-medium">생일</th>
            <th className="text-left px-4 py-3 text-graphite font-medium">입사일</th>
            <th className="text-left px-4 py-3 text-graphite font-medium">상태</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="border-b border-border hover:bg-parchment/50">
              <td className="px-4 py-3 font-medium text-ink">{emp.name}</td>
              <td className="px-4 py-3 text-graphite font-mono text-xs">{emp.email}</td>
              <td className="px-4 py-3 text-graphite font-mono text-xs">
                {formatDate(emp.birthday)}
              </td>
              <td className="px-4 py-3 text-graphite font-mono text-xs">
                {formatDate(emp.hireDate)}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={emp.isActive ? 'default' : 'secondary'}
                  className={emp.isActive ? 'bg-coral text-white' : ''}
                >
                  {emp.isActive ? '재직' : '퇴직'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/employees/${emp.id}`}>
                  <Button variant="outline" size="sm" className="border-border text-graphite">
                    상세
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
