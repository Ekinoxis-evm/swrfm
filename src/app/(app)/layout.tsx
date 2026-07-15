import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionProfile } from '@/lib/supabase/server'
import SignOutButton from '@/components/sign-out-button'

const NAV = {
  admin: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/receiving', label: 'Receiving' },
    { href: '/market-days', label: 'Market days' },
    { href: '/vendors', label: 'Vendors' },
    { href: '/charges', label: 'Charges' },
    { href: '/removals', label: 'Removals' },
  ],
  staff: [
    { href: '/inventory', label: 'Inventory' },
    { href: '/receiving', label: 'Receiving' },
    { href: '/market-days', label: 'Market days' },
    { href: '/removals', label: 'Removals' },
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
            SWR <span className="text-brand">//</span> Inventory
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {NAV[profile.role].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-2 hover:bg-surface-2"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ROLE_BADGE[profile.role]}`}
            >
              {profile.role}
            </span>
            <span className="hidden text-sm font-semibold text-ink-2 md:block">
              {profile.full_name}
            </span>
            <SignOutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sm:hidden">
          {NAV[profile.role].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-ink-2"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
