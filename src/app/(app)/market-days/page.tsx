import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionProfile } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, string> = {
  planned: 'bg-sea-soft text-sea',
  active: 'bg-pine-soft text-pine',
  closed: 'bg-surface-3 text-ink-3',
}

export default async function MarketDaysPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const { data: days } = await supabase
    .from('market_days')
    .select(
      'id, title, date, start_time, end_time, location, status, market_day_staff(profiles(full_name)), market_day_items(id)'
    )
    .order('date', { ascending: false })
    .limit(30)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Market days</h1>
          <p className="text-sm text-ink-3">
            Pop-up sales in other cities — plan what goes out, close with what came back.
          </p>
        </div>
        {profile.role === 'admin' && (
          <Link
            href="/market-days/new"
            className="rounded-lg bg-brand px-5 py-2.5 font-bold text-white active:scale-[0.98]"
          >
            + Plan a market day
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {days?.map((d) => {
          const staff = (d.market_day_staff as unknown as { profiles: { full_name: string } }[])
            ?.map((s) => s.profiles?.full_name)
            .filter(Boolean)
          return (
            <Link
              key={d.id}
              href={`/market-days/${d.id}`}
              className="rounded-2xl border border-line bg-surface p-5 transition hover:border-line-2"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold">{d.title}</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${STATUS_TONE[d.status]}`}
                >
                  {d.status}
                </span>
              </div>
              <div className="text-sm text-ink-2">
                📅 {d.date}
                {d.start_time ? ` · ${String(d.start_time).slice(0, 5)}` : ''}
                {d.end_time ? `–${String(d.end_time).slice(0, 5)}` : ''}
              </div>
              <div className="text-sm text-ink-2">📍 {d.location}</div>
              <div className="mt-2 text-xs text-ink-3">
                {(d.market_day_items as unknown as unknown[])?.length ?? 0} products ·{' '}
                {staff?.length ? `staff: ${staff.join(', ')}` : 'no staff assigned'}
              </div>
            </Link>
          )
        })}
        {!days?.length && (
          <p className="rounded-2xl border border-dashed border-line-2 p-8 text-center text-ink-3 sm:col-span-2">
            No market days yet — plan the first one.
          </p>
        )}
      </div>
    </div>
  )
}
