import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-sea-soft text-sea',
  review: 'bg-brand-soft text-brand',
  approved: 'bg-pine-soft text-pine',
  paid: 'bg-pine text-white',
  rejected: 'bg-coral-soft text-coral',
}

async function submitCharge(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('vendor_id')
    .eq('id', user!.id)
    .single()
  if (!profile?.vendor_id) return

  await supabase.from('vendor_charges').insert({
    vendor_id: profile.vendor_id,
    session_id: (formData.get('session_id') as string) || null,
    amount_cents: Math.round(Number(formData.get('amount')) * 100),
    description: (formData.get('description') as string) || null,
    submitted_by: user!.id,
  })
  revalidatePath('/vendor')
}

export default async function VendorPortalPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'vendor' || !profile.vendor_id) redirect('/')

  const [{ data: vendor }, { data: sessions }, { data: charges }] = await Promise.all([
    supabase.from('vendors').select('name').eq('id', profile.vendor_id).single(),
    supabase
      .from('receiving_sessions')
      .select('id, date, invoice_no, status')
      .eq('vendor_id', profile.vendor_id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('vendor_charges')
      .select('id, amount_cents, description, status, submitted_at')
      .eq('vendor_id', profile.vendor_id)
      .order('submitted_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{vendor?.name} — Vendor portal</h1>
        <p className="text-sm text-ink-3">
          Submit your charges, follow your payments, and see what SWR recorded as received.
        </p>
      </div>

      <form
        action={submitCharge}
        className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-4"
      >
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Amount (USD)
          </label>
          <input
            name="amount"
            type="number"
            min={0.01}
            step="0.01"
            required
            placeholder="0.00"
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 text-lg font-bold"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Delivery
          </label>
          <select
            name="session_id"
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          >
            <option value="">Not linked</option>
            {sessions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} {s.invoice_no ? `· ${s.invoice_no}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Description
          </label>
          <input
            name="description"
            placeholder="Invoice #, week…"
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          />
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-sea px-4 py-2.5 font-bold text-white active:scale-[0.98]">
            Submit charge
          </button>
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold">My charges</h2>
          {charges?.length ? (
            <ul className="divide-y divide-line">
              {charges.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-bold">${(c.amount_cents / 100).toFixed(2)}</div>
                    <div className="text-xs text-ink-3">
                      {c.description ?? '—'} ·{' '}
                      {new Date(c.submitted_at).toLocaleDateString('en-US')}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${STATUS_TONE[c.status]}`}
                  >
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No charges submitted yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-bold">Deliveries recorded by SWR</h2>
          {sessions?.length ? (
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-semibold">{s.date}</span>{' '}
                    <span className="text-ink-3">{s.invoice_no ? `· ${s.invoice_no}` : ''}</span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                      s.status === 'open' ? 'bg-pine-soft text-pine' : 'bg-surface-3 text-ink-3'
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No deliveries recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}
