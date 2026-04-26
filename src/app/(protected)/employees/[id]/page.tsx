import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { EmployeeForm } from '@/components/employees/employee-form'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EmployeeDetailPage({ params }: Props) {
  const { id } = await params
  const employee = await db.user.findUnique({ where: { id } })
  if (!employee) notFound()

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">{employee.name}</h1>
        <p className="text-stone text-sm mt-0.5 font-mono">{employee.email}</p>
      </div>
      <div className="bg-paper border border-border rounded-xl p-6">
        <EmployeeForm employee={employee} />
      </div>
    </div>
  )
}
