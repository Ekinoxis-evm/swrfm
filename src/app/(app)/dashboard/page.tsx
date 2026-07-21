import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  const [products, outOfStock, openSessions, pendingCharges, movements] = await Promise.all([
    supabase
      .from('products')
      .select('toast_guid', { count: 'exact', head: true })
      .eq('active', true)
      .is('archived_at', null),
    supabase.from('inventory_levels').select('toast_guid', { count: 'exact', head: true }).lte('on_hand', 0),
    supabase
      .from('receiving_sessions')
      .select('id, date, invoice_no, status, vendors(name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('vendor_charges')
      .select('id, amount_cents, description, status, submitted_at, vendors(name)')
      .in('status', ['submitted', 'review'])
      .order('submitted_at', { ascending: false })
      .limit(5),
    supabase
      .from('inventory_movements')
      .select('id, delta, reason, created_at, products(name), profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const stats = [
    { label: 'Active products', value: products.count ?? 0, tone: 'text-sea' },
    { label: 'Out of stock', value: outOfStock.count ?? 0, tone: 'text-coral' },
    { label: 'Open receivings', value: openSessions.data?.length ?? 0, tone: 'text-pine' },
    { label: 'Payments to review', value: pendingCharges.data?.length ?? 0, tone: 'text-brand' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-ink-3">Live view of the master inventory and team activity</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
            <div className={`text-3xl font-bold ${s.tone}`}>{s.value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Open receiving sessions</h2>
            <Link href="/receiving" className="text-sm font-semibold text-sea hover:underline">
              View all →
            </Link>
          </div>
          {openSessions.data?.length ? (
            <ul className="divide-y divide-line">
              {openSessions.data.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-semibold">
                      {(s.vendors as unknown as { name: string } | null)?.name ?? 'Vendor'}
                    </div>
                    <div className="text-xs text-ink-3">
                      {s.date} {s.invoice_no ? `· Invoice ${s.invoice_no}` : ''}
                    </div>
                  </div>
                  <Link
                    href={`/receiving/${s.id}`}
                    className="rounded-lg bg-pine-soft px-3 py-1.5 text-xs font-bold text-pine"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No open sessions.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Vendor payments pending review</h2>
            <Link href="/vendors/payments" className="text-sm font-semibold text-sea hover:underline">
              Manage →
            </Link>
          </div>
          {pendingCharges.data?.length ? (
            <ul className="divide-y divide-line">
              {pendingCharges.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-semibold">
                      {(c.vendors as unknown as { name: string } | null)?.name ?? 'Vendor'} — $
                      {((c.amount_cents ?? 0) / 100).toFixed(2)}
                    </div>
                    <div className="text-xs text-ink-3">{c.description ?? '—'}</div>
                  </div>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold uppercase text-brand">
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Nothing pending. 🎉</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Recent inventory movements</h2>
          <Link href="/removals" className="text-sm font-semibold text-sea hover:underline">
            Removal log & sign-off →
          </Link>
        </div>
        {movements.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Change</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {movements.data.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-4 text-ink-3">
                      {new Date(m.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 pr-4 font-semibold">
                      {(m.products as unknown as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td
                      className={`py-2 pr-4 font-bold ${Number(m.delta) >= 0 ? 'text-pine' : 'text-coral'}`}
                    >
                      {Number(m.delta) >= 0 ? '+' : ''}
                      {Number(m.delta)}
                    </td>
                    <td className="py-2 pr-4">{m.reason}</td>
                    <td className="py-2 text-ink-3">
                      {(m.profiles as unknown as { full_name: string } | null)?.full_name ?? 'system'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-3">
            No movements yet — receive a delivery or log a removal and it will appear here with
            full attribution.
          </p>
        )}
      </section>
    </div>
  )
}
