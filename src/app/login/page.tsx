import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: '관리자 권한이 없는 계정입니다. 관리자에게 문의하세요.',
  Configuration: '서버 설정 오류입니다. 관리자에게 문의하세요.',
  Verification: '인증에 실패했습니다. 다시 시도해주세요.',
  default: '로그인 중 오류가 발생했습니다. 다시 시도해주세요.',
}

async function slackSignIn() {
  'use server'
  try {
    await signIn('slack', { redirectTo: '/dashboard' })
  } catch (error) {
    // NextAuth 자체 에러(예: 화이트리스트 외 사용자)는 /login?error=...로 안내
    if (error instanceof AuthError) {
      redirect(`/login?error=${error.type}`)
    }
    // NEXT_REDIRECT는 정상 흐름 — 반드시 re-throw
    throw error
  }
}

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const errorKey = params.error
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.default)
    : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm bg-paper border border-border rounded-2xl p-8 shadow-sm space-y-8">
        <div className="text-center space-y-1">
          <h1 className="font-fraunces text-3xl text-ink font-semibold">도래</h1>
          <p className="text-stone text-sm">직원 도래일 알림 서비스</p>
        </div>
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        <form action={slackSignIn}>
          <Button
            type="submit"
            className="w-full bg-coral hover:bg-coral-dark text-white"
          >
            <svg className="mr-2 size-4" viewBox="0 0 54 54" fill="none">
              <path d="M19.7 33.5c0 2.8-2.2 5-5 5s-5-2.2-5-5 2.2-5 5-5h5v5z" fill="#E01E5A"/>
              <path d="M22.2 33.5c0-2.8 2.2-5 5-5s5 2.2 5 5v12.5c0 2.8-2.2 5-5 5s-5-2.2-5-5V33.5z" fill="#E01E5A"/>
              <path d="M27.2 19.7c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5v5h-5z" fill="#36C5F0"/>
              <path d="M27.2 22.2c2.8 0 5 2.2 5 5s-2.2 5-5 5H14.7c-2.8 0-5-2.2-5-5s2.2-5 5-5h12.5z" fill="#36C5F0"/>
              <path d="M40.9 27.2c0 2.8-2.2 5-5 5s-5-2.2-5-5v-5h5c2.8 0 5 2.2 5 5z" fill="#2EB67D"/>
              <path d="M38.4 27.2c0-2.8-2.2-5-5-5s-5 2.2-5 5v12.5c0 2.8 2.2 5 5 5s5-2.2 5-5V27.2z" fill="#2EB67D"/>
              <path d="M33.4 40.9c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5v-5h5z" fill="#ECB22E"/>
              <path d="M33.4 38.4c-2.8 0-5-2.2-5-5s2.2-5 5-5h12.5c2.8 0 5 2.2 5 5s-2.2 5-5 5H33.4z" fill="#ECB22E"/>
            </svg>
            Slack으로 로그인
          </Button>
        </form>
        <p className="text-center text-xs text-stone">관리자 계정으로만 접근 가능합니다</p>
      </div>
    </div>
  )
}
