'use client'

// Transferencias de stock storage ↔ piso — el "removal" reimaginado como traslado interno.
// El empleado arma la solicitud en un wizard de 3 pasos (Sentido → Producto → Cantidad) y
// queda PENDIENTE; el admin la aprueba o rechaza en la cola. Recién al aprobar se mueve el
// saldo (−origen, +destino) y el total NO cambia. Tiempo real entre dispositivos.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WizardSteps, WizardNav } from '@/components/wizard'
import DataTable, { type Column } from '@/components/data-table'
import { StatusPill } from '@/components/thermal'

const STATUS_TONE = { pending: 'warn', approved: 'ok', rejected: 'crit' } as const

export type TransferProduct = {
  toast_guid: string
  name: string
  vendor_name: string | null
  storage: number
  floor: number
}

type Direction = 'to_floor' | 'to_storage'

export type TransferRow = {
  id: string
  item_name: string
  qty: number
  direction: Direction
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  reject_reason: string | null
  requested_at: string
  local_date: string
  requester: { full_name: string } | null
  decider: { full_name: string } | null
}

const SELECT =
  'id, item_name, qty, direction, status, note, reject_reason, requested_at, local_date, ' +
  'requester:profiles!stock_transfers_requested_by_fkey(full_name), ' +
  'decider:profiles!stock_transfers_decided_by_fkey(full_name)'

const DIR_LABEL: Record<Direction, string> = {
  to_floor: 'Storage → Floor',
  to_storage: 'Floor → Storage',
}

function sourceQty(p: TransferProduct, dir: Direction) {
  return dir === 'to_floor' ? p.storage : p.floor
}

export default function Transfers({
  products,
  initialRows,
  day,
  isManager,
}: {
  products: TransferProduct[]
  initialRows: TransferRow[]
  day: string
  isManager: boolean
}) {
  const [rows, setRows] = useState<TransferRow[]>(initialRows)
  const [levels, setLevels] = useState(products)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Llegando desde el botón "Move" del inventario: abre el wizard con el producto ya elegido.
  const prefill = useSearchParams().get('guid')
  const prefillGuid = prefill && products.some((p) => p.toast_guid === prefill) ? prefill : ''

  // --- Wizard ---
  const [open, setOpen] = useState(() => Boolean(prefillGuid))
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<Direction>('to_floor')
  const [guid, setGuid] = useState(prefillGuid)
  const [q, setQ] = useState('')
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: t }, { data: lv }] = await Promise.all([
      supabase
        .from('stock_transfers')
        .select(SELECT)
        .or(`status.eq.pending,local_date.eq.${day}`)
        .order('requested_at', { ascending: false }),
      supabase.from('inventory_levels').select('toast_guid, storage_on_hand, floor_on_hand'),
    ])
    if (t) setRows(t as unknown as TransferRow[])
    if (lv) {
      const m = new Map(lv.map((l) => [l.toast_guid, l]))
      setLevels((prev) =>
        prev.map((p) => {
          const row = m.get(p.toast_guid)
          return row
            ? { ...p, storage: Number(row.storage_on_hand), floor: Number(row.floor_on_hand) }
            : p
        })
      )
    }
  }, [day])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('stock-transfers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transfers' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_levels' }, () => load())
      .subscribe()
    const poll = setInterval(load, 60_000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [load])

  const selected = useMemo(() => levels.find((p) => p.toast_guid === guid) ?? null, [levels, guid])
  const maxQty = selected ? sourceQty(selected, dir) : 0

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    // En cada sentido solo tiene sentido mover lo que hay en el origen.
    const withStock = levels.filter((p) => sourceQty(p, dir) > 0)
    return t ? withStock.filter((p) => p.name.toLowerCase().includes(t)) : withStock
  }, [levels, q, dir])

  const pending = rows.filter((r) => r.status === 'pending')

  function resetWizard() {
    setOpen(false)
    setStep(0)
    setDir('to_floor')
    setGuid('')
    setQ('')
    setQty(1)
    setNote('')
  }

  async function run(fn: () => Promise<{ error: { message: string } | null }>, ok?: string) {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    if (error) setError(error.message)
    else {
      await load()
      if (ok) {
        setFlash(ok)
        setTimeout(() => setFlash(null), 3500)
      }
    }
    setBusy(false)
    return !error
  }

  async function submit() {
    const okDone = await run(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc('request_transfer', {
        p_toast_guid: guid,
        p_qty: qty,
        p_direction: dir,
        p_note: note.trim() || null,
      })
      return { error }
    }, 'Transfer requested — waiting for a manager to approve.')
    if (okDone) resetWizard()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Stock transfers</h1>
          <p className="text-sm text-ink-3">
            Move stock between storage and the floor. {pending.length} pending ·{' '}
            {rows.length - pending.length} decided today.
          </p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-brand px-5 py-2.5 font-bold text-white active:scale-[0.98]"
          >
            + New transfer
          </button>
        )}
      </div>

      {flash && (
        <p className="rounded-lg border border-pine bg-pine-soft px-4 py-2.5 text-sm font-semibold text-pine">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-coral bg-coral-soft px-4 py-2.5 text-sm font-semibold text-coral">
          {error}
        </p>
      )}

      {open && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">New transfer</h2>
            <button
              onClick={resetWizard}
              className="rounded-lg bg-surface-3 px-2.5 py-1 text-xs font-bold text-ink-3"
            >
              ✕ Cancel
            </button>
          </div>

          <WizardSteps steps={['Direction', 'Product', 'Amount']} current={step} />

          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['to_floor', 'to_storage'] as Direction[]).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDir(d)
                    // Si venías con un producto preseleccionado y tiene stock en ese origen,
                    // salta directo a la cantidad; si no, elige producto.
                    const pre = levels.find((p) => p.toast_guid === guid)
                    if (pre && sourceQty(pre, d) > 0) {
                      setQty(1)
                      setStep(2)
                    } else {
                      setGuid('')
                      setStep(1)
                    }
                  }}
                  className={`rounded-xl border-2 p-5 text-left transition ${
                    dir === d ? 'border-brand bg-brand-soft' : 'border-line-2 hover:bg-surface-2'
                  }`}
                >
                  <div className="text-lg font-bold">{DIR_LABEL[d]}</div>
                  <div className="mt-1 text-sm text-ink-3">
                    {d === 'to_floor'
                      ? 'Take stock out to the sales floor.'
                      : 'Bring stock back into the cooler.'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
                placeholder="Search product…"
                className="mb-3 w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
              />
              <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line-2">
                {matches.slice(0, 100).map((p) => (
                  <button
                    key={p.toast_guid}
                    onClick={() => {
                      setGuid(p.toast_guid)
                      setQty(1)
                      setStep(2)
                    }}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-cream"
                  >
                    <span>
                      <span className="font-semibold">{p.name}</span>
                      <span className="block text-[11px] text-ink-3">{p.vendor_name ?? ''}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-ink-3">
                      {sourceQty(p, dir)} in {dir === 'to_floor' ? 'storage' : 'floor'}
                    </span>
                  </button>
                ))}
                {!matches.length && (
                  <p className="px-3 py-6 text-center text-sm text-ink-3">
                    Nothing with stock in {dir === 'to_floor' ? 'storage' : 'the floor'}.
                  </p>
                )}
              </div>
              <WizardNav onBack={() => setStep(0)} onNext={() => setStep(1)} nextLabel="Pick a product" nextDisabled />
            </div>
          )}

          {step === 2 && selected && (
            <div>
              <div className="rounded-xl border border-line-2 bg-cream p-4">
                <div className="text-lg font-bold">{selected.name}</div>
                <div className="mt-1 text-sm text-ink-3">
                  {DIR_LABEL[dir]} · {maxQty} available in{' '}
                  {dir === 'to_floor' ? 'storage' : 'the floor'}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => setQty((n) => Math.max(1, n - 1))}
                    className="rounded-lg bg-surface-3 px-4 py-3 text-lg font-bold text-ink-2"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxQty}
                    value={qty}
                    onChange={(e) =>
                      setQty(Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className="w-24 rounded-lg border border-line-2 bg-surface px-2 py-3 text-center text-lg font-bold"
                  />
                  <button
                    onClick={() => setQty((n) => Math.min(maxQty, n + 1))}
                    className="rounded-lg bg-surface-3 px-4 py-3 text-lg font-bold text-ink-2"
                  >
                    +
                  </button>
                  <span className="ml-1 text-sm text-ink-3">of {maxQty}</span>
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="mt-4 w-full rounded-lg border border-line-2 bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
                />
              </div>
              <WizardNav
                onBack={() => setStep(1)}
                onNext={submit}
                nextLabel="Request transfer"
                nextDisabled={qty < 1 || qty > maxQty}
                busy={busy}
              />
            </div>
          )}
        </section>
      )}

      <DataTable
        rows={rows}
        getKey={(r) => r.id}
        searchText={(r) => `${r.item_name} ${r.requester?.full_name ?? ''}`}
        searchPlaceholder="Search item or requester…"
        initialSort={{ key: 'time', dir: 'desc' }}
        emptyText="No transfers yet today."
        columns={transferColumns(isManager, busy, run)}
      />
    </div>
  )
}

function transferColumns(
  isManager: boolean,
  busy: boolean,
  run: (fn: () => Promise<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>
): Column<TransferRow>[] {
  const cols: Column<TransferRow>[] = [
    {
      key: 'time',
      header: 'Time',
      sortValue: (r) => r.requested_at,
      render: (r) => (
        <span className="tnum text-ink-3">
          {new Date(r.requested_at).toLocaleTimeString('en-US', {
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
        <>
          <span className="font-semibold">{r.item_name}</span>
          {r.note && <span className="block text-[11px] text-ink-3">{r.note}</span>}
          {r.status === 'rejected' && r.reject_reason && (
            <span className="block text-[11px] text-crit">✕ {r.reject_reason}</span>
          )}
        </>
      ),
    },
    {
      key: 'direction',
      header: 'Direction',
      sortValue: (r) => r.direction,
      render: (r) => (
        <span className={r.direction === 'to_floor' ? 'text-warm' : 'text-cold'}>
          {DIR_LABEL[r.direction]}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      align: 'right',
      sortValue: (r) => Number(r.qty),
      render: (r) => <span className="font-bold">{Number(r.qty)}</span>,
    },
    {
      key: 'by',
      header: 'Requested by',
      sortValue: (r) => (r.requester?.full_name ?? '').toLowerCase(),
      render: (r) => <span className="text-ink-3">{r.requester?.full_name ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusPill tone={STATUS_TONE[r.status]}>{r.status}</StatusPill>
          {r.status !== 'pending' && r.decider && (
            <span className="text-[11px] text-ink-3">{r.decider.full_name}</span>
          )}
        </span>
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
        r.status === 'pending' ? (
          <span className="flex justify-end gap-1.5">
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const supabase = createClient()
                  const { error } = await supabase.rpc('approve_transfer', { p_id: r.id })
                  return { error }
                }, 'Transfer approved — stock moved.')
              }
              className="rounded-lg bg-ok px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
            >
              Approve
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const reason = window.prompt('Reason for rejecting? (optional)')
                if (reason === null) return
                run(async () => {
                  const supabase = createClient()
                  const { error } = await supabase.rpc('reject_transfer', {
                    p_id: r.id,
                    p_reason: reason || null,
                  })
                  return { error }
                }, 'Transfer rejected.')
              }}
              className="rounded-lg bg-crit-soft px-3 py-1 text-xs font-bold text-crit disabled:opacity-40"
            >
              Reject
            </button>
          </span>
        ) : null,
    })
  }

  return cols
}
