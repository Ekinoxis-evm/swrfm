import { redirect } from 'next/navigation'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function createSession(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const vendorId = formData.get('vendor_id') as string
  const invoiceNo = (formData.get('invoice_no') as string) || null
  const { data, error } = await supabase
    .from('receiving_sessions')
    .insert({ vendor_id: vendorId, invoice_no: invoiceNo, received_by: user?.id })
    .select('id')
    .single()
  if (error) throw error
  revalidatePath('/receiving')
  redirect(`/receiving/${data.id}`)
}

export default async function ReceivingPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const [{ data: vendors }, { data: sessions }] = await Promise.all([
    supabase.from('vendors').select('id, name, workflow_type').eq('active', true).order('name'),
    supabase
      .from('receiving_sessions')
      .select('id, date, invoice_no, status, created_at, vendors(name), profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Receiving</h1>
        <p className="text-sm text-ink-3">
          Log vendor deliveries — several people can work on the same delivery at once
        </p>
      </div>

      <form
        action={createSession}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4"
      >
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Vendor
          </label>
          <select
            name="vendor_id"
            required
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          >
            {vendors?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Invoice #
          </label>
          <input
            name="invoice_no"
            placeholder="optional"
            className="rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          />
        </div>
        <button className="rounded-lg bg-pine px-5 py-2.5 font-bold text-white active:scale-[0.98]">
          + New receiving
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Received by</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sessions?.map((s) => (
              <tr key={s.id} className="hover:bg-cream">
                <td className="px-4 py-2.5">{s.date}</td>
                <td className="px-4 py-2.5 font-semibold">
                  {(s.vendors as unknown as { name: string } | null)?.name}
                </td>
                <td className="px-4 py-2.5 text-ink-3">{s.invoice_no ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-3">
                  {(s.profiles as unknown as { full_name: string } | null)?.full_name ?? '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                      s.status === 'open' ? 'bg-pine-soft text-pine' : 'bg-surface-3 text-ink-3'
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/receiving/${s.id}`}
                    className="rounded-lg bg-sea-soft px-3 py-1.5 text-xs font-bold text-sea"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!sessions?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                  No receiving sessions yet — create the first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
