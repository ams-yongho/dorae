import { EmployeeForm } from '@/components/employees/employee-form'

export default function NewEmployeePage() {
  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">직원 추가</h1>
        <p className="text-stone text-sm mt-0.5">새 직원 정보를 입력하세요</p>
      </div>
      <div className="bg-paper border border-border rounded-xl p-6">
        <EmployeeForm />
      </div>
    </div>
  )
}
