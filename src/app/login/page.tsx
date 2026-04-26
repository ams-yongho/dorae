import { signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'

async function slackSignIn() {
  'use server'
  await signIn('slack')
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm bg-paper border border-border rounded-2xl p-8 shadow-sm space-y-8">
        <div className="text-center space-y-1">
          <h1 className="font-fraunces text-3xl text-ink font-semibold">도래</h1>
          <p className="text-stone text-sm">직원 도래일 알림 서비스</p>
        </div>
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
