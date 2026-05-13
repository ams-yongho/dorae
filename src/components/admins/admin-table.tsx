'use client'
import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { deleteAdmin } from '@/actions/admins'
import type { AdminListEntry } from '@/lib/admins'

interface Props {
  admins: AdminListEntry[]
  /** 현재 로그인한 사용자 이메일 (본인 삭제 금지 UX용) */
  currentEmail: string
}

export function AdminTable({ admins, currentEmail }: Props) {
  const [isPending, startTransition] = useTransition()
  const meLower = currentEmail.toLowerCase()

  if (admins.length === 0) {
    return (
      <div className="text-center py-16 text-stone">
        <p className="text-lg font-fraunces">관리자가 없습니다</p>
        <p className="text-sm mt-1">위 입력란으로 첫 번째 관리자를 등록하세요.</p>
      </div>
    )
  }

  function handleDelete(id: string, email: string) {
    if (
      !confirm(
        `정말 ${email}을(를) 관리자에서 제거하시겠습니까?\n이 사용자의 기존 세션은 즉시 무효화됩니다.`,
      )
    )
      return
    startTransition(async () => {
      const result = await deleteAdmin(id)
      if (!result.success) {
        alert(result.error)
      }
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-parchment border-y border-border">
            <th className="text-left px-4 py-3 text-graphite font-medium">이메일</th>
            <th className="text-left px-4 py-3 text-graphite font-medium">출처</th>
            <th className="text-left px-4 py-3 text-graphite font-medium">등록일</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => {
            const isSelf = a.email.toLowerCase() === meLower
            const isEnv = a.source === 'env'
            return (
              <tr key={a.id} className="border-b border-border hover:bg-parchment/50">
                <td className="px-4 py-3 font-mono text-xs text-ink">{a.email}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={isEnv ? 'secondary' : 'default'}
                    className={isEnv ? '' : 'bg-coral text-white'}
                  >
                    {isEnv ? '환경변수' : 'DB'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-graphite font-mono text-xs">
                  {a.createdAt ? formatDate(a.createdAt) : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  {isEnv ? (
                    <span className="text-xs text-stone">코드/환경변수 변경 필요</span>
                  ) : isSelf ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      title="본인은 삭제할 수 없습니다"
                      className="border-border text-stone"
                    >
                      본인
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleDelete(a.id, a.email)}
                      className="border-border text-graphite hover:bg-red-50 hover:text-red-700"
                    >
                      삭제
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
