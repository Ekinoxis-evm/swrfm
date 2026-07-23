'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavLinks({
  items,
  mobile = false,
}: {
  items: readonly { href: string; label: string; activePaths?: readonly string[] }[]
  mobile?: boolean
}) {
  const pathname = usePathname()
  return (
    <>
      {items.map((n) => {
        // A section hub stays highlighted across all its sub-pages.
        const active = n.activePaths
          ? n.activePaths.some((p) => pathname === p || pathname.startsWith(p + '/'))
          : pathname === n.href || pathname.startsWith(n.href + '/')
        return (
          <Link
            key={n.href}
            href={n.href}
            className={
              mobile
                ? `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    active ? 'bg-ink text-cream' : 'bg-surface text-ink-2'
                  }`
                : `rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    active ? 'bg-ink text-cream' : 'text-ink-2 hover:bg-surface-2'
                  }`
            }
          >
            {n.label}
          </Link>
        )
      })}
    </>
  )
}
