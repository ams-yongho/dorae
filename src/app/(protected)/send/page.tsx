import { db } from '@/lib/db'
import { SendForm } from '@/components/send/send-form'

export default async function SendPage() {
  const employees = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">수동 발송</h1>
        <p className="text-stone text-sm mt-0.5">직원에게 Slack DM을 직접 발송합니다</p>
      </div>
      <div className="bg-paper border border-border rounded-xl p-6">
        <SendForm employees={employees} />
      </div>
    </div>
  )
}
