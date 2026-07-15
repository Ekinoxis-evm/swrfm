import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'
import { uploadDocument, signedDocUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-sea-soft text-sea',
  review: 'bg-brand-soft text-brand',
  approved: 'bg-pine-soft text-pine',
  paid: 'bg-pine text-white',
  rejected: 'bg-coral-soft text-coral',
}

async function announceDelivery(formData: FormData) {
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
  await supabase.from('receiving_sessions').insert({
    vendor_id: profile.vendor_id,
    date: (formData.get('date') as string) || new Date().toISOString().slice(0, 10),
    invoice_no: (formData.get('invoice_no') as string) || null,
    status: 'announced',
  })
  revalidatePath('/vendor')
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

  const file = formData.get('invoice_file') as File
  const invoicePath = await uploadDocument(file, `charges/${profile.vendor_id}`)

  await supabase.from('vendor_charges').insert({
    vendor_id: profile.vendor_id,
    session_id: (formData.get('session_id') as string) || null,
    amount_cents: Math.round(Number(formData.get('amount')) * 100),
    description: (formData.get('description') as string) || null,
    invoice_path: invoicePath,
    submitted_by: user!.id,
  })
  revalidatePath('/vendor')
}

export default async function VendorPortalPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'vendor' || !profile.vendor_id) redirect('/')

  const [{ data: vendor }, { data: products }, { data: sessions }, { data: charges }] =
    await Promise.all([
      supabase
        .from('vendors')
        .select('name, contact_name, phone, contact_email, address')
        .eq('id', profile.vendor_id)
        .single(),
      supabase
        .from('products')
        .select('toast_guid, name')
        .eq('vendor_id', profile.vendor_id)
        .eq('active', true)
        .order('name'),
      supabase
        .from('receiving_sessions')
        .select('id, date, invoice_no, status')
        .eq('vendor_id', profile.vendor_id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('vendor_charges')
        .select('id, amount_cents, description, status, submitted_at, invoice_path, payment_proof_path')
        .eq('vendor_id', profile.vendor_id)
        .order('submitted_at', { ascending: false })
        .limit(20),
    ])

  const chargeDocs = await Promise.all(
    (charges ?? []).map(async (c) => ({
      ...c,
      invoiceUrl: await signedDocUrl(c.invoice_path),
      proofUrl: c.status === 'paid' ? await signedDocUrl(c.payment_proof_path) : null,
    }))
  )

  const input = 'w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5'
  const label = 'mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{vendor?.name} — Vendor portal</h1>
        <p className="text-sm text-ink-3">
          Announce deliveries, submit your charges with the invoice photo, and follow your
          payments.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          action={announceDelivery}
          className="space-y-3 rounded-2xl border border-line bg-surface p-5"
        >
          <h2 className="font-bold">📣 Announce a delivery</h2>
          <p className="text-xs text-ink-3">
            Tell SWR a delivery is coming — the team will pick it up in their receiving flow.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Delivery date</label>
              <input type="date" name="date" required className={input} />
            </div>
            <div>
              <label className={label}>Invoice #</label>
              <input name="invoice_no" placeholder="optional" className={input} />
            </div>
          </div>
          <button className="rounded-lg bg-sea px-5 py-2.5 text-sm font-bold text-white active:scale-[0.98]">
            Announce delivery
          </button>
        </form>

        <form
          action={submitCharge}
          className="space-y-3 rounded-2xl border border-line bg-surface p-5"
        >
          <h2 className="font-bold">💵 Submit a charge</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Amount (USD)</label>
              <input
                name="amount"
                type="number"
                min={0.01}
                step="0.01"
                required
                placeholder="0.00"
                className={`${input} text-lg font-bold`}
              />
            </div>
            <div>
              <label className={label}>Linked delivery</label>
              <select name="session_id" className={input}>
                <option value="">Not linked</option>
                {sessions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} {s.invoice_no ? `· ${s.invoice_no}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Description</label>
            <input name="description" placeholder="Invoice #, week…" className={input} />
          </div>
          <div>
            <label className={label}>Invoice photo / document</label>
            <input
              name="invoice_file"
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              className="w-full rounded-lg border border-dashed border-line-2 bg-cream px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sea file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
            />
            <p className="mt-1 text-[11px] text-ink-3">
              Take a photo of the paper invoice or upload a PDF — the admin sees it during review.
            </p>
          </div>
          <button className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white active:scale-[0.98]">
            Submit charge
          </button>
        </form>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold">My charges</h2>
        {chargeDocs.length ? (
          <ul className="divide-y divide-line">
            {chargeDocs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">${(c.amount_cents / 100).toFixed(2)}</div>
                  <div className="text-xs text-ink-3">
                    {c.description ?? '—'} · {new Date(c.submitted_at).toLocaleDateString('en-US')}
                  </div>
                </div>
                {c.invoiceUrl && (
                  <a
                    href={c.invoiceUrl}
                    target="_blank"
                    className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-2"
                  >
                    📎 My invoice
                  </a>
                )}
                {c.proofUrl && (
                  <a
                    href={c.proofUrl}
                    target="_blank"
                    className="rounded-lg bg-pine-soft px-3 py-1.5 text-xs font-bold text-pine"
                  >
                    ✓ Payment proof
                  </a>
                )}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-2 font-bold">My deliveries</h2>
          {sessions?.length ? (
            <ul className="divide-y divide-line text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>
                    {s.date} {s.invoice_no ? `· ${s.invoice_no}` : ''}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                      s.status === 'announced'
                        ? 'bg-sea-soft text-sea'
                        : s.status === 'open'
                          ? 'bg-pine-soft text-pine'
                          : 'bg-surface-3 text-ink-3'
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No deliveries yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-2 font-bold">My profile & products</h2>
          <div className="mb-3 text-sm text-ink-2">
            {vendor?.contact_name && <div>👤 {vendor.contact_name}</div>}
            {vendor?.phone && <div>📞 {vendor.phone}</div>}
            {vendor?.contact_email && <div>✉️ {vendor.contact_email}</div>}
            {vendor?.address && <div>📍 {vendor.address}</div>}
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-3">
            Products I supply ({products?.length ?? 0})
          </p>
          <div className="max-h-48 overflow-y-auto text-sm">
            {products?.map((p) => (
              <div key={p.toast_guid} className="border-b border-line py-1">
                {p.name}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
