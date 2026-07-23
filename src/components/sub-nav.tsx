'use client'

// Secondary navigation for section hubs. Right now the Inventory hub groups the
// master list, stock transfers, and receiving under one section — shown as a tab row
// under the main header whenever you're anywhere inside the hub.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = { href: string; label: string }

const HUBS: { match: (p: string) => boolean; tabs: Tab[] }[] = [
  {
    match: (p) => p === '/inventory' || p.startsWith('/transfers') || p.startsWith('/receiving'),
    tabs: [
      { href: '/inventory', label: 'Master' },
      { href: '/transfers', label: 'Transfers' },
      { href: '/receiving', label: 'Receiving' },
    ],
  },
]

export default function SubNav() {
  const pathname = usePathname()
  const hub = HUBS.find((h) => h.match(pathname))
  if (!hub) return null

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
        {hub.tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + '/')
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active ? 'bg-cold-soft text-cold' : 'text-ink-3 hover:bg-surface-2'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
