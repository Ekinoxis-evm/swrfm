import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function addRemoval(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const toastGuid = (formData.get('toast_guid') as string) || null
  const qty = Number(formData.get('qty') || 1)
  const weight = Number(formData.get('weight_lb') || 0)
  let itemName = 'Unknown item'
  if (toastGuid) {
    const { data: product } = await supabase
      .from('products')
      .select('name')
      .eq('toast_guid', toastGuid)
      .single()
    if (product) itemName = product.name
  }

  const { data: removal, error } = await supabase
    .from('removals')
    .insert({
      toast_guid: toastGuid,
      item_name: itemName,
      qty,
      weight_lb: weight,
      removed_by: user?.id,
      note: (formData.get('note') as string) || null,
    })
    .select('id')
    .single()
  if (error) throw error

  if (toastGuid) {
    await supabase.from('inventory_movements').insert({
      toast_guid: toastGuid,
      delta: -qty,
      reason: 'removal',
      ref_id: removal.id,
      created_by: user?.id,
    })
  }
  revalidatePath('/removals')
}

async function signRemoval(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  await supabase
    .from('removals')
    .update({ signed_by: user?.id })
    .eq('id', formData.get('id') as string)
  revalidatePath('/removals')
}

export default async function RemovalsPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const [{ data: coolerProducts }, { data: removals }] = await Promise.all([
    supabase
      .from('products')
      .select('toast_guid, name')
      .eq('cooler_relevant', true)
      .eq('active', true)
      .order('name')
      .limit(500),
    supabase
      .from('removals')
      .select(
        'id, item_name, qty, weight_lb, note, created_at, removed:profiles!removals_removed_by_fkey(full_name), signer:profiles!removals_signed_by_fkey(full_name)'
      )
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .order('created_at', { ascending: false }),
  ])

  const unsigned = removals?.filter((r) => !r.signer).length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Removal log</h1>
        <p className="text-sm text-ink-3">
          Today: {removals?.length ?? 0} removals ·{' '}
          <span className={unsigned ? 'font-bold text-coral' : 'text-pine'}>
            {unsigned ? `${unsigned} unsigned` : 'all signed ✓'}
          </span>
        </p>
      </div>

      <form
        action={addRemoval}
        className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-5"
      >
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Product (cooler)
          </label>
          <ProductSelect products={coolerProducts ?? []} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Boxes
          </label>
          <input
            name="qty"
            type="number"
            min={1}
            defaultValue={1}
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Weight (lb)
          </label>
          <input
            name="weight_lb"
            type="number"
            min={0}
            step="any"
            placeholder="0"
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          />
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-coral px-4 py-2.5 font-bold text-white active:scale-[0.98]">
            Log removal
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-center">Boxes</th>
              <th className="px-4 py-3 text-right">Weight</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3">Manager sign-off</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {removals?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 text-ink-3">
                  {new Date(r.created_at).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-2.5 font-semibold">{r.item_name}</td>
                <td className="px-4 py-2.5 text-center">{Number(r.qty)}</td>
                <td className="px-4 py-2.5 text-right">
                  {Number(r.weight_lb) > 0 ? `${Number(r.weight_lb).toFixed(1)} lb` : '—'}
                </td>
                <td className="px-4 py-2.5 text-ink-3">
                  {(r.removed as unknown as { full_name: string } | null)?.full_name ?? '—'}
                </td>
                <td className="px-4 py-2.5">
                  {(r.signer as unknown as { full_name: string } | null) ? (
                    <span className="font-semibold text-pine">
                      ✓ {(r.signer as unknown as { full_name: string }).full_name}
                    </span>
                  ) : profile.role === 'admin' ? (
                    <form action={signRemoval}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="rounded-lg bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
                        Sign
                      </button>
                    </form>
                  ) : (
                    <span className="text-coral">⚠ unsigned</span>
                  )}
                </td>
              </tr>
            ))}
            {!removals?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                  No removals today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProductSelect({ products }: { products: { toast_guid: string; name: string }[] }) {
  return (
    <select
      name="toast_guid"
      className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
      onChange={undefined}
    >
      {products.map((p) => (
        <option key={p.toast_guid} value={p.toast_guid}>
          {p.name}
        </option>
      ))}
    </select>
  )
}
