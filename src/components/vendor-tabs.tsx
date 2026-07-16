import Link from 'next/link'

// Tabs for the Vendors hub: Directory | Payments (with pending-count badge).
export default function VendorTabs({
  active,
  pending = 0,
}: {
  active: 'directory' | 'payments'
  pending?: number
}) {
  const base = 'rounded-lg px-4 py-2 text-sm font-bold transition'
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-1.5 w-fit">
      <Link
        href="/vendors"
        className={`${base} ${active === 'directory' ? 'bg-ink text-cream' : 'text-ink-2 hover:bg-surface-2'}`}
      >
        Directory
      </Link>
      <Link
        href="/vendors/payments"
        className={`${base} flex items-center gap-2 ${active === 'payments' ? 'bg-ink text-cream' : 'text-ink-2 hover:bg-surface-2'}`}
      >
        Payments
        {pending > 0 && (
          <span className="rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">
            {pending}
          </span>
        )}
      </Link>
    </div>
  )
}
