# DB 관리자 관리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ADMIN_EMAILS` 환경변수 화이트리스트를 DB(`AdminUser`) 기반 관리로 전환하고, `/admins` UI에서 CRUD 가능하게 한다. 환경변수는 부트스트랩/비상 복구용 fallback으로 유지.

**Architecture:** 단일 권한 헬퍼(`src/lib/admins.ts`)가 DB + env를 통합 조회한다. NextAuth `signIn` 콜백과 `jwt` 콜백이 이 헬퍼를 호출하여 (a) 로그인 게이트, (b) 매 요청 시 권한 재검증을 수행한다. 권한 회수 시 토큰에 `invalid` 플래그를 세팅하고, `session` 콜백과 미들웨어가 이를 감지해 로그아웃 처리한다.

**Tech Stack:** Next.js 16, NextAuth v5 (beta), Prisma 5 + PostgreSQL, React 19, TypeScript, shadcn UI + Tailwind, react-hook-form (선택), zod.

**Spec:** `docs/superpowers/specs/2026-05-13-db-admin-management-design.md`

---

## File Structure

| Path | Type | Responsibility |
|---|---|---|
| `src/lib/admins.ts` | New | 권한 판정 헬퍼 (`isAdmin`, `isEnvAdmin`, `listAdmins`) |
| `src/lib/auth.ts` | Modify | `signIn`/`jwt`/`session` 콜백을 DB 통합 + 즉시 회수로 변경 |
| `src/proxy.ts` | Modify | `req.auth.user?.email` 기반으로 인증 체크 견고화 |
| `src/actions/admins.ts` | New | 서버 액션 `createAdmin`, `deleteAdmin` |
| `src/components/admins/admin-table.tsx` | New | 관리자 목록 테이블 + 삭제 버튼 |
| `src/components/admins/add-admin-form.tsx` | New | 클라이언트 추가 폼 |
| `src/app/(protected)/admins/page.tsx` | New | 서버 컴포넌트, 목록 + 폼 렌더링 |
| `src/components/layout/sidebar.tsx` | Modify | 네비게이션에 "관리자" 항목 추가 |
| `src/components/layout/mobile-nav.tsx` | Modify | 모바일 네비게이션에 "관리자" 항목 추가 |
| `README.md` (또는 `docs/`) | Modify | 관리자 권한 운영 가이드 한 단락 추가 |
| `.env.local.example` | Modify | `ADMIN_EMAILS` 주석을 fallback 용도 명시로 변경 |

---

## Testing Approach

이 프로젝트는 자동화 테스트 인프라(`vitest`/`jest`)가 없습니다. spec(섹션 7)의 결정에 따라 **수동 검증 체크리스트**로 진행합니다.

- 각 Task는 코드 작성 후 `pnpm dev` 로컬에서 핵심 동작을 확인합니다.
- 전체 플로우 검증은 Task 10에서 spec 섹션 7의 12개 체크리스트를 한 번에 실행합니다.
- 코드 작성 시점에는 `pnpm build`로 타입/빌드 에러를 잡습니다.

---

## Task 1: 권한 판정 헬퍼 (`src/lib/admins.ts`) 작성

**Files:**
- Create: `src/lib/admins.ts`

- [ ] **Step 1: 파일 생성 및 헬퍼 작성**

`src/lib/admins.ts`:

```ts
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
```

- [ ] **Step 2: 타입체크 검증**

Run:
```bash
pnpm build
```
Expected: 성공 (단, 다른 변경이 없으므로 admins.ts 자체에서 에러 없음). 만약 `db.adminUser`를 인식하지 못하면 `pnpm prisma generate` 후 재시도.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/admins.ts
git commit -m "feat(auth): add admin permission helper with DB+env fallback"
```

---

## Task 2: NextAuth 콜백 변경 (`src/lib/auth.ts`)

**Files:**
- Modify: `src/lib/auth.ts`

이 Task는 두 가지를 한다:
1. `signIn` 콜백을 `isAdmin` 호출로 교체
2. `jwt` 콜백에 매 요청 재검증 + `invalid` 플래그 추가
3. `session` 콜백에서 `invalid` 토큰을 감지하여 user.email을 비움

> **결정 노트:** spec 섹션 4는 `jwt`에서 `null` 반환을 제안했으나, NextAuth v5 beta에서 `null` 반환 시 동작이 문서화되지 않아 불안정할 수 있다. 더 명시적인 `invalid` 플래그 패턴을 사용한다. 미들웨어가 `req.auth.user?.email`로 체크하여 로그아웃 처리한다 (Task 3에서 구현).

- [ ] **Step 1: 파일 전체 교체**

`src/lib/auth.ts`:

```ts
import NextAuth from 'next-auth'
import Slack from 'next-auth/providers/slack'
import { isAdmin } from './admins'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Slack({
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    /** 로그인 게이트: DB AdminUser 또는 ADMIN_EMAILS env에 있어야 통과 */
    async signIn({ user }) {
      if (!user.email) return false
      return await isAdmin(user.email)
    },

    /**
     * 매 요청마다 재검증 (즉시 권한 회수 지원).
     * 권한이 회수되면 token.email을 비우고 invalid=true 플래그를 세팅한다.
     */
    async jwt({ token, user }) {
      // 첫 로그인 시 user가 있을 때만 email을 박아둠 (소문자 정규화)
      if (user?.email) {
        token.email = user.email.toLowerCase()
        token.invalid = false
      }

      // 재요청 시 토큰의 email을 가지고 DB/env 재검증
      if (token.email) {
        const stillAdmin = await isAdmin(token.email as string)
        if (!stillAdmin) {
          token.email = undefined
          token.invalid = true
        }
      }
      return token
    },

    /**
     * invalid 토큰은 user.email을 비워 미들웨어가 로그아웃 처리하도록 함.
     */
    async session({ session, token }) {
      if (token?.invalid || !token?.email) {
        if (session.user) {
          session.user.email = ''
        }
        return session
      }
      if (token.email) {
        session.user.email = token.email as string
      }
      return session
    },
  },
})
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 성공. TypeScript 에러가 나오면 NextAuth 타입과 token shape 충돌일 수 있음 — 그 경우 `import type { JWT } from 'next-auth/jwt'` 추가 후 `token` 타입을 좁히는 방식으로 처리.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): replace env-only signIn with DB+env, add jwt revocation"
```

---

## Task 3: 미들웨어 보강 (`src/proxy.ts`)

기존 미들웨어는 `!!req.auth`로 인증 여부를 판단한다. invalid 토큰은 객체 자체는 존재하지만 `user.email`이 비어있으므로, 이메일 기준으로 체크하도록 견고화한다.

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: 파일 전체 교체**

`src/proxy.ts`:

```ts
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  // invalid 토큰은 session.user.email이 비어있음 → 로그아웃 상태로 간주
  const isLoggedIn = !!req.auth?.user?.email
  const isLoginPage = req.nextUrl.pathname === '/login'
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')
  const isCron = req.nextUrl.pathname.startsWith('/api/cron')

  if (isApiAuth || isCron) return NextResponse.next()
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/proxy.ts
git commit -m "feat(auth): tighten middleware check to require user.email"
```

---

## Task 4: 관리자 서버 액션 (`src/actions/admins.ts`)

**Files:**
- Create: `src/actions/admins.ts`

- [ ] **Step 1: 파일 생성**

`src/actions/admins.ts`:

```ts
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
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/actions/admins.ts
git commit -m "feat(admins): add createAdmin/deleteAdmin server actions with self-delete guard"
```

---

## Task 5: 관리자 테이블 컴포넌트 (`src/components/admins/admin-table.tsx`)

**Files:**
- Create: `src/components/admins/admin-table.tsx`

`employee-table.tsx`의 스타일을 따른다. env-only 행은 출처 배지를 표시하고 삭제 버튼을 미렌더링한다. 본인 행은 삭제 버튼이 비활성화된다.

- [ ] **Step 1: 파일 생성**

`src/components/admins/admin-table.tsx`:

```tsx
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
    if (!confirm(`정말 ${email}을(를) 관리자에서 제거하시겠습니까?\n이 사용자의 기존 세션은 즉시 무효화됩니다.`)) return
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
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/components/admins/admin-table.tsx
git commit -m "feat(admins): add admin list table with self/env safeguards"
```

---

## Task 6: 관리자 추가 폼 (`src/components/admins/add-admin-form.tsx`)

**Files:**
- Create: `src/components/admins/add-admin-form.tsx`

직원 폼의 `useTransition` + inline 에러 패턴을 따른다.

- [ ] **Step 1: 파일 생성**

`src/components/admins/add-admin-form.tsx`:

```tsx
'use client'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAdmin } from '@/actions/admins'

export function AddAdminForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createAdmin(formData)
      if (result.success) {
        formRef.current?.reset()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-2">
          <Label htmlFor="email">새 관리자 이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="admin@example.com"
            className="border-border"
          />
        </div>
        <Button
          type="submit"
          disabled={isPending}
          className="bg-coral hover:bg-coral-dark text-white"
        >
          {isPending ? '추가 중...' : '추가'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/components/admins/add-admin-form.tsx
git commit -m "feat(admins): add admin creation form"
```

---

## Task 7: 관리자 페이지 (`src/app/(protected)/admins/page.tsx`)

**Files:**
- Create: `src/app/(protected)/admins/page.tsx`

서버 컴포넌트로 `listAdmins` + 현재 세션을 조회해 테이블/폼에 주입.

- [ ] **Step 1: 파일 생성**

`src/app/(protected)/admins/page.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { listAdmins } from '@/lib/admins'
import { AddAdminForm } from '@/components/admins/add-admin-form'
import { AdminTable } from '@/components/admins/admin-table'

export default async function AdminsPage() {
  const [session, admins] = await Promise.all([auth(), listAdmins()])
  const currentEmail = session?.user?.email ?? ''

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="font-fraunces text-2xl text-ink font-semibold">관리자</h1>
        <p className="text-stone text-sm mt-0.5">
          이 화면에 등록된 이메일만 Slack 로그인 후 접근할 수 있습니다. 환경변수
          <code className="font-mono text-xs mx-1">ADMIN_EMAILS</code>에 등록된
          관리자는 비상 복구용이며, 이 화면에서 제거할 수 없습니다.
        </p>
      </div>

      <div className="bg-paper border border-border rounded-xl p-6">
        <AddAdminForm />
      </div>

      <div className="bg-paper border border-border rounded-xl overflow-hidden">
        <AdminTable admins={admins} currentEmail={currentEmail} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
pnpm build
```
Expected: 성공.

- [ ] **Step 3: 로컬에서 페이지 접근 확인**

```bash
pnpm dev
```
브라우저에서 `http://localhost:3000/admins` 접속.
Expected:
- 로그인된 상태면 페이지가 렌더되어 현재 env 화이트리스트 + DB 항목이 보임.
- 로그인 안 됐으면 `/login`으로 리다이렉트.

- [ ] **Step 4: 커밋**

```bash
git add src/app/\(protected\)/admins/page.tsx
git commit -m "feat(admins): add /admins page with list and add form"
```

---

## Task 8: 네비게이션 추가 (sidebar + mobile-nav)

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/mobile-nav.tsx`

`Shield` 또는 `UserCog` 아이콘 사용 (lucide-react). `UserCog`이 의미상 적절.

- [ ] **Step 1: sidebar.tsx 수정**

`src/components/layout/sidebar.tsx`의 import에 `UserCog` 추가, `navItems` 배열에 항목 추가:

기존:
```ts
import {
  LayoutDashboard,
  Users,
  Bell,
  Send,
  ScrollText,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/employees', label: '직원 관리', icon: Users },
  { href: '/rules', label: '알림 규칙', icon: Bell },
  { href: '/send', label: '수동 발송', icon: Send },
  { href: '/logs', label: '발송 이력', icon: ScrollText },
]
```

변경 후:
```ts
import {
  LayoutDashboard,
  Users,
  Bell,
  Send,
  ScrollText,
  UserCog,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/employees', label: '직원 관리', icon: Users },
  { href: '/rules', label: '알림 규칙', icon: Bell },
  { href: '/send', label: '수동 발송', icon: Send },
  { href: '/logs', label: '발송 이력', icon: ScrollText },
  { href: '/admins', label: '관리자', icon: UserCog },
]
```

- [ ] **Step 2: mobile-nav.tsx 수정**

`src/components/layout/mobile-nav.tsx`의 import에 `UserCog` 추가, `navItems` 배열에 항목 추가:

기존:
```ts
import { LayoutDashboard, Users, Bell, Send, ScrollText } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/employees', label: '직원', icon: Users },
  { href: '/rules', label: '규칙', icon: Bell },
  { href: '/send', label: '발송', icon: Send },
  { href: '/logs', label: '이력', icon: ScrollText },
]
```

변경 후:
```ts
import { LayoutDashboard, Users, Bell, Send, ScrollText, UserCog } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/employees', label: '직원', icon: Users },
  { href: '/rules', label: '규칙', icon: Bell },
  { href: '/send', label: '발송', icon: Send },
  { href: '/logs', label: '이력', icon: ScrollText },
  { href: '/admins', label: '관리자', icon: UserCog },
]
```

- [ ] **Step 3: 빌드 + 시각 확인**

```bash
pnpm build && pnpm dev
```
Expected: 빌드 성공. 브라우저에서 사이드바/모바일 네비에 "관리자" 항목 표시되고 클릭 시 `/admins`로 이동.

- [ ] **Step 4: 커밋**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx
git commit -m "feat(layout): add admins menu to sidebar and mobile nav"
```

---

## Task 9: 문서 / 환경변수 예시 업데이트

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md` (또는 `docs/` 어디든)

- [ ] **Step 1: `.env.local.example` 수정**

`.env.local.example` 파일을 열고 `ADMIN_EMAILS` 부분을 확인. 현재:

```
ADMIN_EMAILS=admin@yourcompany.com
```

위 줄 직전에 아래 주석을 추가:

```
# 관리자는 DB의 AdminUser 테이블에서 관리됩니다 (/admins UI).
# 이 환경변수는 부트스트랩 및 비상 복구용 fallback입니다.
# DB가 비어있거나 락아웃 상황에서 이 이메일은 항상 로그인 가능합니다.
# 운영 안정화 후에는 1명 정도만 유지하는 것을 권장합니다.
ADMIN_EMAILS=admin@yourcompany.com
```

- [ ] **Step 2: README.md 업데이트**

`README.md`를 열어 적절한 위치(예: 환경변수 설정 섹션 또는 끝부분)에 다음 단락 추가:

```markdown
### 관리자 권한

관리자 권한은 DB의 `AdminUser` 테이블에서 관리되며, 로그인한 관리자가 `/admins`
페이지에서 추가/삭제할 수 있습니다.

`ADMIN_EMAILS` 환경변수는 **부트스트랩 및 비상 복구용 fallback**입니다. DB가
비어있거나 락아웃 상황에서 이 환경변수에 등록된 이메일은 항상 로그인 가능합니다.
운영 안정화 후 1명 정도만 유지하는 것을 권장합니다.

#### 첫 관리자 추가

1. `.env.local`의 `ADMIN_EMAILS`에 자신의 Slack 이메일을 등록.
2. `pnpm dev`로 앱 실행 후 Slack 로그인.
3. `/admins` 페이지에서 동료 관리자들을 DB에 추가.
4. (선택) 안정화 후 `ADMIN_EMAILS`에서 일반 관리자 이메일을 제거하고 비상용 1명만 유지.
```

- [ ] **Step 3: 커밋**

```bash
git add .env.local.example README.md
git commit -m "docs: document DB-based admin management and env fallback"
```

---

## Task 10: 전체 수동 검증

이 Task는 코드 변경이 없다. spec 섹션 7의 12개 시나리오를 한 번에 실행한다.

**Setup:**
- `pnpm dev` 실행
- 2명의 Slack 워크스페이스 계정 필요:
  - **A 계정**: `ADMIN_EMAILS`에 등록되어 있음 (이하 "env 사용자")
  - **B 계정**: 어디에도 없음 (이하 "외부 사용자")
- DB 접근: `pnpm prisma studio` 또는 `psql`

- [ ] **체크 1: env-only 사용자 첫 로그인**

A 계정으로 `/login` → Slack 인증 → `/dashboard`로 이동.
Expected: 통과.

- [ ] **체크 2: 외부 사용자 로그인 거부**

로그아웃 후 B 계정으로 시도.
Expected: `/login?error=AccessDenied` 등 에러 페이지.

- [ ] **체크 3: 신규 관리자 추가**

A 계정으로 로그인 후 `/admins`에서 B 계정 이메일 추가.
DB 확인: `AdminUser` 테이블에 row 생성됨.

- [ ] **체크 4: 추가된 관리자 로그인**

로그아웃 후 B 계정으로 로그인.
Expected: 통과 (DB-only 사용자 로그인).

- [ ] **체크 5: DB + env 둘 다 등록된 사용자**

`ADMIN_EMAILS`에 B의 이메일도 추가하고 재시작 후 B 계정 로그인.
Expected: 통과. `/admins`에서 B는 'DB' 행으로 1번만 표시됨.

- [ ] **체크 6: 본인 삭제 금지**

A 계정 로그인 상태에서 `/admins`의 자기 행 → "본인" 버튼은 disabled.
서버 액션 직접 호출(예: 콘솔에서 fetch) 시도 시 `본인은 삭제할 수 없습니다` 반환.

- [ ] **체크 7: env-only 행 삭제 버튼 없음**

A 계정의 env-only 항목이 있다면 (env에만 등록되고 DB에는 없는 경우) 삭제 버튼 대신 "코드/환경변수 변경 필요" 문구 표시.

- [ ] **체크 8: 즉시 권한 회수**

탭1: A 계정 로그인.
탭2: B 계정 로그인 (둘 다 DB에 있음).
탭1에서 `/admins`로 가서 B 행 삭제.
탭2에서 임의의 protected 페이지(`/dashboard`) 새로고침.
Expected: 자동으로 `/login`으로 리다이렉트.

- [ ] **체크 9: 잘못된 이메일 형식**

`/admins`에서 `notanemail` 입력 후 추가.
Expected: 인라인 에러 `올바른 이메일 형식이 아닙니다`.

- [ ] **체크 10: 중복 이메일 추가**

이미 등록된 이메일을 다시 추가.
Expected: 인라인 에러 `이미 등록된 관리자입니다`.

- [ ] **체크 11: 락아웃 방지**

DB의 `AdminUser` row를 모두 삭제(`prisma studio` 또는 SQL):
```sql
DELETE FROM "AdminUser";
```
env에 등록된 A 계정으로 로그인 시도.
Expected: 통과 (env fallback 동작).

- [ ] **체크 12: DB 연결 실패 시 fail-closed**

(선택적 검증, 환경 구성이 가능하면) `DATABASE_URL`을 잘못된 값으로 변경 후 재시작.
신규 로그인 시도.
Expected: 로그인 거부 (env fallback도 함께 시도되므로, env 사용자는 통과할 수 있음 — 이는 spec 섹션 3의 fail-closed 정책에 부합).

- [ ] **마무리 커밋 (변경 없으면 생략)**

체크리스트 수행 중 발견한 버그를 별도 커밋으로 수정. 모두 통과하면 다음 단계.

---

## Self-Review

작성 후 점검 (writer's checklist):

**1. Spec coverage:**

| Spec 섹션 | 대응 Task |
|---|---|
| 1. 로그인 흐름 | Task 2 (signIn), Task 2 (jwt), Task 3 (middleware) |
| 2. 데이터 모델 (스키마 변경 없음) | N/A (변경 없음) |
| 3. 권한 헬퍼 (`admins.ts`) | Task 1 |
| 4. 인증 콜백 변경 | Task 2 |
| 5. 관리자 UI | Task 5, 6, 7, 8 |
| 6. 미들웨어 | Task 3 |
| 7. 테스트 체크리스트 | Task 10 |
| 8. 에러 케이스 | Task 1, 2, 4 (각 try/catch + fail-closed) |
| 9. 마이그레이션/배포 | DB 변경 없음 + Task 9 |
| 10. 문서 업데이트 | Task 9 |

모든 spec 요구사항이 Task에 매핑됨.

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 같은 표현 없음. 모든 코드 블록은 실제 동작 가능한 형태.

**3. Type consistency:**
- `AdminListEntry` (Task 1) ↔ `AdminTable.Props.admins` (Task 5): 일치.
- `ActionResult` 사용 (Task 4): 기존 `src/types/index.ts` 정의 그대로 따름.
- `isAdmin`, `isEnvAdmin`, `listAdmins` 시그니처 (Task 1) ↔ 호출처(Task 2, 4, 7): 일치.

**4. Spec과의 차이점 명시:**
- spec 섹션 3은 `prisma`라는 이름으로 import했지만 실제 코드베이스 컨벤션은 `db` — plan에서 `db`로 통일.
- spec 섹션 4는 `jwt`에서 `null` 반환을 제안했지만 NextAuth v5 beta 동작 불확실 → plan은 `invalid` 플래그 + 미들웨어 보강 방식 채택 (spec 섹션 4 "구현 검증 포인트" 항목에서 이 가능성을 이미 명시했음).
- spec 섹션 5.3은 `zod`를 사용했지만 plan은 의존성 추가 없이 정규식 기반 검증 (이미 `zod` 의존성이 package.json에 있긴 함 — 사용해도 OK이지만 단순화 선택).
