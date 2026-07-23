'use client'

// Inventario maestro — piloto del sistema bi-thermal. Cada producto muestra su lectura
// fría (almacén) y cálida (piso) en columnas propias, ordenables y filtrables. Acciones:
// Move (traslado a piso, con aprobación), conteo físico (inline, un solo número) y merma.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import DataTable, { type Column } from '@/components/data-table'
import { StatusPill } from '@/components/thermal'

type Row = {
  toast_guid: string
  name: string
  category: string | null
  vendor_name: string | null
  price_cents: number | null
  cooler_relevant: boolean
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

// El estado operativo de una fila, encodeado como chip — lo que necesita atención se lee de un vistazo.
function status(r: Row): { tone: 'ok' | 'warn' | 'crit'; label: string } {
  const d = daysUntil(r.next_expiry)
  if (r.on_hand <= 0) return { tone: 'crit', label: 'Out' }
  if (d != null && d <= 3) return { tone: 'warn', label: d <= 0 ? 'Expired' : `${d}d left` }
  if (r.storage_on_hand <= 0 && r.floor_on_hand > 0) return { tone: 'warn', label: 'Storage empty' }
  return { tone: 'ok', label: 'In stock' }
}

export default function InventoryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<EditMode>(null)
  const [val, setVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [coolerOnly, setCoolerOnly] = useState(false)
  const [needsAttn, setNeedsAttn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const [{ data: products }, { data: levels }, { data: expiry }] = await Promise.all([
        supabase
          .from('products')
          .select('toast_guid, name, category, vendor_name, price_cents, cooler_relevant')
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

  const visible = useMemo(() => {
    let out = rows
    if (coolerOnly) out = out.filter((r) => r.cooler_relevant)
    if (needsAttn) out = out.filter((r) => status(r).tone !== 'ok')
    return out
  }, [rows, coolerOnly, needsAttn])

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
      }
    } else if (n > 0) {
      // Merma / retiro definitivo: baja del total. La RPC escribe retiro + movimiento juntos.
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
    }
    setEdit(null)
    setSaving(false)
  }

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Product',
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <>
          <Link
            href={`/products/${r.toast_guid}`}
            className="font-semibold hover:text-sea hover:underline"
          >
            {r.name}
          </Link>
          {r.category && <div className="text-[11px] text-ink-3">{r.category}</div>}
        </>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      sortValue: (r) => (r.vendor_name ?? '').toLowerCase(),
      render: (r) => <span className="text-ink-3">{r.vendor_name ?? '—'}</span>,
    },
    {
      key: 'storage',
      header: 'Storage',
      align: 'right',
      sortValue: (r) => r.storage_on_hand,
      render: (r) => <span className="font-semibold text-cold">{r.storage_on_hand}</span>,
    },
    {
      key: 'floor',
      header: 'Floor',
      align: 'right',
      sortValue: (r) => r.floor_on_hand,
      render: (r) => <span className="font-semibold text-warm">{r.floor_on_hand}</span>,
    },
    {
      key: 'on_hand',
      header: 'On hand',
      align: 'right',
      sortValue: (r) => r.on_hand,
      render: (r) => {
        const editing = edit?.guid === r.toast_guid && edit.kind === 'count'
        if (editing) {
          return (
            <span className="flex items-center justify-end gap-1.5">
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
                className="tnum w-20 rounded-lg border border-brand bg-surface-2 px-2 py-1.5 text-right font-bold outline-none"
              />
              <button
                onClick={() => save(r)}
                disabled={saving}
                className="rounded-lg bg-cold px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
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
          )
        }
        return (
          <button
            onClick={() => {
              setEdit({ guid: r.toast_guid, kind: 'count' })
              setVal(String(r.on_hand))
            }}
            title="Count / adjust"
            className={`group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-bold hover:bg-cold-soft ${
              r.on_hand <= 0 ? 'text-crit' : 'text-ink'
            }`}
          >
            {r.on_hand}
            <span className="text-xs text-ink-3 opacity-0 group-hover:opacity-100">✎</span>
          </button>
        )
      },
    },
    {
      key: 'expiry',
      header: 'Next expiry',
      sortValue: (r) => r.next_expiry ?? '9999',
      render: (r) => {
        const d = daysUntil(r.next_expiry)
        if (!r.next_expiry) return <span className="text-ink-3">—</span>
        return (
          <span className={`tnum text-xs ${d != null && d <= 3 ? 'font-bold text-warn' : 'text-ink-2'}`}>
            {r.next_expiry}
            {d != null && <span className="text-ink-3"> · {d}d</span>}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => status(r).label,
      render: (r) => {
        const s = status(r)
        return <StatusPill tone={s.tone}>{s.label}</StatusPill>
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '1%',
      render: (r) => {
        const removing = edit?.guid === r.toast_guid && edit.kind === 'remove'
        if (removing) {
          return (
            <span className="flex items-center justify-end gap-1.5">
              <input
                autoFocus
                type="number"
                min={1}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save(r)
                  if (e.key === 'Escape') setEdit(null)
                }}
                className="tnum w-16 rounded-lg border border-crit bg-surface-2 px-2 py-1.5 text-right font-bold outline-none"
              />
              <button
                onClick={() => save(r)}
                disabled={saving}
                className="rounded-lg bg-crit px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                Waste
              </button>
              <button
                onClick={() => setEdit(null)}
                className="rounded-lg bg-surface-3 px-2.5 py-1.5 text-xs font-bold text-ink-3"
              >
                ✕
              </button>
            </span>
          )
        }
        return (
          <span className="flex justify-end gap-1.5">
            <Link
              href={`/transfers?guid=${r.toast_guid}`}
              title="Move between storage and floor (needs manager approval)"
              className="rounded-lg bg-cold-soft px-2.5 py-1 text-xs font-bold text-cold hover:bg-cold hover:text-white"
            >
              Move ⇄
            </Link>
            <button
              onClick={() => {
                setEdit({ guid: r.toast_guid, kind: 'remove' })
                setVal('1')
              }}
              title="Waste / definitive removal (reduces total)"
              className="rounded-lg bg-crit-soft px-2 py-1 text-xs font-bold text-crit hover:bg-crit hover:text-white"
            >
              −
            </button>
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Master inventory</h1>
          <p className="text-sm text-ink-3">
            {loading
              ? 'Loading…'
              : `${rows.length} products · ${visible.length} shown · cold = storage, warm = floor`}
          </p>
        </div>
        <Link
          href="/receiving/new"
          className="whitespace-nowrap rounded-lg bg-cold px-4 py-2.5 text-sm font-bold text-white active:scale-[0.98]"
        >
          + Receive delivery
        </Link>
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        getKey={(r) => r.toast_guid}
        searchText={(r) => `${r.name} ${r.category ?? ''} ${r.vendor_name ?? ''}`}
        searchPlaceholder="Search product, category, vendor…"
        initialSort={{ key: 'name', dir: 'asc' }}
        limit={200}
        emptyText={loading ? 'Loading inventory…' : 'No products match these filters.'}
        toolbar={
          <>
            <FilterPill on={coolerOnly} onClick={() => setCoolerOnly((v) => !v)}>
              Cooler only
            </FilterPill>
            <FilterPill on={needsAttn} onClick={() => setNeedsAttn((v) => !v)}>
              Needs attention
            </FilterPill>
          </>
        }
      />
    </div>
  )
}

function FilterPill({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
        on
          ? 'border-cold bg-cold-soft text-cold'
          : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}
