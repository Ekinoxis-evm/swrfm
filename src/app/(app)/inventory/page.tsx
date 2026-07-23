'use client'

// Inventory hub: live levels, inline count & remove actions on each row,
// expiry highlighting, and links to each product's own page.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Row = {
  toast_guid: string
  name: string
  category: string | null
  vendor_name: string | null
  price_cents: number | null
  shopify_handle: string | null
  on_hand: number
  storage_on_hand: number
  floor_on_hand: number
  next_expiry: string | null
}

type EditMode = { guid: string; kind: 'count' | 'remove' } | null

function daysUntil(date: string | null): number | null {
  if (!date) return null
  return Math.ceil((new Date(date + 'T00:00:00').getTime() - Date.now()) / 86400000)
}

function ExpiryBadge({ date }: { date: string | null }) {
  const days = daysUntil(date)
  if (days == null) return <span className="text-xs text-ink-3">—</span>
  const tone =
    days <= 3 ? 'bg-coral text-white' : days <= 7 ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink-2'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {date}{' '}
      <span className="opacity-75">({days}d)</span>
    </span>
  )
}

export default function InventoryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<EditMode>(null)
  const [val, setVal] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const [{ data: products }, { data: levels }, { data: expiry }] = await Promise.all([
        supabase
          .from('products')
          .select('toast_guid, name, category, vendor_name, price_cents, shopify_handle')
          .eq('active', true)
          .is('archived_at', null)
          .order('name')
          .limit(2000),
        supabase.from('inventory_levels').select('toast_guid, on_hand, storage_on_hand, floor_on_hand'),
        supabase.from('product_next_expiry').select('toast_guid, next_expiry'),
      ])
      const level = new Map(
        (levels ?? []).map((l) => [
          l.toast_guid,
          {
            on_hand: Number(l.on_hand),
            storage: Number(l.storage_on_hand),
            floor: Number(l.floor_on_hand),
          },
        ])
      )
      const exp = new Map((expiry ?? []).map((e) => [e.toast_guid, e.next_expiry as string]))
      setRows(
        (products ?? []).map((p) => ({
          ...p,
          on_hand: level.get(p.toast_guid)?.on_hand ?? 0,
          storage_on_hand: level.get(p.toast_guid)?.storage ?? 0,
          floor_on_hand: level.get(p.toast_guid)?.floor ?? 0,
          next_expiry: exp.get(p.toast_guid) ?? null,
        })) as Row[]
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
          const rec = payload.new as {
            toast_guid: string
            on_hand: number
            storage_on_hand: number
            floor_on_hand: number
          }
          setRows((prev) =>
            prev.map((r) =>
              r.toast_guid === rec.toast_guid
                ? {
                    ...r,
                    on_hand: Number(rec.on_hand),
                    storage_on_hand: Number(rec.storage_on_hand),
                    floor_on_hand: Number(rec.floor_on_hand),
                  }
                : r
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

  async function save(row: Row) {
    const n = Number(val)
    if (!Number.isFinite(n) || n < 0 || !edit) return
    setSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (edit.kind === 'count') {
      const delta = n - row.on_hand
      if (delta !== 0) {
        const { error } = await supabase.from('inventory_movements').insert({
          toast_guid: row.toast_guid,
          delta,
          reason: 'count_adjust',
          note: `count: ${row.on_hand} → ${n}`,
          created_by: user?.id,
        })
        if (error) {
          alert(error.message)
          setSaving(false)
          return
        }
        setRows((prev) =>
          prev.map((r) => (r.toast_guid === row.toast_guid ? { ...r, on_hand: n } : r))
        )
      }
    } else {
      if (n > 0) {
        // Retiro por unidad suelta: la RPC escribe el retiro y el movimiento del ledger
        // en una sola transacción (antes eran dos inserts que podían quedar a medias).
        const { error } = await supabase.rpc('log_removal', {
          p_toast_guid: row.toast_guid,
          p_qty: n,
          p_remove_by: 'unit',
        })
        if (error) {
          alert(error.message)
          setSaving(false)
          return
        }
        setRows((prev) =>
          prev.map((r) =>
            r.toast_guid === row.toast_guid ? { ...r, on_hand: r.on_hand - n } : r
          )
        )
      }
    }
    setEdit(null)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Master inventory</h1>
          <p className="text-sm text-ink-3">
            {loading ? 'Loading…' : `${rows.length} products · tap a number to count, − to remove`}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search product, category, vendor…"
            className="w-full max-w-sm flex-1 rounded-lg border border-line-2 bg-surface px-3 py-2.5 outline-none focus:border-brand"
          />
          <Link
            href="/receiving/new"
            className="whitespace-nowrap rounded-lg bg-pine px-4 py-2.5 text-sm font-bold text-white active:scale-[0.98]"
          >
            + Receive delivery
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Next expiry</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.slice(0, 200).map((r) => {
              const isEditing = edit?.guid === r.toast_guid
              return (
                <tr key={r.toast_guid} className="hover:bg-cream">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/products/${r.toast_guid}`}
                      className="font-semibold hover:text-sea hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="text-[11px] text-ink-3">{r.category ?? ''}</div>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">{r.vendor_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <ExpiryBadge date={r.next_expiry} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.price_cents != null ? `$${(r.price_cents / 100).toFixed(2)}` : '—'}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-bold ${r.on_hand <= 0 ? 'text-coral' : 'text-ink'}`}
                  >
                    {isEditing ? (
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-ink-3">
                          {edit!.kind === 'count' ? 'counted' : 'remove'}
                        </span>
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          step="any"
                          value={val}
                          onChange={(e) => setVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') save(r)
                            if (e.key === 'Escape') setEdit(null)
                          }}
                          className="w-20 rounded-lg border border-brand bg-cream px-2 py-1.5 text-right font-bold outline-none"
                        />
                        <button
                          onClick={() => save(r)}
                          disabled={saving}
                          className="rounded-lg bg-pine px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEdit(null)}
                          className="rounded-lg bg-surface-3 px-2.5 py-1.5 text-xs font-bold text-ink-3"
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex flex-col items-end">
                        <button
                          onClick={() => {
                            setEdit({ guid: r.toast_guid, kind: 'count' })
                            setVal(String(r.on_hand))
                          }}
                          title="Count / adjust"
                          className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-brand-soft"
                        >
                          {r.on_hand}
                          <span className="text-xs text-ink-3 opacity-60 group-hover:opacity-100">✎</span>
                        </button>
                        {/* Trace storage vs piso — el desglose que pediste ver. */}
                        <span className="px-2 text-[11px] font-normal text-ink-3">
                          <span title="In storage (cooler)">🧊 {r.storage_on_hand}</span>
                          {' · '}
                          <span title="On the sales floor">🛒 {r.floor_on_hand}</span>
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right">
                    {!isEditing && (
                      <span className="inline-flex gap-1.5">
                        <Link
                          href={`/transfers?guid=${r.toast_guid}`}
                          title="Move between storage and floor (needs manager approval)"
                          className="rounded-lg bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand hover:bg-brand hover:text-white"
                        >
                          Move
                        </Link>
                        <button
                          onClick={() => {
                            setEdit({ guid: r.toast_guid, kind: 'remove' })
                            setVal('1')
                          }}
                          title="Waste / definitive removal (reduces total)"
                          className="rounded-lg bg-coral-soft px-2.5 py-1 text-xs font-bold text-coral hover:bg-coral hover:text-white"
                        >
                          −
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
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
