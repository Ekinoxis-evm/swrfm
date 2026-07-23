import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/supabase/server'
import { marketToday, REMOVAL_SELECT } from '@/lib/market-day'
import RemovalLog, { type CoolerProduct, type RemovalRow } from './removal-log'

export const dynamic = 'force-dynamic'

export default async function RemovalsPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const day = marketToday()

  const [{ data: products }, { data: levels }, { data: removals }] = await Promise.all([
    supabase
      .from('products')
      .select('toast_guid, name, vendor_name, units_per_case')
      .eq('cooler_relevant', true)
      .eq('active', true)
      .is('archived_at', null)
      .order('name')
      .limit(1000),
    supabase.from('inventory_levels').select('toast_guid, cases_on_hand, units_on_hand'),
    supabase
      .from('removals')
      .select(REMOVAL_SELECT)
      .eq('local_date', day)
      .order('created_at', { ascending: false }),
  ])

  const level = new Map(
    (levels ?? []).map((l) => [
      l.toast_guid,
      { cases: Number(l.cases_on_hand), units: Number(l.units_on_hand) },
    ])
  )

  const coolerProducts: CoolerProduct[] = (products ?? []).map((p) => ({
    toast_guid: p.toast_guid,
    name: p.name,
    vendor_name: p.vendor_name,
    units_per_case: p.units_per_case,
    cases_on_hand: level.get(p.toast_guid)?.cases ?? 0,
    units_on_hand: level.get(p.toast_guid)?.units ?? 0,
  }))

  return (
    <RemovalLog
      products={coolerProducts}
      initialRows={(removals ?? []) as unknown as RemovalRow[]}
      day={day}
      isManager={profile.role === 'admin'}
    />
  )
}
