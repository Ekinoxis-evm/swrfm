// Daily Toast catalog refresh. Pulls Menus V2 and updates the master's names/prices +
// adds items new to Toast, so the catalog stays current without the manual script.
// Auth: Authorization: Bearer $CRON_SECRET. `?force=1` re-syncs even if the menu is unchanged.

import { NextResponse } from 'next/server'
import { syncCatalogFromToast } from '@/lib/toast-catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const force = new URL(request.url).searchParams.get('force') === '1'
    const result = await syncCatalogFromToast({ force })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 })
  }
}
