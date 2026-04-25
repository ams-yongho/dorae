import NextAuth from 'next-auth'
import Slack from 'next-auth/providers/slack'

const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim())

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
    async signIn({ user }) {
      if (!user.email) return false
      return adminEmails.includes(user.email)
    },
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (token.email) {
        session.user.email = token.email as string
      }
      return session
    },
  },
})
