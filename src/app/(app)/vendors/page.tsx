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
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3 text-right">Products</th>
              <th className="px-4 py-3">Receiving</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {vendors?.map((v) => (
              <tr key={v.id} className="hover:bg-cream">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/vendors/${v.id}`}
                    className="font-semibold hover:text-sea hover:underline"
                  >
                    {v.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-ink-3">{v.contact_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-3">{v.phone ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-3">{v.contact_email ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold">
                  {productCount.get(v.id) ?? 0}
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase text-ink-2">
                    {v.workflow_type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/vendors/${v.id}`}
                    className="rounded-lg bg-sea-soft px-3 py-1.5 text-xs font-bold text-sea"
                  >
                    Profile →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
