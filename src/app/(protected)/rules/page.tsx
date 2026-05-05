import { db } from '@/lib/db'
import { RuleCard } from '@/components/rules/rule-card'

export default async function RulesPage() {
  const rules = await db.notificationRule.findMany({
    orderBy: { type: 'asc' },
  })

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">알림 규칙</h1>
        <p className="text-stone text-sm mt-0.5">알림 발송 규칙을 설정합니다</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  )
}
