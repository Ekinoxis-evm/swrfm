import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const REASON_LABEL: Record<string, string> = {
  receiving: '📦 Received',
  removal: '🥩 Removed',
  count_adjust: '🔢 Count',
  market_day: '🚚 Market day',
  sale_toast: '💳 Toast sale',
  sale_shopify: '🛒 Shopify sale',
  manual: '✏️ Manual',
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date + 'T00:00:00').getTime() - Date.now()) / 86400000)
}

export default async function ProductPage({ params }: { params: Promise<{ guid: string }> }) {
  const { guid } = await params
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const [{ data: product }, { data: level }, { data: entries }, { data: movements }] =
    await Promise.all([
      supabase
        .from('products')
        .select('toast_guid, name, category, vendor_name, vendor_id, price_cents, barcode, shopify_handle')
        .eq('toast_guid', guid)
        .single(),
      supabase.from('inventory_levels').select('on_hand, updated_at').eq('toast_guid', guid).maybeSingle(),
      supabase
        .from('receiving_lines')
        .select('id, received_qty, invoiced_qty, unit, expires_on, updated_at, receiving_sessions(id, date, invoice_no, status, vendors(name))')
        .eq('toast_guid', guid)
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('inventory_movements')
        .select('id, delta, reason, note, created_at, profiles(full_name)')
        .eq('toast_guid', guid)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
  if (!product) notFound()

  const onHand = Number(level?.on_hand ?? 0)
  const totals = { in: 0, out: 0, sold: 0 }
  for (const m of movements ?? []) {
    const d = Number(m.delta)
    if (d > 0) totals.in += d
    else totals.out += -d
    if (m.reason === 'market_day' || m.reason === 'sale_toast' || m.reason === 'sale_shopify')
      totals.sold += -d
  }

  const activeLots = (entries ?? []).filter(
    (e) => e.expires_on && daysUntil(e.expires_on as string) >= 0
  )
  const nextExpiry = activeLots.length
    ? activeLots.reduce((min, e) =>
        (e.expires_on as string) < (min.expires_on as string) ? e : min
      )
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{product.name}</h1>
          <p className="text-sm text-ink-3">
            {product.category ?? '—'} ·{' '}
            {product.vendor_id ? (
              <Link href={`/vendors/${product.vendor_id}`} className="text-sea hover:underline">
                {product.vendor_name}
              </Link>
            ) : (
              product.vendor_name ?? '—'
            )}
            {product.price_cents != null && ` · $${(product.price_cents / 100).toFixed(2)}`}
          </p>
          <p className="mt-1 text-xs">
            <span className="rounded bg-sea-soft px-1.5 py-0.5 font-bold text-sea">TOAST</span>{' '}
            {product.shopify_handle && (
              <span className="rounded bg-pine-soft px-1.5 py-0.5 font-bold text-pine">SHOPIFY</span>
            )}
            {product.barcode && <span className="ml-2 text-ink-3">barcode {product.barcode}</span>}
          </p>
        </div>
        <Link
          href="/inventory"
          className="rounded-lg border border-line-2 bg-surface px-4 py-2 text-sm font-bold text-ink-2"
        >
          ← Inventory
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'On hand', value: onHand, tone: onHand <= 0 ? 'text-coral' : 'text-ink' },
          { label: 'Received (total)', value: totals.in, tone: 'text-pine' },
          { label: 'Out (total)', value: totals.out, tone: 'text-coral' },
          { label: 'Sold (markets/online)', value: totals.sold, tone: 'text-brand' },
          {
            label: 'Days to next expiry',
            value: nextExpiry ? `${daysUntil(nextExpiry.expires_on as string)}d` : '—',
            tone:
              nextExpiry && daysUntil(nextExpiry.expires_on as string) <= 3
                ? 'text-coral'
                : nextExpiry && daysUntil(nextExpiry.expires_on as string) <= 7
                  ? 'text-brand'
                  : 'text-ink-2',
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4 text-center">
            <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold">Entries (receivings)</h2>
          {entries?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Vendor</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {entries.map((e) => {
                    const session = e.receiving_sessions as unknown as {
                      id: string
                      date: string
                      invoice_no: string | null
                      vendors: { name: string } | null
                    } | null
                    const days = e.expires_on ? daysUntil(e.expires_on as string) : null
                    return (
                      <tr key={e.id}>
                        <td className="py-2 pr-3">
                          {session ? (
                            <Link href={`/receiving/${session.id}`} className="text-sea hover:underline">
                              {session.date}
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-ink-3">{session?.vendors?.name ?? '—'}</td>
                        <td className="py-2 pr-3 text-right font-semibold">
                          {Number(e.received_qty)} {e.unit}
                        </td>
                        <td className="py-2">
                          {e.expires_on ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                days! < 0
                                  ? 'bg-surface-3 text-ink-3 line-through'
                                  : days! <= 3
                                    ? 'bg-coral text-white'
                                    : days! <= 7
                                      ? 'bg-brand-soft text-brand'
                                      : 'bg-surface-2 text-ink-2'
                              }`}
                            >
                              {e.expires_on as string} ({days}d)
                            </span>
                          ) : (
                            <span className="text-xs text-ink-3">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-3">No receivings recorded for this product yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold">All movements</h2>
          {movements?.length ? (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3 text-right">Change</th>
                    <th className="py-2">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 text-ink-3">
                        {new Date(m.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 pr-3">{REASON_LABEL[m.reason] ?? m.reason}</td>
                      <td
                        className={`py-2 pr-3 text-right font-bold ${
                          Number(m.delta) >= 0 ? 'text-pine' : 'text-coral'
                        }`}
                      >
                        {Number(m.delta) >= 0 ? '+' : ''}
                        {Number(m.delta)}
                      </td>
                      <td className="py-2 text-xs text-ink-3">
                        {(m.profiles as unknown as { full_name: string } | null)?.full_name ?? 'system'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-3">No movements yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}
