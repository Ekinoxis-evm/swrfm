import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionProfile } from '@/lib/supabase/server'
import { StatusPill } from '@/components/thermal'

export const dynamic = 'force-dynamic'

// Short relative time, e.g. "2 days ago", from an ISO timestamp.
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.35, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ]
  let v = secs
  for (const [size, name] of units) {
    if (v < size) {
      const n = Math.max(1, Math.floor(v))
      return `${n} ${name}${n === 1 ? '' : 's'} ago`
    }
    v /= size
  }
  return 'a while ago'
}

// Hours since an ISO timestamp (kept out of the render body so the time read is contained).
function hoursSince(iso: string | null): number {
  return iso ? (Date.now() - new Date(iso).getTime()) / 3.6e6 : Number.POSITIVE_INFINITY
}

// How each ledger reason reads in the activity feed.
const REASON: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' | 'cold' | 'warm' | 'neutral' }> = {
  receiving: { label: 'Received', tone: 'cold' },
  floor_transfer: { label: 'Transfer', tone: 'warm' },
  break_case: { label: 'Break case', tone: 'neutral' },
  removal: { label: 'Waste', tone: 'crit' },
  count_adjust: { label: 'Count', tone: 'neutral' },
  market_day: { label: 'Market day', tone: 'warm' },
  sale_toast: { label: 'Toast sale', tone: 'ok' },
  sale_shopify: { label: 'Shopify sale', tone: 'ok' },
  manual: { label: 'Manual', tone: 'neutral' },
}

export default async function DashboardPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  const [
    products,
    outOfStock,
    openSessions,
    pendingCharges,
    movements,
    archived,
    shopifyLinked,
    noBarcode,
    lastSyncRow,
  ] = await Promise.all([
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
    // Channel-sync health
    supabase.from('products').select('toast_guid', { count: 'exact', head: true }).not('archived_at', 'is', null),
    supabase
      .from('products')
      .select('toast_guid', { count: 'exact', head: true })
      .is('archived_at', null)
      .not('shopify_handle', 'is', null),
    supabase
      .from('products')
      .select('toast_guid', { count: 'exact', head: true })
      .is('archived_at', null)
      .is('barcode', null),
    supabase.from('products').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const activeCount = products.count ?? 0
  const archivedCount = archived.count ?? 0
  const shopifyCount = shopifyLinked.count ?? 0
  const noBarcodeCount = noBarcode.count ?? 0
  const lastSync = (lastSyncRow.data as { synced_at: string } | null)?.synced_at ?? null
  const syncAgeHours = hoursSince(lastSync)

  const stats = [
    { label: 'Active products', value: products.count ?? 0, tone: 'text-cold' },
    { label: 'Out of stock', value: outOfStock.count ?? 0, tone: 'text-crit' },
    { label: 'Open receivings', value: openSessions.data?.length ?? 0, tone: 'text-ok' },
    { label: 'Payments to review', value: pendingCharges.data?.length ?? 0, tone: 'text-warm' },
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
            <div className={`tnum text-3xl font-bold ${s.tone}`}>{s.value}</div>
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
            <p className="text-sm text-ink-3">Nothing pending.</p>
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
                <tr className="border-b border-line-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4 text-right">Change</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {movements.data.map((m) => (
                  <tr key={m.id}>
                    <td className="tnum py-2 pr-4 text-ink-3">
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
                      className={`tnum py-2 pr-4 text-right font-bold ${Number(m.delta) >= 0 ? 'text-ok' : 'text-crit'}`}
                    >
                      {Number(m.delta) >= 0 ? '+' : ''}
                      {Number(m.delta)}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusPill tone={REASON[m.reason]?.tone ?? 'neutral'}>
                        {REASON[m.reason]?.label ?? m.reason}
                      </StatusPill>
                    </td>
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

      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4">
          <h2 className="font-bold">Channel sync</h2>
          <p className="text-sm text-ink-3">
            Toast and Shopify stay the source of names, prices, and sales. This is the safety-net
            view of how current the master is.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Toast catalog</h3>
              <StatusPill tone={syncAgeHours < 26 ? 'ok' : syncAgeHours < 24 * 7 ? 'warn' : 'crit'}>
                {syncAgeHours < 26 ? 'fresh' : 'stale'}
              </StatusPill>
            </div>
            <p className="mt-1 text-xs text-ink-3">Menus V2 · last synced {relativeTime(lastSync)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Active</dt>
                <dd className="tnum text-lg font-bold text-cold">{activeCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
                  Dropped from Toast
                </dt>
                <dd className="tnum text-lg font-bold text-ink-2">{archivedCount}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Shopify</h3>
              <StatusPill tone={shopifyCount ? 'cold' : 'neutral'}>
                {activeCount ? `${Math.round((shopifyCount / activeCount) * 100)}% linked` : '—'}
              </StatusPill>
            </div>
            <p className="mt-1 text-xs text-ink-3">Admin GraphQL · matched by barcode / name</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Linked</dt>
                <dd className="tnum text-lg font-bold text-cold">{shopifyCount}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-3">Unlinked</dt>
                <dd className="tnum text-lg font-bold text-ink-2">
                  {Math.max(0, activeCount - shopifyCount)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {noBarcodeCount > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-warn-soft bg-warn-soft px-4 py-2.5 text-sm">
            <StatusPill tone="warn">Gap</StatusPill>
            <span className="text-ink-2">
              <b className="tnum">{noBarcodeCount}</b> active products have no barcode — the key that
              links Toast to Shopify and enables case/unit handling.
            </span>
          </div>
        )}

        {/* Discovered: Toast has native purchasing/receiving that overlaps ours. */}
        <div className="mt-3 rounded-xl border border-dashed border-line-2 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusPill tone="neutral">Not connected</StatusPill>
            <span className="font-semibold">Toast Purchasing &amp; Receiving</span>
          </div>
          <p className="mt-1.5 text-ink-2">
            Toast has a native purchasing module (Retail → Purchasing) plus xtraCHEF for
            line-item invoice capture — it overlaps our receiving and vendor invoices. Today those
            live in this app; connecting Toast’s module is a roadmap decision. See{' '}
            <span className="font-mono text-xs">docs/INTEGRACIONES.md</span>.
          </p>
        </div>
      </section>
    </div>
  )
}
