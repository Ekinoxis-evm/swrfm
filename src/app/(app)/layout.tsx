import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionProfile } from '@/lib/supabase/server'
import SignOutButton from '@/components/sign-out-button'
import NavLinks from '@/components/nav-links'
import SubNav from '@/components/sub-nav'

// Inventory is a hub: its sub-pages (master list, transfers, receiving) live under a
// secondary tab row, so the top nav stays short. The hub item highlights across all of them.
const INVENTORY_HUB = ['/inventory', '/transfers', '/receiving']

const NAV = {
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/inventory', label: 'Inventory', activePaths: INVENTORY_HUB },
    { href: '/market-days', label: 'Market days' },
    { href: '/vendors', label: 'Vendors' },
    { href: '/users', label: 'Users' },
  ],
  staff: [
    { href: '/inventory', label: 'Inventory', activePaths: INVENTORY_HUB },
    { href: '/market-days', label: 'Market days' },
  ],
  vendor: [{ href: '/vendor', label: 'My portal' }],
} as const

const ROLE_BADGE = {
  admin: 'bg-brand-soft text-brand',
  staff: 'bg-pine-soft text-pine',
  vendor: 'bg-sea-soft text-sea',
} as const

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getSessionProfile()
  if (!profile) redirect('/login')

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b-2 border-line-2 bg-surface-3/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="text-base font-bold tracking-tight">
            SWR <span className="text-brand">{'//'}</span> Inventory
          </Link>
          <nav className="hidden gap-1 sm:flex">
            <NavLinks items={NAV[profile.role]} />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ROLE_BADGE[profile.role]}`}
            >
              {profile.role}
            </span>
            <Link
              href="/account"
              title="Account — change password"
              className="hidden text-sm font-semibold text-ink-2 hover:underline md:block"
            >
              {profile.full_name}
            </Link>
            <Link
              href="/account"
              className="rounded-lg border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-3 hover:bg-surface"
            >
              Account
            </Link>
            <SignOutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sm:hidden">
          <NavLinks items={NAV[profile.role]} mobile />
        </nav>
        <SubNav />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
