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
