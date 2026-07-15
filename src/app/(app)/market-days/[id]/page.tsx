import { redirect, notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/supabase/server'
import CloseDayForm from './close-day-form'

export const dynamic = 'force-dynamic'

export default async function MarketDayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const { data: day } = await supabase
    .from('market_days')
    .select(
      'id, title, date, start_time, end_time, location, status, notes, market_day_staff(profiles(id, full_name)), market_day_items(id, toast_guid, qty_taken, qty_returned, unit, products(name))'
    )
    .eq('id', id)
    .single()
  if (!day) notFound()

  const items = (day.market_day_items as unknown as {
    id: string
    toast_guid: string
    qty_taken: number
    qty_returned: number | null
    unit: string
    products: { name: string } | null
  }[]).map((i) => ({
    id: i.id,
    toastGuid: i.toast_guid,
    name: i.products?.name ?? 'Product',
    qtyTaken: Number(i.qty_taken),
    qtyReturned: i.qty_returned == null ? null : Number(i.qty_returned),
    unit: i.unit,
  }))

  const staffNames = (day.market_day_staff as unknown as { profiles: { full_name: string } }[])
    ?.map((s) => s.profiles?.full_name)
    .filter(Boolean)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">{day.title}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              day.status === 'closed' ? 'bg-surface-3 text-ink-3' : 'bg-pine-soft text-pine'
            }`}
          >
            {day.status}
          </span>
        </div>
        <p className="text-sm text-ink-2">
          📅 {day.date}
          {day.start_time ? ` · ${String(day.start_time).slice(0, 5)}` : ''}
          {day.end_time ? `–${String(day.end_time).slice(0, 5)}` : ''} · 📍 {day.location}
        </p>
        <p className="text-sm text-ink-3">👥 {staffNames?.join(', ') || 'No staff assigned'}</p>
      </div>

      <CloseDayForm
        dayId={day.id}
        status={day.status}
        items={items}
        meId={profile.id}
      />
    </div>
  )
}
