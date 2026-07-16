import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionProfile } from '@/lib/supabase/server'
import VendorTabs from '@/components/vendor-tabs'

export const dynamic = 'force-dynamic'

export default async function VendorsPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const [{ data: vendors }, { data: counts }, pendingPayments] = await Promise.all([
    supabase
      .from('vendors')
      .select('id, name, contact_name, phone, contact_email, workflow_type')
      .eq('active', true)
      .order('name'),
    supabase.from('products').select('vendor_id').eq('active', true),
    supabase
      .from('vendor_charges')
      .select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'review']),
  ])

  const productCount = new Map<string, number>()
  for (const p of counts ?? []) {
    if (p.vendor_id) productCount.set(p.vendor_id, (productCount.get(p.vendor_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Vendors</h1>
          <p className="text-sm text-ink-3">
            {vendors?.length ?? 0} active vendors — open a profile for products, deliveries, and
            payments history.
          </p>
        </div>
        <VendorTabs active="directory" pending={pendingPayments.count ?? 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vendors?.map((v) => (
          <Link
            key={v.id}
            href={`/vendors/${v.id}`}
            className="rounded-2xl border border-line bg-surface p-4 transition hover:border-line-2"
          >
            <div className="font-bold">{v.name}</div>
            <div className="mt-1 text-xs text-ink-3">
              {v.contact_name ?? 'No contact yet'}
              {v.phone ? ` · ${v.phone}` : ''}
            </div>
            <div className="mt-2 text-xs font-semibold text-ink-2">
              {productCount.get(v.id) ?? 0} products
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
