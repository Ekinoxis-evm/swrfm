import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const NEXT: Record<string, { to: string; label: string; tone: string }[]> = {
  submitted: [
    { to: 'review', label: 'Start review', tone: 'bg-brand-soft text-brand' },
    { to: 'rejected', label: 'Reject', tone: 'bg-coral-soft text-coral' },
  ],
  review: [
    { to: 'approved', label: 'Approve', tone: 'bg-pine-soft text-pine' },
    { to: 'rejected', label: 'Reject', tone: 'bg-coral-soft text-coral' },
  ],
  approved: [{ to: 'paid', label: 'Mark paid', tone: 'bg-pine text-white' }],
}

async function setStatus(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  await supabase
    .from('vendor_charges')
    .update({
      status: formData.get('status') as string,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', formData.get('id') as string)
  revalidatePath('/charges')
}

export default async function ChargesPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  const { data: charges } = await supabase
    .from('vendor_charges')
    .select('id, amount_cents, description, status, submitted_at, vendors(name)')
    .order('submitted_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Vendor charges</h1>
        <p className="text-sm text-ink-3">
          Accounts payable — review charges against recorded deliveries before approving.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {charges?.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5 font-semibold">
                  {(c.vendors as unknown as { name: string } | null)?.name}
                </td>
                <td className="px-4 py-2.5 text-right font-bold">
                  ${(c.amount_cents / 100).toFixed(2)}
                </td>
                <td className="px-4 py-2.5 text-ink-3">{c.description ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-3">
                  {new Date(c.submitted_at).toLocaleDateString('en-US')}
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-bold uppercase text-ink-2">
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    {(NEXT[c.status] ?? []).map((a) => (
                      <form key={a.to} action={setStatus}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="status" value={a.to} />
                        <button
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${a.tone}`}
                        >
                          {a.label}
                        </button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!charges?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                  No vendor charges yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
