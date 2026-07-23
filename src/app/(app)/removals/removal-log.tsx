'use client'

// Removal log — puerto del `removal.html` de Ruben (swarm_buildapp/docs/removal handoff/).
// Preserva lo que el equipo ya domina: pestañas por proveedor, cantidad en cajas o
// unidades, y la firma del manager al cierre del día. Lo que cambia respecto al legado:
// las cuentas reales sustituyen a los PINs, el ledger de Supabase sustituye al blob
// JSON, y editar o anular un retiro devuelve el stock con un movimiento compensatorio.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { REMOVAL_SELECT } from '@/lib/market-day'
import DataTable, { type Column } from '@/components/data-table'
import { StatusPill } from '@/components/thermal'

export type CoolerProduct = {
  toast_guid: string
  name: string
  vendor_name: string | null
  units_per_case: number | null
  cases_on_hand: number
  units_on_hand: number
}

export type RemovalRow = {
  id: string
  item_name: string
  vendor_name: string | null
  qty: number
  remove_by: 'case' | 'unit'
  weight_lb: number
  note: string | null
  created_at: string
  signed_at: string | null
  edited_at: string | null
  voided_at: string | null
  void_reason: string | null
  removed: { full_name: string } | null
  signer: { full_name: string } | null
}

// Los 4 proveedores del cooler del handoff (§5). El resto del catálogo marcado como
// cooler cae en "Other" para no perder nada de vista.
const COOLER_VENDORS = [
  'Florida Fresh Meat',
  'US Wellness Meats',
  'Lake Meadow Naturals LLC',
  'Pennsylvania Farms',
] as const

const OTHER = 'Other'

export default function RemovalLog({
  products,
  initialRows,
  day,
  isManager,
}: {
  products: CoolerProduct[]
  initialRows: RemovalRow[]
  day: string
  isManager: boolean
}) {
  const [vendor, setVendor] = useState<string>(COOLER_VENDORS[0])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState('')
  const [qty, setQty] = useState(1)
  const [mode, setMode] = useState<'case' | 'unit'>('case')
  const [weight, setWeight] = useState('')
  const [rows, setRows] = useState<RemovalRow[]>(initialRows)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(1)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('removals')
      .select(REMOVAL_SELECT)
      .eq('local_date', day)
      .order('created_at', { ascending: false })
    setRows((data ?? []) as unknown as RemovalRow[])
  }, [day])

  useEffect(() => {
    // Tiempo real entre iPads — reemplaza el WebSocket `/ws` del server.js legado.
    const supabase = createClient()
    const channel = supabase
      .channel('removal-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'removals' }, () => load())
      .subscribe()
    const poll = setInterval(load, 60_000) // red de seguridad, igual que el legado
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [load])

  const byVendor = useMemo(() => {
    const known = new Set<string>(COOLER_VENDORS)
    return products.filter((p) =>
      vendor === OTHER ? !known.has(p.vendor_name ?? '') : p.vendor_name === vendor
    )
  }, [products, vendor])

  const options = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? byVendor.filter((p) => p.name.toLowerCase().includes(t)) : byVendor
  }, [byVendor, q])

  // El producto activo se deriva: si el elegido ya no está en la lista visible (cambió
  // el proveedor o el filtro), cae al primero — sin efecto ni estado extra.
  const guid = options.some((p) => p.toast_guid === picked)
    ? picked
    : (options[0]?.toast_guid ?? '')

  const selected = useMemo(
    () => products.find((p) => p.toast_guid === guid) ?? null,
    [products, guid]
  )

  const live = rows.filter((r) => !r.voided_at)
  const unsigned = live.filter((r) => !r.signed_at).length

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    if (error) setError(error.message)
    else await load()
    setBusy(false)
  }

  async function logRemoval() {
    if (!guid) return
    await run(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc('log_removal', {
        p_toast_guid: guid,
        p_qty: qty,
        p_remove_by: mode,
        p_weight_lb: Number(weight) || 0,
        p_note: null,
      })
      if (!error) {
        setQty(1)
        setWeight('')
      }
      return { error }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Removal log</h1>
          <p className="text-sm text-ink-3">
            {day} · {live.length} removals ·{' '}
            <span className={unsigned ? 'font-bold text-coral' : 'text-pine'}>
              {unsigned ? `${unsigned} unsigned` : 'all signed ✓'}
            </span>
          </p>
        </div>
        {isManager && unsigned > 0 && (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const supabase = createClient()
                const { error } = await supabase.rpc('sign_all_removals', { p_date: day })
                return { error }
              })
            }
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-cream disabled:opacity-40"
          >
            Sign all {unsigned}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-coral bg-coral-soft px-4 py-2.5 text-sm font-semibold text-coral">
          {error}
        </p>
      )}

      {/* Pestañas por proveedor: el legado abría siempre eligiendo proveedor primero. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-1.5">
        {[...COOLER_VENDORS, OTHER].map((v) => (
          <button
            key={v}
            onClick={() => setVendor(v)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              vendor === v ? 'bg-ink text-cream' : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Product
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className="mb-2 w-full rounded-lg border border-line-2 bg-cream px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select
            value={guid}
            onChange={(e) => setPicked(e.target.value)}
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          >
            {options.map((p) => (
              <option key={p.toast_guid} value={p.toast_guid}>
                {p.name}
              </option>
            ))}
            {!options.length && <option value="">No products for this vendor</option>}
          </select>
          {selected && (
            <p className="mt-1.5 text-xs text-ink-3">
              On hand: <b>{selected.cases_on_hand}</b> cases · <b>{selected.units_on_hand}</b> units
              {selected.units_per_case ? ` · ${selected.units_per_case}/case` : ' · units only'}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Qty
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              className="rounded-lg bg-surface-3 px-3 py-2.5 font-bold text-ink-2"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-line-2 bg-cream px-2 py-2.5 text-center font-bold"
            />
            <button
              onClick={() => setQty((n) => n + 1)}
              className="rounded-lg bg-surface-3 px-3 py-2.5 font-bold text-ink-2"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Removed by
          </label>
          <div className="flex rounded-lg border border-line-2 p-0.5">
            {(['case', 'unit'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={m === 'case' && !selected?.units_per_case}
                title={
                  m === 'case' && !selected?.units_per_case
                    ? 'This product has no units per case configured'
                    : undefined
                }
                className={`flex-1 rounded-md py-2 text-sm font-bold capitalize transition disabled:opacity-30 ${
                  mode === m ? 'bg-ink text-cream' : 'text-ink-2'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Weight (lb)
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          />
        </div>

        <div className="flex items-end sm:col-span-6">
          <button
            onClick={logRemoval}
            disabled={busy || !guid}
            className="w-full rounded-lg bg-coral px-4 py-3 font-bold text-white active:scale-[0.98] disabled:opacity-40 sm:w-auto sm:px-10"
          >
            Log removal
          </button>
        </div>
      </div>

      <DataTable
        rows={rows}
        getKey={(r) => r.id}
        searchText={(r) => `${r.item_name} ${r.vendor_name ?? ''} ${r.removed?.full_name ?? ''}`}
        searchPlaceholder="Search item, vendor, or person…"
        initialSort={{ key: 'time', dir: 'desc' }}
        emptyText="No removals today."
        columns={removalColumns({
          isManager,
          busy,
          run,
          editing,
          editQty,
          setEditing,
          setEditQty,
        })}
      />
    </div>
  )
}

function removalColumns({
  isManager,
  busy,
  run,
  editing,
  editQty,
  setEditing,
  setEditQty,
}: {
  isManager: boolean
  busy: boolean
  run: (fn: () => Promise<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>
  editing: string | null
  editQty: number
  setEditing: (id: string | null) => void
  setEditQty: (n: number) => void
}): Column<RemovalRow>[] {
  const cols: Column<RemovalRow>[] = [
    {
      key: 'time',
      header: 'Time',
      sortValue: (r) => r.created_at,
      render: (r) => (
        <span className="tnum text-ink-3">
          {new Date(r.created_at).toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'item',
      header: 'Item',
      sortValue: (r) => r.item_name.toLowerCase(),
      render: (r) => (
        <span className={r.voided_at ? 'text-ink-3 line-through' : 'font-semibold'}>
          {r.item_name}
          {r.edited_at && (
            <span className="ml-1.5 text-[10px] font-bold uppercase text-ink-3 no-underline">edited</span>
          )}
        </span>
      ),
    },
    {
      key: 'vendor',
      header: 'Vendor',
      sortValue: (r) => (r.vendor_name ?? '').toLowerCase(),
      render: (r) => <span className="text-ink-3">{r.vendor_name ?? '—'}</span>,
    },
    {
      key: 'qty',
      header: 'Qty',
      align: 'right',
      sortValue: (r) => Number(r.qty),
      render: (r) =>
        editing === r.id ? (
          <span className="flex items-center justify-end gap-1">
            <input
              autoFocus
              type="number"
              min={1}
              value={editQty}
              onChange={(e) => setEditQty(Math.max(1, Number(e.target.value) || 1))}
              className="tnum w-16 rounded-lg border border-cold bg-surface-2 px-2 py-1 text-right font-bold outline-none"
            />
            <button
              disabled={busy}
              onClick={async () => {
                await run(async () => {
                  const supabase = createClient()
                  const { error } = await supabase.rpc('update_removal', { p_id: r.id, p_qty: editQty })
                  return { error }
                })
                setEditing(null)
              }}
              className="rounded-lg bg-cold px-2 py-1 text-xs font-bold text-white"
            >
              ✓
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-lg bg-surface-3 px-2 py-1 text-xs font-bold text-ink-3"
            >
              ✕
            </button>
          </span>
        ) : (
          <span className={r.voided_at ? 'text-ink-3 line-through' : ''}>
            <b>{Number(r.qty)}</b> <span className="text-[11px] text-ink-3">{r.remove_by}</span>
          </span>
        ),
    },
    {
      key: 'weight',
      header: 'Weight',
      align: 'right',
      sortValue: (r) => Number(r.weight_lb),
      render: (r) =>
        Number(r.weight_lb) > 0 ? (
          <span>{Number(r.weight_lb).toFixed(1)} lb</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: 'by',
      header: 'By',
      sortValue: (r) => (r.removed?.full_name ?? '').toLowerCase(),
      render: (r) => <span className="text-ink-3">{r.removed?.full_name ?? '—'}</span>,
    },
    {
      key: 'signoff',
      header: 'Sign-off',
      sortValue: (r) => (r.voided_at ? 'z' : r.signed_at ? 'a' : 'm'),
      render: (r) =>
        r.voided_at ? (
          <StatusPill tone="neutral">voided{r.void_reason ? ` · ${r.void_reason}` : ''}</StatusPill>
        ) : r.signed_at ? (
          <StatusPill tone="ok">✓ {r.signer?.full_name ?? 'signed'}</StatusPill>
        ) : isManager ? (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const supabase = createClient()
                const { error } = await supabase.rpc('sign_removal', { p_id: r.id })
                return { error }
              })
            }
            className="rounded-lg bg-cold-soft px-3 py-1 text-xs font-bold text-cold disabled:opacity-40"
          >
            Sign
          </button>
        ) : (
          <StatusPill tone="warn">unsigned</StatusPill>
        ),
    },
  ]

  if (isManager) {
    cols.push({
      key: 'actions',
      header: '',
      align: 'right',
      width: '1%',
      render: (r) =>
        !r.voided_at && editing !== r.id ? (
          <span className="flex justify-end gap-1">
            <button
              onClick={() => {
                setEditing(r.id)
                setEditQty(Number(r.qty))
              }}
              title="Edit quantity (the ledger is corrected)"
              className="rounded-lg px-2 py-1 text-xs font-bold text-ink-3 hover:bg-surface-2"
            >
              ✎
            </button>
            <button
              onClick={() => {
                const reason = window.prompt('Reason for voiding this removal?')
                if (reason === null) return
                run(async () => {
                  const supabase = createClient()
                  const { error } = await supabase.rpc('void_removal', { p_id: r.id, p_reason: reason || null })
                  return { error }
                })
              }}
              title="Void (stock is returned)"
              className="rounded-lg px-2 py-1 text-xs font-bold text-crit hover:bg-crit-soft"
            >
              ✕
            </button>
          </span>
        ) : null,
    })
  }

  return cols
}
