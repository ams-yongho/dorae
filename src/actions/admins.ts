'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admins'
import type { ActionResult } from '@/types'

/** 간단한 이메일 검증 (zod 미사용; 의존성 추가 없이 처리) */
function parseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  // RFC를 엄격히 따르진 않는 기본 검증
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed
}

/** 호출자 권한 검증: 세션 존재 + 현재 관리자 여부 */
async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, error: '인증이 필요합니다' }
  if (!(await isAdmin(email))) return { ok: false, error: '권한이 없습니다' }
  return { ok: true, email }
}

export async function createAdmin(formData: FormData): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { success: false, error: guard.error }

  const email = parseEmail(formData.get('email'))
  if (!email) return { success: false, error: '올바른 이메일 형식이 아닙니다' }

  try {
    const exists = await db.adminUser.findUnique({ where: { email } })
    if (exists) return { success: false, error: '이미 등록된 관리자입니다' }

    await db.adminUser.create({ data: { email } })
    revalidatePath('/admins')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function deleteAdmin(id: string): Promise<ActionResult> {
  const guard = await requireAdmin()
  if (!guard.ok) return { success: false, error: guard.error }

  // env-only 항목은 가짜 id (env:<email>) — UI에서 버튼 미렌더링되지만 방어
  if (id.startsWith('env:')) {
    return { success: false, error: '환경변수 관리자는 이 화면에서 제거할 수 없습니다' }
  }

  try {
    const target = await db.adminUser.findUnique({ where: { id } })
    if (!target) return { success: false, error: '존재하지 않는 관리자입니다' }

    // 본인 삭제 금지 (spec Q6)
    if (target.email.toLowerCase() === guard.email.toLowerCase()) {
      return { success: false, error: '본인은 삭제할 수 없습니다' }
    }

    await db.adminUser.delete({ where: { id } })
    revalidatePath('/admins')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
