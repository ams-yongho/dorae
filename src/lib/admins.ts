import { db } from './db'

/** ADMIN_EMAILS 환경변수에 등록된 이메일 목록 (소문자 정규화) */
function envWhitelist(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * 관리자 권한 판정. DB 우선, 환경변수는 부트스트랩/비상 복구용 fallback.
 * 로그인 게이트(`signIn` 콜백)와 매 요청 재검증(`jwt` 콜백)에서 호출됨.
 */
export async function isAdmin(email: string): Promise<boolean> {
  if (!email) return false
  const normalized = email.toLowerCase()
  try {
    const dbHit = await db.adminUser.findUnique({ where: { email: normalized } })
    if (dbHit) return true
  } catch (err) {
    // DB 장애 시 env fallback으로 폴오버 — env 사용자는 복구 가능, 그 외는 거부 (fail-closed)
    console.error('[admins.isAdmin] DB lookup failed, falling back to env', err)
  }
  return envWhitelist().includes(normalized)
}

/** 이메일이 ADMIN_EMAILS 환경변수에 있는지 (UI 출처 배지용) */
export function isEnvAdmin(email: string): boolean {
  if (!email) return false
  return envWhitelist().includes(email.toLowerCase())
}

export type AdminListEntry = {
  id: string
  email: string
  source: 'db' | 'env'
  createdAt: Date | null
}

/**
 * UI 표시용 통합 관리자 목록.
 * - DB row는 source='db', 실제 id와 createdAt 포함
 * - env-only 항목은 source='env', id='env:<email>' (가짜 id, 삭제 불가)
 * - DB와 env 양쪽에 있으면 DB 항목으로 통합 (env 출처 정보 표시는 UI 책임)
 */
export async function listAdmins(): Promise<AdminListEntry[]> {
  const dbAdmins = await db.adminUser.findMany({ orderBy: { createdAt: 'asc' } })
  const dbEmails = new Set(dbAdmins.map((a) => a.email.toLowerCase()))

  const dbEntries: AdminListEntry[] = dbAdmins.map((a) => ({
    id: a.id,
    email: a.email,
    source: 'db',
    createdAt: a.createdAt,
  }))

  const envOnlyEntries: AdminListEntry[] = envWhitelist()
    .filter((e) => !dbEmails.has(e))
    .map((email) => ({
      id: `env:${email}`,
      email,
      source: 'env',
      createdAt: null,
    }))

  return [...envOnlyEntries, ...dbEntries]
}
