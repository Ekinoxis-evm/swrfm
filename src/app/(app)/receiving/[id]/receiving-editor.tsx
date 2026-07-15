'use client'

// Collaborative receiving editor.
// Row-level writes + Supabase Realtime: two devices can edit the same delivery
// simultaneously. Remote changes merge per line, and a focused input is never
// overwritten while someone is typing in it (active-input guard).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Product = { toast_guid: string; name: string; category: string | null }
type Line = {
  id: string
  toast_guid: string
  invoiced_qty: number
  received_qty: number
  unit: string
  note: string | null
  updated_by: string | null
  version: number
}

export default function ReceivingEditor({
  sessionId,
  sessionMeta,
  products,
  me,
}: {
  sessionId: string
  sessionMeta: {
    date: string
    invoiceNo: string | null
    status: string
    vendorName: string
    workflowType: string
  }
  products: Product[]
  me: { id: string; name: string; role: string }
}) {
  const router = useRouter()
  const supabase = createClient()
  const [lines, setLines] = useState<Line[]>([])
  const [picker, setPicker] = useState('')
  const [status, setStatus] = useState(sessionMeta.status)
  const [live, setLive] = useState(false)
  const [closing, setClosing] = useState(false)
  const focused = useRef<string | null>(null) // "lineId:field" currently being edited
  const productName = new Map(products.map((p) => [p.toast_guid, p.name]))

  const loadLines = useCallback(async () => {
    const { data } = await supabase
      .from('receiving_lines')
      .select('id, toast_guid, invoiced_qty, received_qty, unit, note, updated_by, version')
      .eq('session_id', sessionId)
      .order('id')
    if (data) setLines(data as Line[])
  }, [sessionId, supabase])

  useEffect(() => {
    loadLines()
    const channel = supabase
      .channel(`receiving-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receiving_lines',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string }
            setLines((prev) => prev.filter((l) => l.id !== old.id))
            return
          }
          const rec = payload.new as Line
          setLines((prev) => {
            const exists = prev.some((l) => l.id === rec.id)
            if (!exists) return [...prev, rec]
            return prev.map((l) => {
              if (l.id !== rec.id) return l
              // Active-input guard: keep the field the user is typing in.
              const merged = { ...rec }
              if (focused.current === `${l.id}:invoiced_qty`) merged.invoiced_qty = l.invoiced_qty
              if (focused.current === `${l.id}:received_qty`) merged.received_qty = l.received_qty
              if (focused.current === `${l.id}:note`) merged.note = l.note
              return merged
            })
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'receiving_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => setStatus((payload.new as { status: string }).status)
      )
      .subscribe((s) => setLive(s === 'SUBSCRIBED'))
    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, loadLines])

  async function addLine(toastGuid: string) {
    if (!toastGuid) return
    setPicker('')
    const { error } = await supabase.from('receiving_lines').insert({
      session_id: sessionId,
      toast_guid: toastGuid,
      unit: sessionMeta.workflowType === 'weight' ? 'lb' : 'unit',
      updated_by: me.id,
    })
    if (error && !error.message.includes('duplicate')) alert(error.message)
  }

  async function saveField(line: Line, field: 'invoiced_qty' | 'received_qty' | 'note', value: number | string | null) {
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, [field]: value } : l)))
    await supabase
      .from('receiving_lines')
      .update({
        [field]: value,
        updated_by: me.id,
        updated_at: new Date().toISOString(),
        version: line.version + 1,
      })
      .eq('id', line.id)
  }

  async function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id))
    await supabase.from('receiving_lines').delete().eq('id', id)
  }

  async function closeSession() {
    setClosing(true)
    // Post one inventory movement per received line, then close.
    const movements = lines
      .filter((l) => Number(l.received_qty) > 0)
      .map((l) => ({
        toast_guid: l.toast_guid,
        delta: Number(l.received_qty),
        reason: 'receiving' as const,
        ref_id: sessionId,
        created_by: me.id,
      }))
    if (movements.length) {
      const { error } = await supabase.from('inventory_movements').insert(movements)
      if (error) {
        alert(error.message)
        setClosing(false)
        return
      }
    }
    await supabase.from('receiving_sessions').update({ status: 'closed' }).eq('id', sessionId)
    setStatus('closed')
    setClosing(false)
    router.refresh()
  }

  const totInvoiced = lines.reduce((s, l) => s + Number(l.invoiced_qty), 0)
  const totReceived = lines.reduce((s, l) => s + Number(l.received_qty), 0)
  const discrepancies = lines.filter(
    (l) => Number(l.invoiced_qty) !== Number(l.received_qty)
  ).length
  const readonly = status === 'closed'
  const available = products.filter((p) => !lines.some((l) => l.toast_guid === p.toast_guid))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {sessionMeta.vendorName}{' '}
            <span className="text-sm font-normal text-ink-3">· {sessionMeta.date}</span>
          </h1>
          <p className="text-sm text-ink-3">
            {sessionMeta.invoiceNo ? `Invoice ${sessionMeta.invoiceNo} · ` : ''}
            <span className={live ? 'font-semibold text-pine' : 'text-coral'}>
              {live ? '● live sync on' : '○ connecting…'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              readonly ? 'bg-surface-3 text-ink-3' : 'bg-pine-soft text-pine'
            }`}
          >
            {status}
          </span>
          {!readonly && (
            <button
              onClick={closeSession}
              disabled={closing || !lines.length}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-cream active:scale-[0.98] disabled:opacity-40"
            >
              {closing ? 'Closing…' : 'Close & post to inventory'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: `Invoiced (${sessionMeta.workflowType === 'weight' ? 'lb' : 'units'})`, value: totInvoiced, tone: 'text-sea' },
          { label: 'Received', value: totReceived, tone: 'text-pine' },
          { label: 'Discrepancies', value: discrepancies, tone: discrepancies ? 'text-coral' : 'text-pine' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4 text-center">
            <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {!readonly && (
        <select
          value={picker}
          onChange={(e) => addLine(e.target.value)}
          className="w-full rounded-lg border border-line-2 bg-surface px-3 py-3 font-semibold"
        >
          <option value="">+ Add product to this delivery…</option>
          {available.map((p) => (
            <option key={p.toast_guid} value={p.toast_guid}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <div className="space-y-2">
        {lines.map((l) => {
          const diff = Number(l.received_qty) - Number(l.invoiced_qty)
          return (
            <div
              key={l.id}
              className={`rounded-2xl border bg-surface p-4 ${
                diff !== 0 && (l.invoiced_qty || l.received_qty)
                  ? 'border-coral'
                  : 'border-line'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="font-bold">{productName.get(l.toast_guid) ?? 'Product'}</div>
                <div className="flex items-center gap-2">
                  {diff !== 0 && (l.invoiced_qty || l.received_qty) ? (
                    <span className="rounded-full bg-coral-soft px-2.5 py-1 text-[11px] font-bold text-coral">
                      {diff > 0 ? '+' : ''}
                      {diff} {l.unit}
                    </span>
                  ) : Number(l.received_qty) > 0 ? (
                    <span className="rounded-full bg-pine-soft px-2.5 py-1 text-[11px] font-bold text-pine">
                      ✓ match
                    </span>
                  ) : null}
                  {!readonly && (
                    <button
                      onClick={() => removeLine(l.id)}
                      className="text-xs font-bold text-ink-3 hover:text-coral"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(['invoiced_qty', 'received_qty'] as const).map((field) => (
                  <div key={field}>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-3">
                      {field === 'invoiced_qty' ? 'Invoiced' : 'Received'} ({l.unit})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      disabled={readonly}
                      value={Number(l[field]) || ''}
                      placeholder="0"
                      onFocus={() => (focused.current = `${l.id}:${field}`)}
                      onBlur={() => (focused.current = null)}
                      onChange={(e) => saveField(l, field, Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-line-2 bg-cream px-3 py-3 text-lg font-bold outline-none focus:border-brand disabled:opacity-60"
                    />
                  </div>
                ))}
                <div className="col-span-2 sm:col-span-1">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-3">
                    Note
                  </label>
                  <input
                    disabled={readonly}
                    value={l.note ?? ''}
                    placeholder="—"
                    onFocus={() => (focused.current = `${l.id}:note`)}
                    onBlur={() => (focused.current = null)}
                    onChange={(e) => saveField(l, 'note', e.target.value || null)}
                    className="w-full rounded-lg border border-line-2 bg-cream px-3 py-3 outline-none focus:border-brand disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          )
        })}
        {!lines.length && (
          <p className="rounded-2xl border border-dashed border-line-2 p-8 text-center text-ink-3">
            No lines yet — add the first product above.
          </p>
        )}
      </div>
    </div>
  )
}
