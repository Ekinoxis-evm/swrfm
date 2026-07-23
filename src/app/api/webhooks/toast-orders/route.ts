// Toast order webhook — the fast path that draws down floor stock in near-real-time.
//
// Toast POSTs a signed `order_updated` notification whenever an order is created, edited, or
// voided. Rather than depend on the exact notification shape, we treat it as a "something
// changed, reconcile now" trigger: verify the signature, then reconcile orders modified since
// our watermark (bounded lookback) via the same proven ordersBulk path the poll uses. Result:
// selling N units posts a −N movement at location 'floor'. Idempotent by selection GUID, so a
// re-delivered or re-modified order never double-counts. The daily poll is the backstop.

import { NextResponse } from 'next/server'
import {
  toastToken,
  fetchOrdersModified,
  reconcileOrders,
  verifyToastSignature,
  getWatermark,
  setWatermark,
} from '@/lib/toast-sales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KEY = 'toast_sales'
const OVERLAP_MS = 3 * 60 * 1000 // re-scan a few minutes to catch late edits/voids
const FIRST_LOOKBACK_MS = 15 * 60 * 1000 // first event: capture the last 15 min of sales

export async function POST(request: Request) {
  const raw = await request.text()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const timestamp = String(payload.timestamp ?? '')
  if (!verifyToastSignature(raw, timestamp, request.headers.get('toast-signature'))) {
    return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 })
  }

  try {
    const now = new Date()
    const wm = await getWatermark(KEY)
    const startMs = wm ? new Date(wm).getTime() - OVERLAP_MS : now.getTime() - FIRST_LOOKBACK_MS
    const start = new Date(startMs).toISOString()
    const end = now.toISOString()

    const token = await toastToken()
    const orders = await fetchOrdersModified(token, start, end)
    const result = await reconcileOrders(orders)
    await setWatermark(KEY, end)

    console.log(`[toast-webhook] ${result.orders} orders, ${result.movementsPosted} movements, ${result.unitsDrawn} units`)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    // 500 so Toast retries; the daily poll also covers misses.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
