import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Digital replacement for the paper inventory-report forms:
// staff pick a product, enter the counted quantity, and the master
// inventory adjusts with a traceable 'count_adjust' movement.
async function submitCount(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const toastGuid = formData.get('toast_guid') as string
  const counted = Number(formData.get('counted_qty'))
  if (!toastGuid || !Number.isFinite(counted)) return

  const { data: level } = await supabase
    .from('inventory_levels')
    .select('on_hand')
    .eq('toast_guid', toastGuid)
    .maybeSingle()
  const current = Number(level?.on_hand ?? 0)
  const delta = counted - current

  if (delta !== 0) {
    await supabase.from('inventory_movements').insert({
      toast_guid: toastGuid,
      delta,
      reason: 'count_adjust',
      note: `count: ${current} → ${counted}`,
      created_by: user?.id,
    })
  }
  revalidatePath('/counts')
}

export default async function CountsPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const [{ data: products }, { data: recent }] = await Promise.all([
    supabase
      .from('products')
      .select('toast_guid, name')
      .eq('active', true)
      .order('name')
      .limit(2000),
    supabase
      .from('inventory_movements')
      .select('id, delta, note, created_at, products(name), profiles(full_name)')
      .eq('reason', 'count_adjust')
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Inventory count</h1>
        <p className="text-sm text-ink-3">
          Digital count form — replaces the paper reports. Each count adjusts the master inventory
          with full attribution.
        </p>
      </div>

      <form
        action={submitCount}
        className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-4"
      >
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Product
          </label>
          <select
            name="toast_guid"
            required
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5"
          >
            {products?.map((p) => (
              <option key={p.toast_guid} value={p.toast_guid}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Counted quantity
          </label>
          <input
            name="counted_qty"
            type="number"
            min={0}
            step="any"
            required
            placeholder="0"
            className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 text-lg font-bold"
          />
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-pine px-4 py-2.5 font-bold text-white active:scale-[0.98]">
            Save count
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 font-bold">Recent count adjustments</h2>
        {recent?.length ? (
          <ul className="divide-y divide-line">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-semibold">
                    {(m.products as unknown as { name: string } | null)?.name}
                  </span>{' '}
                  <span className="text-ink-3">{m.note}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-bold ${Number(m.delta) >= 0 ? 'text-pine' : 'text-coral'}`}
                  >
                    {Number(m.delta) >= 0 ? '+' : ''}
                    {Number(m.delta)}
                  </span>
                  <span className="text-xs text-ink-3">
                    {(m.profiles as unknown as { full_name: string } | null)?.full_name}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No counts yet.</p>
        )}
      </section>
    </div>
  )
}
