'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Bell, Send, ScrollText } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/employees', label: '직원', icon: Users },
  { href: '/rules', label: '규칙', icon: Bell },
  { href: '/send', label: '발송', icon: Send },
  { href: '/logs', label: '이력', icon: ScrollText },
]

export function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-paper border-t border-border z-50">
      <div className="flex">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'text-coral font-medium'
                : 'text-stone'
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
