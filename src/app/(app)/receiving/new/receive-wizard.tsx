'use client'

// Guided flow to receive a delivery:
//   1. Pick the vendor
//   2. Pick a delivery the vendor announced — or start a new one
//   3. Jump into the collaborative line editor

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WizardSteps, WizardNav } from '@/components/wizard'

type Vendor = { id: string; name: string; workflow_type: string; contact_name: string | null }
type Announced = { id: string; date: string; invoice_no: string | null; status: string }

export default function ReceiveWizard({ vendors, meId }: { vendors: Vendor[]; meId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [announced, setAnnounced] = useState<Announced[]>([])
  const [picked, setPicked] = useState<string | 'new'>('new')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!vendor) return
    supabase
      .from('receiving_sessions')
      .select('id, date, invoice_no, status')
      .eq('vendor_id', vendor.id)
      .in('status', ['announced', 'open'])
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setAnnounced((data ?? []) as Announced[])
        setPicked(data?.length ? data[0].id : 'new')
      })
  }, [vendor, supabase])

  const filtered = vendors.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()))

  async function finish() {
    if (!vendor) return
    setBusy(true)
    if (picked !== 'new') {
      // Take over an announced delivery: mark it open and assign the receiver.
      await supabase
        .from('receiving_sessions')
        .update({ status: 'open', received_by: meId })
        .eq('id', picked)
      router.push(`/receiving/${picked}`)
      return
    }
    const { data, error } = await supabase
      .from('receiving_sessions')
      .insert({ vendor_id: vendor.id, invoice_no: invoiceNo || null, received_by: meId })
      .select('id')
      .single()
    if (error) {
      alert(error.message)
      setBusy(false)
      return
    }
    router.push(`/receiving/${data.id}`)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Receive a delivery</h1>
      <p className="mb-6 text-sm text-ink-3">Guided flow — three quick steps.</p>
      <WizardSteps steps={['Vendor', 'Delivery', 'Products']} current={step} />

      {step === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendor…"
            className="mb-3 w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {filtered.slice(0, 30).map((v) => (
              <button
                key={v.id}
                onClick={() => setVendor(v)}
                className={`block w-full rounded-lg border px-4 py-3 text-left ${
                  vendor?.id === v.id
                    ? 'border-brand bg-brand-soft'
                    : 'border-line bg-cream hover:border-line-2'
                }`}
              >
                <span className="font-semibold">{v.name}</span>
                {v.contact_name && (
                  <span className="ml-2 text-xs text-ink-3">{v.contact_name}</span>
                )}
              </button>
            ))}
          </div>
          <WizardNav onNext={() => setStep(1)} nextDisabled={!vendor} />
        </div>
      )}

      {step === 1 && vendor && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="mb-3 text-sm font-semibold">
            {vendor.name} — pick an announced delivery or start a new one:
          </p>
          <div className="space-y-2">
            {announced.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${
                  picked === s.id ? 'border-brand bg-brand-soft' : 'border-line bg-cream'
                }`}
              >
                <input
                  type="radio"
                  checked={picked === s.id}
                  onChange={() => setPicked(s.id)}
                />
                <div>
                  <div className="text-sm font-semibold">
                    {s.date} {s.invoice_no ? `· Invoice ${s.invoice_no}` : ''}
                  </div>
                  <div className="text-xs text-ink-3">
                    {s.status === 'announced' ? '📣 announced by vendor' : 'already open'}
                  </div>
                </div>
              </label>
            ))}
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${
                picked === 'new' ? 'border-brand bg-brand-soft' : 'border-line bg-cream'
              }`}
            >
              <input type="radio" checked={picked === 'new'} onChange={() => setPicked('new')} />
              <div className="flex-1">
                <div className="text-sm font-semibold">＋ New delivery</div>
                {picked === 'new' && (
                  <input
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    placeholder="Invoice # (optional)"
                    className="mt-2 w-full rounded-lg border border-line-2 bg-surface px-3 py-2"
                    onClick={(e) => e.preventDefault()}
                  />
                )}
              </div>
            </label>
          </div>
          <WizardNav
            onBack={() => setStep(0)}
            onNext={finish}
            nextLabel="Start receiving →"
            busy={busy}
          />
        </div>
      )}
    </div>
  )
}
