import { db } from '@/lib/db'
import { RuleCard } from '@/components/rules/rule-card'
import { NotificationTimeCard } from '@/components/rules/notification-time-card'
import { getNotificationSettings } from '@/lib/settings'

export default async function RulesPage() {
  const [rules, settings] = await Promise.all([
    db.notificationRule.findMany({ orderBy: { type: 'asc' } }),
    getNotificationSettings(),
  ])

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">알림 규칙</h1>
        <p className="text-stone text-sm mt-0.5">알림 발송 규칙을 설정합니다</p>
      </div>

      <NotificationTimeCard
        initialHour={settings.sendHour}
        initialMinute={settings.sendMinute}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  )
}
