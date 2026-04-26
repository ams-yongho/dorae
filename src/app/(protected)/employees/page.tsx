import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmployeeTable } from '@/components/employees/employee-table'
import { db } from '@/lib/db'

export default async function EmployeesPage() {
  const employees = await db.user.findMany({
    orderBy: { name: 'asc' },
  })

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl text-ink font-semibold">직원 관리</h1>
          <p className="text-stone text-sm mt-0.5">총 {employees.length}명</p>
        </div>
        <Link href="/employees/new">
          <Button className="bg-coral hover:bg-coral-dark text-white">직원 추가</Button>
        </Link>
      </div>
      <div className="bg-paper border border-border rounded-xl overflow-hidden">
        <EmployeeTable employees={employees} />
      </div>
    </div>
  )
}
