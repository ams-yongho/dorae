import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default async function LogsPage() {
  const logs = await db.notificationLog.findMany({
    take: 50,
    orderBy: { sentAt: 'desc' },
    include: {
      user: { select: { name: true } },
      rule: { select: { type: true } },
    },
  })

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">발송 이력</h1>
        <p className="text-stone text-sm mt-0.5">최근 50건</p>
      </div>

      <div className="bg-paper border border-border rounded-xl overflow-hidden">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-stone">
            <p className="font-fraunces text-lg">발송 이력이 없습니다</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment border-b border-border">
                <th className="text-left px-4 py-3 text-graphite font-medium">직원</th>
                <th className="text-left px-4 py-3 text-graphite font-medium">타입</th>
                <th className="text-left px-4 py-3 text-graphite font-medium">발송일</th>
                <th className="text-left px-4 py-3 text-graphite font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-ink">{log.user.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone">
                    {log.rule?.type ?? 'MANUAL'}
                  </td>
                  <td className="px-4 py-3 text-graphite font-mono text-xs">
                    {log.sentAt ? formatDate(log.sentAt) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        log.status === 'SENT'
                          ? 'bg-green-100 text-green-700'
                          : log.status === 'FAILED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-stone/20 text-stone'
                      }
                    >
                      {log.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
