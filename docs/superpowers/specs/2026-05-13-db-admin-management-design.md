# DB 기반 관리자 관리 + 즉시 권한 회수 설계

## 개요

현재 로그인 게이트는 `ADMIN_EMAILS` 환경변수 화이트리스트로만 운영되어, 관리자 추가/제거 시마다 코드 배포가 필요하다. 이를 DB(`AdminUser` 테이블) 기반으로 옮기고 앱 내 `/admins` UI에서 CRUD 가능하게 한다. 환경변수는 **부트스트랩 및 비상 복구용 fallback**으로 유지한다.

## 결정 사항 요약

| # | 항목 | 결정 |
|---|---|---|
| 1 | 방향 | DB(`AdminUser`) 기반 관리자 관리 |
| 2 | 관리 방식 | 앱 내 `/admins` 페이지에서 CRUD |
| 3 | 부트스트랩 | `ADMIN_EMAILS` 환경변수를 영구 fallback으로 유지 |
| 4 | 필드 범위 | `email`만 (기존 `AdminUser` 스키마 그대로) |
| 5 | 안전장치 | 본인 행 삭제 금지 |
| 6 | 세션 회수 | JWT 유지 + `jwt` 콜백에서 매 요청 시 DB 재검증 → 즉시 무효화 |
| 7 | 스키마 변경 | 없음 (마이그레이션 불필요) |
| 8 | 테스트 | 수동 체크리스트 |

---

## 1. 로그인 흐름 (변경 후)

```
사용자 → /login → "Slack으로 로그인" 클릭
  → Slack OAuth (변경 없음)
  → signIn 콜백:
       - user.email 없으면 거부
       - isAdmin(email) 호출:
           DB AdminUser에 email 있음? → 통과
           없다면 ADMIN_EMAILS 환경변수에 있음? → 통과 (부트스트랩)
           둘 다 아니면 거부
  → JWT 발급
  → 이후 매 요청:
       - jwt 콜백 재실행 → isAdmin(token.email) 재확인
       - false이면 토큰 무효 처리 → 미들웨어가 로그아웃 + /login 리다이렉트
```

---

## 2. 데이터 모델

**스키마 변경 없음.** 기존 `AdminUser` 모델을 그대로 사용한다 (`prisma/schema.prisma:76-83`).

```prisma
model AdminUser {
  id          String    @id @default(cuid())
  email       String    @unique
  slackUserId String?
  createdAt   DateTime  @default(now())
  accounts    Account[]
  sessions    Session[]
}
```

- 이번 작업에서는 `slackUserId`를 사용하지 않는다 (Q5에서 email-only 결정).
- `Account`/`Session`/`VerificationToken` 모델은 미사용 상태로 유지. 향후 DB 세션 전략 전환 시 활용.

---

## 3. 권한 판정 헬퍼 (`src/lib/admins.ts`)

권한 판정을 한 곳에서 처리하는 단일 진입점.

```ts
import { prisma } from './db'

function envWhitelist(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

/** 로그인/세션 갱신 시 호출. DB 우선, env는 fallback */
export async function isAdmin(email: string): Promise<boolean> {
  const normalized = email.toLowerCase()
  const dbHit = await prisma.adminUser.findUnique({ where: { email: normalized } })
  if (dbHit) return true
  return envWhitelist().includes(normalized)
}

/** env로 등록된 사용자인지 판정 (UI 출처 배지용) */
export function isEnvAdmin(email: string): boolean {
  return envWhitelist().includes(email.toLowerCase())
}

/** 관리자 목록 — DB + env 합쳐서 출처 정보와 함께 반환 */
export async function listAdmins() {
  const dbAdmins = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
  })
  const dbEmails = new Set(dbAdmins.map(a => a.email.toLowerCase()))
  const envOnly = envWhitelist()
    .filter(e => !dbEmails.has(e))
    .map(email => ({
      id: `env:${email}`,
      email,
      source: 'env' as const,
      createdAt: null as Date | null,
    }))
  const dbWithSource = dbAdmins.map(a => ({
    id: a.id,
    email: a.email,
    source: 'db' as const,
    createdAt: a.createdAt,
  }))
  return [...envOnly, ...dbWithSource]
}
```

**규칙:**
- 이메일은 항상 **소문자 정규화** (Slack이 원본 케이스를 그대로 반환하는 경우 대비).
- env-only 관리자도 UI 목록에 표시하되 출처 배지 `환경변수`, 삭제 버튼은 미렌더링.
- DB row 추가 후에도 env에 같은 이메일이 남아있으면, UI에서는 DB row로 표시되며 삭제 가능. 단, env에서 빼지 않는 한 같은 이메일이 다시 fallback으로 통과될 수 있음 → UI에 안내 문구.

---

## 4. 인증 콜백 변경 (`src/lib/auth.ts`)

**변경 전:**
```ts
const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim())

callbacks: {
  async signIn({ user }) {
    if (!user.email) return false
    return adminEmails.includes(user.email)
  },
  // ... jwt, session
}
```

**변경 후:**
```ts
import { isAdmin } from './admins'

callbacks: {
  async signIn({ user }) {
    if (!user.email) return false
    return await isAdmin(user.email)
  },

  async jwt({ token, user }) {
    // 첫 로그인 시 email을 토큰에 박아둠
    if (user?.email) {
      token.email = user.email.toLowerCase()
    }

    // 매 요청마다 재검증 (즉시 권한 회수 지원)
    if (token.email) {
      const stillAdmin = await isAdmin(token.email as string)
      if (!stillAdmin) {
        // NextAuth v5에서 null 반환 시 세션이 종료됨.
        // beta 동작이 불안정하면 token.invalid = true 플래그 후 미들웨어 처리로 fallback.
        return null
      }
    }
    return token
  },

  async session({ session, token }) {
    if (token?.email) {
      session.user.email = token.email as string
    }
    return session
  },
}
```

**구현 검증 포인트 (구현 단계에서):**
- NextAuth v5 beta에서 `jwt` 콜백 `null` 반환 시 동작을 `node_modules/next-auth/dist/...`에서 확인.
  - 정상이면 그대로 사용.
  - 미동작 또는 의도와 다르면 `token.invalid = true` 플래그 + `proxy.ts`에서 감지 후 강제 로그아웃 처리로 fallback.
- AGENTS.md에 따라 Next.js 16 / next-auth 5-beta 문서는 `node_modules` 내부 가이드를 우선 참고.

**에러 처리 (fail-closed):**
- `signIn` 콜백 중 DB 에러 → throw 그대로 → NextAuth가 에러 페이지로. 로그인 거부.
- `jwt` 콜백 중 DB 에러 → throw → NextAuth가 세션을 종료시키는 동작이 기대됨. (구현 시 try/catch 후 명시적으로 `null` 반환하여 결정적으로 만들 것.)
- DB 장애 시 모든 관리자가 잠겨도 환경변수 fallback이 있으므로 복구 가능.

---

## 5. 관리자 UI (`/admins`)

### 5.1 파일 구성

```
src/app/(protected)/admins/
  page.tsx              ← 서버 컴포넌트, 목록 + 추가 폼 렌더링
  AddAdminForm.tsx      ← 클라이언트, react-hook-form + zod
  DeleteAdminButton.tsx ← 클라이언트, confirm 다이얼로그
src/actions/admins.ts    ← 서버 액션 (createAdmin, deleteAdmin)
```

### 5.2 페이지 레이아웃

```
┌─────────────────────────────────────────────────┐
│ 관리자                                            │
│ Slack 로그인 후 이 페이지에 등록된 이메일만 접근 가능합니다.│
├─────────────────────────────────────────────────┤
│ ➕ 관리자 추가                                    │
│ [ email@example.com         ] [추가]              │
├─────────────────────────────────────────────────┤
│ 이메일               | 출처     | 등록일       | 작업 │
│ kyh@amass.co.kr     | DB      | 2026-05-13  | 🗑   │
│ admin@amass.co.kr   | DB      | 2026-05-10  | 🗑   │
│ founder@amass.co.kr | 환경변수  | -          | -    │
│ (본인 행)            | DB      | 2026-05-01  | (비활성) │
└─────────────────────────────────────────────────┘
```

**UX 디테일:**
- env-only 행: 출처 배지 `환경변수`, 삭제 버튼 미렌더링, 등록일 `-`.
- 본인 행: 삭제 버튼 `disabled` + tooltip "본인은 삭제할 수 없습니다".
- 빈 이메일/형식 오류: react-hook-form inline 에러 + `sonner` toast.
- 중복 이메일 추가: 서버 액션이 `이미 등록된 관리자입니다` 반환 → toast.
- 삭제 confirm 다이얼로그 문구: "정말 [email]을 관리자에서 제거하시겠습니까? 이 사용자의 기존 세션은 즉시 무효화됩니다."
- 페이지 상단에 안내문 1줄: "환경변수(`ADMIN_EMAILS`)에 등록된 관리자는 이 화면에서 제거할 수 없습니다. 코드/환경변수를 직접 수정하세요."

### 5.3 서버 액션 (`src/actions/admins.ts`)

```ts
'use server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdmin } from '@/lib/admins'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const emailSchema = z.string().email().transform(e => e.toLowerCase())

export async function createAdmin(formData: FormData) {
  const session = await auth()
  if (!session?.user?.email) return { error: '인증 필요' }
  if (!(await isAdmin(session.user.email))) return { error: '권한 없음' }

  const parsed = emailSchema.safeParse(formData.get('email'))
  if (!parsed.success) return { error: '올바른 이메일이 아닙니다' }

  const exists = await prisma.adminUser.findUnique({ where: { email: parsed.data } })
  if (exists) return { error: '이미 등록된 관리자입니다' }

  await prisma.adminUser.create({ data: { email: parsed.data } })
  revalidatePath('/admins')
  return { ok: true }
}

export async function deleteAdmin(id: string) {
  const session = await auth()
  if (!session?.user?.email) return { error: '인증 필요' }
  if (!(await isAdmin(session.user.email))) return { error: '권한 없음' }

  const target = await prisma.adminUser.findUnique({ where: { id } })
  if (!target) return { error: '존재하지 않습니다' }

  // 자기 자신 삭제 금지
  if (target.email.toLowerCase() === session.user.email.toLowerCase()) {
    return { error: '본인은 삭제할 수 없습니다' }
  }

  await prisma.adminUser.delete({ where: { id } })
  revalidatePath('/admins')
  return { ok: true }
}
```

### 5.4 네비게이션

기존 `(protected)` 레이아웃에 네비게이션이 있다면 `관리자` 메뉴 추가. 없다면 별도 추가 없이 직접 URL(`/admins`)로 접근.

---

## 6. 미들웨어 (`src/proxy.ts`)

현재 로직은 유지한다. JWT가 `null`이 되거나 token이 무효화되면 `req.auth`가 falsy해져 기존 리다이렉트 로직이 동작한다.

**선택적 보강 (구현 단계 판단):**
- `token.invalid` 플래그 방식 fallback 채택 시, 미들웨어에서 해당 플래그를 감지하여 명시적으로 로그아웃 처리 + `/login` 리다이렉트.

---

## 7. 테스트 전략

테스트 인프라(`vitest`/`jest`)가 현재 프로젝트에 없으므로 **수동 체크리스트**로 진행한다.

### 검증 체크리스트

| # | 시나리오 | 기대 동작 |
|---|---|---|
| 1 | env-only 사용자 첫 로그인 | 통과 |
| 2 | DB-only 사용자 로그인 | 통과 |
| 3 | env + DB 둘 다 등록된 사용자 | 통과 |
| 4 | 어느 곳에도 없는 사용자 | 거부 + 에러 페이지 |
| 5 | `/admins`에서 신규 관리자 추가 → 해당 사용자 로그인 | 통과 |
| 6 | 다른 관리자가 신규 관리자를 삭제 → 다음 요청 시 | 자동 로그아웃 |
| 7 | 본인 삭제 시도 | 거부 + 에러 메시지 |
| 8 | env-only 행 | 삭제 버튼 없음 |
| 9 | 잘못된 이메일 형식 추가 | inline 에러 |
| 10 | 중복 이메일 추가 | "이미 등록된 관리자" 에러 |
| 11 | 모든 DB row 삭제 + env에만 남김 → env 사용자 로그인 | 통과 (락아웃 방지) |
| 12 | DB 연결 실패 상태에서 로그인 시도 | 로그인 거부 (fail-closed) |

---

## 8. 에러 케이스 정리

| 상황 | 동작 |
|---|---|
| DB 연결 실패 (signIn 중) | 로그인 거부 + 에러 페이지 |
| DB 연결 실패 (jwt 콜백 중) | 토큰 무효 → 자동 로그아웃 (fail-closed) |
| env 미설정 + DB 비어있음 | 누구도 로그인 불가 — README에 부트스트랩 안내 명시 |
| env에 잘못된 형식 이메일 | trim/소문자만 적용, 매칭 안 되면 자연스럽게 무시 |
| 동시 추가 race (같은 이메일) | `email @unique` 제약 → 두 번째는 Prisma 에러를 `이미 등록된 관리자` 메시지로 변환 |
| `jwt` 콜백에서 `null` 반환이 v5 beta에서 미동작 | `token.invalid = true` 플래그 + 미들웨어 감지 fallback 채택 |

---

## 9. 마이그레이션 / 배포

- **DB 스키마 변경 없음** → `prisma migrate` 불필요.
- **환경변수 `ADMIN_EMAILS`**: 그대로 유지. 역할이 "fallback"으로 변경됨을 README/주석에 명시.
- **배포 순서:**
  1. 코드 배포.
  2. 첫 로그인 시 자동으로 env fallback 모드로 작동 시작.
  3. `/admins` 페이지에서 점진적으로 관리자를 DB에 추가.
  4. (선택) DB 이전 완료 후 환경변수는 "비상 복구용 1명만" 유지 권장.

---

## 10. 문서 업데이트

`README.md` 또는 적절한 `docs/`에 다음 내용을 한 단락 추가한다.

> ### 관리자 권한
> 관리자 권한은 DB의 `AdminUser` 테이블에서 관리되며, 로그인한 관리자가 `/admins` 페이지에서 추가/삭제할 수 있습니다.
>
> `ADMIN_EMAILS` 환경변수는 **부트스트랩 및 비상 복구용 fallback** 입니다. DB가 비어있거나 락아웃 상황에서 이 환경변수에 등록된 이메일은 항상 로그인 가능합니다. 운영 안정화 후 1명 정도만 유지하는 것을 권장합니다.

---

## 11. 범위 외 (이번 변경 미포함)

- DB 세션 전략 전환 (`PrismaAdapter` 활성화).
- 추가 OAuth 제공자.
- `AdminUser`에 `name` / `isActive` 추가.
- 역할 기반 권한 (admin/viewer 등 다중 역할).
- 자동화 테스트 인프라 도입.
- 마지막 관리자 삭제 금지 (env fallback이 있으므로 명시적 보호 생략).
