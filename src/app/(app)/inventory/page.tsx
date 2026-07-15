'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Row = {
  toast_guid: string
  name: string
  category: string | null
  vendor_name: string | null
  price_cents: number | null
  shopify_handle: string | null
  on_hand: number
}

export default function InventoryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [countVal, setCountVal] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveCount(row: Row) {
    const counted = Number(countVal)
    if (!Number.isFinite(counted) || counted < 0) return
    setSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const delta = counted - row.on_hand
    if (delta !== 0) {
      const { error } = await supabase.from('inventory_movements').insert({
        toast_guid: row.toast_guid,
        delta,
        reason: 'count_adjust',
        note: `count: ${row.on_hand} → ${counted}`,
        created_by: user?.id,
      })
      if (error) {
        alert(error.message)
        setSaving(false)
        return
      }
      setRows((prev) =>
        prev.map((r) => (r.toast_guid === row.toast_guid ? { ...r, on_hand: counted } : r))
      )
    }
    setEditing(null)
    setSaving(false)
  }

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const [{ data: products }, { data: levels }] = await Promise.all([
        supabase
          .from('products')
          .select('toast_guid, name, category, vendor_name, price_cents, shopify_handle')
          .eq('active', true)
          .order('name')
          .limit(2000),
        supabase.from('inventory_levels').select('toast_guid, on_hand'),
      ])
      const level = new Map((levels ?? []).map((l) => [l.toast_guid, Number(l.on_hand)]))
      setRows(
        (products ?? []).map((p) => ({ ...p, on_hand: level.get(p.toast_guid) ?? 0 })) as Row[]
      )
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('inventory-levels')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_levels' },
        (payload) => {
          const rec = payload.new as { toast_guid: string; on_hand: number }
          setRows((prev) =>
            prev.map((r) =>
              r.toast_guid === rec.toast_guid ? { ...r, on_hand: Number(rec.on_hand) } : r
            )
          )
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(t) ||
        (r.category ?? '').toLowerCase().includes(t) ||
        (r.vendor_name ?? '').toLowerCase().includes(t)
    )
  }, [rows, q])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Master inventory</h1>
          <p className="text-sm text-ink-3">
            {loading ? 'Loading…' : `${rows.length} products · live levels update in real time`}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product, category, vendor…"
            className="w-full max-w-sm flex-1 rounded-lg border border-line-2 bg-surface px-3 py-2.5 outline-none focus:border-brand"
          />
          <a
            href="/receiving/new"
            className="whitespace-nowrap rounded-lg bg-pine px-4 py-2.5 text-sm font-bold text-white active:scale-[0.98]"
          >
            + Receive delivery
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Links</th>
              <th className="px-4 py-3 text-right">On hand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.slice(0, 200).map((r) => (
              <tr key={r.toast_guid} className="hover:bg-cream">
                <td className="px-4 py-2.5 font-semibold">{r.name}</td>
                <td className="px-4 py-2.5 text-ink-3">{r.vendor_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-3">{r.category ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.price_cents != null ? `$${(r.price_cents / 100).toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className="rounded bg-sea-soft px-1.5 py-0.5 text-[10px] font-bold text-sea">
                    TOAST
                  </span>{' '}
                  {r.shopify_handle && (
                    <span className="rounded bg-pine-soft px-1.5 py-0.5 text-[10px] font-bold text-pine">
                      SHOPIFY
                    </span>
                  )}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-bold ${r.on_hand <= 0 ? 'text-coral' : 'text-ink'}`}
                >
                  {editing === r.toast_guid ? (
                    <span className="flex items-center justify-end gap-1.5">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        step="any"
                        value={countVal}
                        onChange={(e) => setCountVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveCount(r)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="w-20 rounded-lg border border-brand bg-cream px-2 py-1.5 text-right font-bold outline-none"
                      />
                      <button
                        onClick={() => saveCount(r)}
                        disabled={saving}
                        className="rounded-lg bg-pine px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-lg bg-surface-3 px-2.5 py-1.5 text-xs font-bold text-ink-3"
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setEditing(r.toast_guid)
                        setCountVal(String(r.on_hand))
                      }}
                      title="Count / adjust this product"
                      className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-brand-soft"
                    >
                      {r.on_hand}
                      <span className="text-xs text-ink-3 opacity-60 group-hover:opacity-100">
                        ✎
                      </span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
            Showing first 200 of {filtered.length} — refine the search.
          </p>
        )}
      </div>
    </div>
  )
}
