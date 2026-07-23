import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/supabase/server'
import { marketToday } from '@/lib/market-day'
import Transfers, { type TransferProduct, type TransferRow } from './transfers-client'

export const dynamic = 'force-dynamic'

const SELECT =
  'id, item_name, qty, direction, status, note, reject_reason, requested_at, local_date, ' +
  'requester:profiles!stock_transfers_requested_by_fkey(full_name), ' +
  'decider:profiles!stock_transfers_decided_by_fkey(full_name)'

export default async function TransfersPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const day = marketToday()

  const [{ data: products }, { data: levels }, { data: transfers }] = await Promise.all([
    supabase
      .from('products')
      .select('toast_guid, name, vendor_name')
      .eq('active', true)
      .is('archived_at', null)
      .order('name')
      .limit(2000),
    supabase.from('inventory_levels').select('toast_guid, storage_on_hand, floor_on_hand'),
    // La cola muestra lo pendiente (de cualquier día) + lo decidido hoy.
    supabase
      .from('stock_transfers')
      .select(SELECT)
      .or(`status.eq.pending,local_date.eq.${day}`)
      .order('requested_at', { ascending: false }),
  ])

  const level = new Map(
    (levels ?? []).map((l) => [
      l.toast_guid,
      { storage: Number(l.storage_on_hand), floor: Number(l.floor_on_hand) },
    ])
  )

  const items: TransferProduct[] = (products ?? [])
    .map((p) => ({
      toast_guid: p.toast_guid,
      name: p.name,
      vendor_name: p.vendor_name,
      storage: level.get(p.toast_guid)?.storage ?? 0,
      floor: level.get(p.toast_guid)?.floor ?? 0,
    }))
    // Solo tiene sentido transferir lo que existe en algún lado.
    .filter((p) => p.storage > 0 || p.floor > 0)

  return (
    // useSearchParams (prefill desde el botón Move del inventario) exige un Suspense.
    <Suspense>
      <Transfers
        products={items}
        initialRows={(transfers ?? []) as unknown as TransferRow[]}
        day={day}
        isManager={profile.role === 'admin'}
      />
    </Suspense>
  )
}
