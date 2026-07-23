// Toast sales poll — the reconciliation backstop behind the webhook.
//
// Polls ordersBulk by modified time since the last watermark (with overlap so nothing is
// missed) and reconciles into the floor ledger. Safe by design: on the very first run it
// sets the watermark to "now" and posts nothing, so we never backfill historical sales
// into inventory. Auth: Authorization: Bearer $CRON_SECRET (how Vercel Cron invokes it).

import { NextResponse } from 'next/server'
import {
  toastToken,
  fetchOrdersModified,
  reconcileOrders,
  getWatermark,
  setWatermark,
} from '@/lib/toast-sales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KEY = 'toast_sales'
const OVERLAP_MS = 10 * 60 * 1000 // re-scan the last 10 min to catch late voids/edits

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  // A manual dry run may pass ?hours= to look back over a window without touching state.
  const hours = Number(url.searchParams.get('hours') || 0)

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const nowISO = now.toISOString()

    if (dryRun) {
      const start = new Date(now.getTime() - Math.max(1, hours || 2) * 3.6e6).toISOString()
      const token = await toastToken()
      const orders = await fetchOrdersModified(token, start, nowISO)
      const preview = await reconcileOrders(orders, { dryRun: true })
      return NextResponse.json({ ok: true, dryRun: true, window: { start, end: nowISO }, ...preview })
    }

    const watermark = await getWatermark(KEY)
    if (!watermark) {
      // First run: start ingesting from now — no historical backfill.
      await setWatermark(KEY, nowISO)
      return NextResponse.json({ ok: true, initialized: true, watermark: nowISO })
    }

    const start = new Date(new Date(watermark).getTime() - OVERLAP_MS).toISOString()
    const token = await toastToken()
    const orders = await fetchOrdersModified(token, start, nowISO)
    const result = await reconcileOrders(orders)
    await setWatermark(KEY, nowISO)
    return NextResponse.json({ ok: true, window: { start, end: nowISO }, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 })
  }
}
