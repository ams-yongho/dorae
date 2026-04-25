'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
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

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden lg:flex flex-col w-56 min-h-screen bg-paper border-r border-border">
      <div className="px-6 py-5 border-b border-border">
        <span className="font-fraunces text-xl text-ink font-semibold tracking-tight">
          도래
        </span>
        <span className="ml-2 text-stone text-sm font-mono">Dorae</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-coral text-white font-medium'
                : 'text-graphite hover:bg-parchment hover:text-ink'
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
