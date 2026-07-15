'use client'

// Plan a market day in four steps:
//   1. When & where   2. Staff   3. Products & quantities to take   4. Review

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WizardSteps, WizardNav } from '@/components/wizard'

type Staff = { id: string; full_name: string; role: string }
type Product = { toast_guid: string; name: string; category: string | null }

export default function MarketDayWizard({
  meId,
  staff,
  products,
  onHand,
}: {
  meId: string
  staff: Staff[]
  products: Product[]
  onHand: Record<string, number>
}) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('15:00')
  const [location, setLocation] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [items, setItems] = useState<Map<string, number>>(new Map())
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return products.slice(0, 25)
    return products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 25)
  }, [products, q])

  const productName = useMemo(() => new Map(products.map((p) => [p.toast_guid, p.name])), [products])

  function toggleStaff(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setQty(guid: string, qty: number) {
    setItems((prev) => {
      const next = new Map(prev)
      if (qty > 0) next.set(guid, qty)
      else next.delete(guid)
      return next
    })
  }

  async function create() {
    setBusy(true)
    const { data: day, error } = await supabase
      .from('market_days')
      .insert({
        title,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        location,
        created_by: meId,
      })
      .select('id')
      .single()
    if (error) {
      alert(error.message)
      setBusy(false)
      return
    }
    if (picked.size) {
      await supabase
        .from('market_day_staff')
        .insert([...picked].map((profile_id) => ({ market_day_id: day.id, profile_id })))
    }
    if (items.size) {
      await supabase.from('market_day_items').insert(
        [...items.entries()].map(([toast_guid, qty_taken]) => ({
          market_day_id: day.id,
          toast_guid,
          qty_taken,
        }))
      )
    }
    router.push(`/market-days/${day.id}`)
  }

  const input =
    'w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand'
  const label = 'mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3'

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Plan a market day</h1>
      <p className="mb-6 text-sm text-ink-3">
        A pop-up sale in another city — what goes on the truck, who runs it.
      </p>
      <WizardSteps steps={['When & where', 'Staff', 'Products', 'Review']} current={step} />

      {step === 0 && (
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <div>
            <label className={label}>Name</label>
            <input
              className={input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Flamingo Point Market"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Date</label>
              <input
                type="date"
                className={input}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>From</label>
              <input
                type="time"
                className={input}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>To</label>
              <input
                type="time"
                className={input}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={label}>Location</label>
            <input
              className={input}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, venue, address…"
            />
          </div>
          <WizardNav onNext={() => setStep(1)} nextDisabled={!title || !date || !location} />
        </div>
      )}

      {step === 1 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="mb-3 text-sm font-semibold">Who works this market day?</p>
          <div className="space-y-2">
            {staff.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${
                  picked.has(s.id) ? 'border-brand bg-brand-soft' : 'border-line bg-cream'
                }`}
              >
                <input
                  type="checkbox"
                  checked={picked.has(s.id)}
                  onChange={() => toggleStaff(s.id)}
                />
                <span className="text-sm font-semibold">{s.full_name}</span>
                <span className="ml-auto text-[11px] font-bold uppercase text-ink-3">{s.role}</span>
              </label>
            ))}
          </div>
          <WizardNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!picked.size} />
        </div>
      )}

      {step === 2 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="mb-3 text-sm font-semibold">
            What goes on the truck? ({items.size} selected)
          </p>
          <input
            className={`${input} mb-3`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
          />
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {filtered.map((p) => (
              <div
                key={p.toast_guid}
                className="flex items-center gap-3 rounded-lg border border-line bg-cream px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="text-[11px] text-ink-3">
                    on hand: {onHand[p.toast_guid] ?? 0}
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={items.get(p.toast_guid) || ''}
                  onChange={(e) => setQty(p.toast_guid, Number(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-line-2 bg-surface px-2 py-2 text-right font-bold"
                />
              </div>
            ))}
          </div>
          <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!items.size} />
        </div>
      )}

      {step === 3 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold">{title}</h2>
          <p className="text-sm text-ink-2">
            📅 {date} · {startTime}–{endTime}
          </p>
          <p className="mb-3 text-sm text-ink-2">📍 {location}</p>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">Staff</p>
          <p className="mb-3 text-sm">
            {staff
              .filter((s) => picked.has(s.id))
              .map((s) => s.full_name)
              .join(', ')}
          </p>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">
            Products ({items.size})
          </p>
          <ul className="mb-2 max-h-60 space-y-1 overflow-y-auto text-sm">
            {[...items.entries()].map(([guid, qty]) => (
              <li key={guid} className="flex justify-between border-b border-line py-1">
                <span>{productName.get(guid)}</span>
                <span className="font-bold">{qty}</span>
              </li>
            ))}
          </ul>
          <WizardNav
            onBack={() => setStep(2)}
            onNext={create}
            nextLabel="Create market day ✓"
            busy={busy}
          />
        </div>
      )}
    </div>
  )
}
