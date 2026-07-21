import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/supabase/server'
import MarketDayWizard from './market-day-wizard'

export const dynamic = 'force-dynamic'

export default async function NewMarketDayPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/market-days')

  const [{ data: staff }, { data: products }, { data: levels }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['staff', 'admin'])
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('products')
      .select('toast_guid, name, category')
      .eq('active', true)
      .is('archived_at', null)
      .order('name')
      .limit(2000),
    supabase.from('inventory_levels').select('toast_guid, on_hand'),
  ])

  const onHand = Object.fromEntries((levels ?? []).map((l) => [l.toast_guid, Number(l.on_hand)]))

  return (
    <MarketDayWizard
      meId={profile.id}
      staff={staff ?? []}
      products={products ?? []}
      onHand={onHand}
    />
  )
}
