import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function updateVendor(formData: FormData) {
  'use server'
  const { profile } = await getSessionProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Unauthorized')
  const supabase = await createClient()
  const id = formData.get('id') as string
  await supabase
    .from('vendors')
    .update({
      contact_name: (formData.get('contact_name') as string) || null,
      phone: (formData.get('phone') as string) || null,
      contact_email: (formData.get('contact_email') as string) || null,
      address: (formData.get('address') as string) || null,
      notes: (formData.get('notes') as string) || null,
    })
    .eq('id', id)
  revalidatePath(`/vendors/${id}`)
}

export default async function VendorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const [{ data: vendor }, { data: products }, { data: sessions }, { data: charges }] =
    await Promise.all([
      supabase
        .from('vendors')
        .select('id, name, contact_name, phone, contact_email, address, notes, workflow_type')
        .eq('id', id)
        .single(),
      supabase
        .from('products')
        .select('toast_guid, name, category, price_cents')
        .eq('vendor_id', id)
        .eq('active', true)
        .is('archived_at', null)
        .order('name'),
      supabase
        .from('receiving_sessions')
        .select('id, date, invoice_no, status')
        .eq('vendor_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('vendor_charges')
        .select('id, amount_cents, description, status, submitted_at')
        .eq('vendor_id', id)
        .order('submitted_at', { ascending: false })
        .limit(10),
    ])
  if (!vendor) notFound()

  const input = 'w-full rounded-lg border border-line-2 bg-cream px-3 py-2'
  const label = 'mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{vendor.name}</h1>
        <p className="text-sm text-ink-3">
          Vendor profile · {products?.length ?? 0} products · receiving workflow:{' '}
          {vendor.workflow_type}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          action={updateVendor}
          className="space-y-3 rounded-2xl border border-line bg-surface p-5"
        >
          <h2 className="font-bold">Contact information</h2>
          <input type="hidden" name="id" value={vendor.id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Contact person</label>
              <input name="contact_name" defaultValue={vendor.contact_name ?? ''} className={input} />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input name="phone" defaultValue={vendor.phone ?? ''} className={input} />
            </div>
          </div>
          <div>
            <label className={label}>Email</label>
            <input name="contact_email" defaultValue={vendor.contact_email ?? ''} className={input} />
          </div>
          <div>
            <label className={label}>Address</label>
            <input name="address" defaultValue={vendor.address ?? ''} className={input} />
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea name="notes" defaultValue={vendor.notes ?? ''} rows={2} className={input} />
          </div>
          {profile.role === 'admin' && (
            <button className="rounded-lg bg-ink px-5 py-2.5 text-sm font-bold text-cream">
              Save profile
            </button>
          )}
        </form>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-2 font-bold">Delivery history</h2>
            {sessions?.length ? (
              <ul className="divide-y divide-line text-sm">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span>
                      {s.date} {s.invoice_no ? `· ${s.invoice_no}` : ''}
                    </span>
                    <Link
                      href={`/receiving/${s.id}`}
                      className="rounded-lg bg-sea-soft px-3 py-1 text-xs font-bold text-sea"
                    >
                      {s.status} →
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No deliveries yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-2 font-bold">Charges history</h2>
            {charges?.length ? (
              <ul className="divide-y divide-line text-sm">
                {charges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span className="font-semibold">${(c.amount_cents / 100).toFixed(2)}</span>
                    <span className="text-xs text-ink-3">{c.description ?? '—'}</span>
                    <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[11px] font-bold uppercase text-ink-2">
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No charges yet.</p>
            )}
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold">Products supplied ({products?.length ?? 0})</h2>
        <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {products?.map((p) => (
            <div key={p.toast_guid} className="flex justify-between border-b border-line py-1.5">
              <span className="truncate">{p.name}</span>
              <span className="ml-2 shrink-0 text-ink-3">
                {p.price_cents != null ? `$${(p.price_cents / 100).toFixed(2)}` : '—'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
