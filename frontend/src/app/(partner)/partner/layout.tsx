'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Button } from '@/components/ui/button'
import { usePartnerAuth } from '@/hooks/use-partner-auth'
import {
  LayoutDashboard,
  Users,
  Receipt,
  CreditCard,
  LogOut,
  Link as LinkIcon,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', nameRu: 'Главная', href: '/partner', icon: LayoutDashboard },
  { name: 'Leads', nameRu: 'Клиенты', href: '/partner/leads', icon: Users },
  { name: 'Transactions', nameRu: 'Транзакции', href: '/partner/transactions', icon: Receipt },
  { name: 'Payout', nameRu: 'Вывод средств', href: '/partner/payout', icon: CreditCard },
]

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { partner, signOut, loading } = usePartnerAuth()

  const handleSignOut = async () => {
    await signOut()
    router.push('/partner/login')
  }

  // If not authenticated and not on login page, redirect
  if (!loading && !partner && pathname !== '/partner/login') {
    router.push('/partner/login')
    return null
  }

  // Show login page without layout
  if (pathname === '/partner/login') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass-header sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/partner" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">D</span>
              </div>
              <span className="font-semibold text-lg">Demper Partner</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {partner?.email}
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 shrink-0 hidden lg:block">
            <nav className="glass-card p-2 sticky top-24 space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.nameRu}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Mobile navigation */}
          <div className="lg:hidden mb-4 w-full">
            <nav className="glass-card p-2 flex gap-2 overflow-x-auto">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                    pathname === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.nameRu}
                </Link>
              ))}
            </nav>
          </div>

          {/* Main content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
