'use client'

// End-of-day closing: staff enter what came back; the difference is what
// sold at the pop-up, posted to the inventory ledger as 'market_day'.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Item = {
  id: string
  toastGuid: string
  name: string
  qtyTaken: number
  qtyReturned: number | null
  unit: string
}

export default function CloseDayForm({
  dayId,
  status,
  items,
  meId,
}: {
  dayId: string
  status: string
  items: Item[]
  meId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [returned, setReturned] = useState<Map<string, number>>(
    new Map(items.map((i) => [i.id, i.qtyReturned ?? 0]))
  )
  const [busy, setBusy] = useState(false)
  const closed = status === 'closed'

  const totalTaken = items.reduce((s, i) => s + i.qtyTaken, 0)
  const totalReturned = items.reduce((s, i) => s + (returned.get(i.id) ?? 0), 0)
  const totalSold = totalTaken - totalReturned

  async function closeDay() {
    if (!confirm(`Close this market day? ${totalSold} units will be deducted from inventory.`))
      return
    setBusy(true)
    for (const item of items) {
      const ret = returned.get(item.id) ?? 0
      await supabase.from('market_day_items').update({ qty_returned: ret }).eq('id', item.id)
    }
    const movements = items
      .map((item) => ({
        toast_guid: item.toastGuid,
        delta: -(item.qtyTaken - (returned.get(item.id) ?? 0)),
        reason: 'market_day' as const,
        ref_id: dayId,
        created_by: meId,
      }))
      .filter((m) => m.delta !== 0)
    if (movements.length) {
      const { error } = await supabase.from('inventory_movements').insert(movements)
      if (error) {
        alert(error.message)
        setBusy(false)
        return
      }
    }
    await supabase
      .from('market_days')
      .update({ status: 'closed', closed_by: meId, closed_at: new Date().toISOString() })
      .eq('id', dayId)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Taken', value: totalTaken, tone: 'text-sea' },
          { label: 'Returned', value: totalReturned, tone: 'text-pine' },
          { label: closed ? 'Sold' : 'Sold (so far)', value: totalSold, tone: 'text-brand' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4 text-center">
            <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const ret = returned.get(item.id) ?? 0
          const sold = item.qtyTaken - ret
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{item.name}</div>
                <div className="text-xs text-ink-3">
                  took {item.qtyTaken} · sold {sold >= 0 ? sold : 0}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-right text-[11px] font-bold uppercase tracking-wide text-ink-3">
                  Came back
                </label>
                <input
                  type="number"
                  min={0}
                  max={item.qtyTaken}
                  step="any"
                  disabled={closed}
                  value={ret || ''}
                  placeholder="0"
                  onChange={(e) =>
                    setReturned((prev) =>
                      new Map(prev).set(item.id, Math.min(Number(e.target.value) || 0, item.qtyTaken))
                    )
                  }
                  className="w-28 rounded-lg border border-line-2 bg-cream px-3 py-3 text-right text-lg font-bold outline-none focus:border-brand disabled:opacity-60"
                />
              </div>
            </div>
          )
        })}
      </div>

      {!closed && (
        <button
          onClick={closeDay}
          disabled={busy}
          className="w-full rounded-lg bg-ink py-3.5 font-bold text-cream active:scale-[0.99] disabled:opacity-40"
        >
          {busy ? 'Closing…' : `Close day — deduct ${totalSold} sold from inventory`}
        </button>
      )}
      {closed && (
        <p className="rounded-2xl border border-line bg-surface-2 p-4 text-center text-sm font-semibold text-ink-2">
          ✓ Day closed — sales are posted in the inventory ledger.
        </p>
      )}
    </div>
  )
}
