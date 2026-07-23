import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'
import { uploadDocument, signedDocUrl } from '@/lib/storage'
import VendorTabs from '@/components/vendor-tabs'
import { StatusPill } from '@/components/thermal'

export const dynamic = 'force-dynamic'

// Accounts-payable status as a chip tone.
const CHARGE_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'cold' | 'neutral'> = {
  submitted: 'warn',
  review: 'cold',
  approved: 'ok',
  paid: 'neutral',
  rejected: 'crit',
}

async function setStatus(formData: FormData) {
  'use server'
  const { profile } = await getSessionProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Unauthorized')
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
  revalidatePath('/vendors/payments')
}

async function markPaid(formData: FormData) {
  'use server'
  const { profile } = await getSessionProfile()
  if (!profile || profile.role !== 'admin') throw new Error('Unauthorized')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const id = formData.get('id') as string
  const file = formData.get('proof_file') as File
  const proofPath = await uploadDocument(file, `proofs/${id}`)
  await supabase
    .from('vendor_charges')
    .update({
      status: 'paid',
      payment_proof_path: proofPath,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  revalidatePath('/vendors/payments')
}

export default async function ChargesPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  const { data: charges } = await supabase
    .from('vendor_charges')
    .select(
      'id, amount_cents, description, status, submitted_at, invoice_path, payment_proof_path, vendors(name), receiving_sessions(date, invoice_no)'
    )
    .order('submitted_at', { ascending: false })
    .limit(50)

  const pendingCount =
    charges?.filter((c) => c.status === 'submitted' || c.status === 'review').length ?? 0

  const rows = await Promise.all(
    (charges ?? []).map(async (c) => ({
      ...c,
      invoiceUrl: await signedDocUrl(c.invoice_path),
      proofUrl: await signedDocUrl(c.payment_proof_path),
    }))
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-xl font-bold">Vendor payments</h1>
        <p className="text-sm text-ink-3">
          Accounts payable — review each charge against the recorded delivery and its invoice,
          approve, and attach the payment proof when paid; the vendor sees it instantly.
        </p>
        </div>
        <VendorTabs active="payments" pending={pendingCount} />
      </div>

      <div className="space-y-3">
        {rows.map((c) => {
          const session = c.receiving_sessions as unknown as {
            date: string
            invoice_no: string | null
          } | null
          return (
            <div key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">
                    {(c.vendors as unknown as { name: string } | null)?.name}{' '}
                    <span className="tnum">— ${(c.amount_cents / 100).toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-ink-3">
                    {c.description ?? '—'} · {new Date(c.submitted_at).toLocaleDateString('en-US')}
                    {session ? (
                      <>
                        {' · '}
                        <span className="font-semibold text-cold">
                          {session.invoice_no ? `Invoice ${session.invoice_no}` : 'delivery'} · {session.date}
                        </span>
                      </>
                    ) : (
                      ' · not linked to a delivery'
                    )}
                  </div>
                </div>
                {c.invoiceUrl && (
                  <a
                    href={c.invoiceUrl}
                    target="_blank"
                    className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-2 hover:bg-surface-3"
                  >
                    Vendor invoice
                  </a>
                )}
                {c.proofUrl && (
                  <a
                    href={c.proofUrl}
                    target="_blank"
                    className="rounded-lg bg-ok-soft px-3 py-1.5 text-xs font-bold text-ok"
                  >
                    Payment proof
                  </a>
                )}
                <StatusPill tone={CHARGE_TONE[c.status] ?? 'neutral'}>{c.status}</StatusPill>
              </div>

              {(c.status === 'submitted' || c.status === 'review') && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  {c.status === 'submitted' && (
                    <form action={setStatus}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="review" />
                      <button className="rounded-lg bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand">
                        Start review
                      </button>
                    </form>
                  )}
                  {c.status === 'review' && (
                    <form action={setStatus}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button className="rounded-lg bg-pine-soft px-3 py-1.5 text-xs font-bold text-pine">
                        Approve
                      </button>
                    </form>
                  )}
                  <form action={setStatus}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <button className="rounded-lg bg-coral-soft px-3 py-1.5 text-xs font-bold text-coral">
                      Reject
                    </button>
                  </form>
                </div>
              )}

              {c.status === 'approved' && (
                <form
                  action={markPaid}
                  className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3"
                >
                  <input type="hidden" name="id" value={c.id} />
                  <input
                    name="proof_file"
                    type="file"
                    accept="image/*,.pdf"
                    className="flex-1 rounded-lg border border-dashed border-line-2 bg-cream px-3 py-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-pine file:px-2.5 file:py-1 file:text-[11px] file:font-bold file:text-white"
                  />
                  <button className="rounded-lg bg-pine px-4 py-2 text-xs font-bold text-white">
                    Mark paid + attach proof
                  </button>
                </form>
              )}
            </div>
          )
        })}
        {!rows.length && (
          <p className="rounded-2xl border border-dashed border-line-2 p-8 text-center text-ink-3">
            No vendor charges yet.
          </p>
        )}
      </div>
    </div>
  )
}
