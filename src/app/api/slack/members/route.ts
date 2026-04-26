import { NextRequest, NextResponse } from 'next/server'
import { slack } from '@/lib/slack'
import { auth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q') ?? ''

  try {
    const res = await slack.users.list({ limit: 200 })
    const members = (res.members ?? [])
      .filter(
        (m) =>
          !m.is_bot &&
          !m.deleted &&
          m.id !== 'USLACKBOT' &&
          (m.real_name?.toLowerCase().includes(q.toLowerCase()) ||
            m.profile?.email?.toLowerCase().includes(q.toLowerCase()))
      )
      .slice(0, 20)
      .map((m) => ({
        id: m.id,
        name: m.real_name,
        email: m.profile?.email,
        avatar: m.profile?.image_48,
      }))
    return NextResponse.json({ members })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
