// Toast order webhook — the fast path that draws down floor stock in near-real-time.
//
// Toast POSTs an `order_updated` notification (signed) whenever an order is created, edited,
// or voided. We verify the signature, fetch the authoritative order(s) by GUID, and reconcile
// into the floor ledger — the same core the poll cron uses, so the two can't disagree. The
// poll remains the backstop for anything missed during an outage.

import { NextResponse } from 'next/server'
import { toastToken, fetchOrder, reconcileOrders, verifyToastSignature, type ToastOrder } from '@/lib/toast-sales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Pull order GUIDs out of whatever shape Toast sends (a list of GUIDs, or objects with guids).
function orderGuids(payload: unknown): string[] {
  const out = new Set<string>()
  const visit = (v: unknown) => {
    if (!v) return
    if (Array.isArray(v)) return v.forEach(visit)
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.guid === 'string') out.add(o.guid)
      if (typeof o.orderGuid === 'string') out.add(o.orderGuid as string)
      for (const k of ['guids', 'orderGuids', 'data', 'orders', 'events']) if (o[k]) visit(o[k])
    }
    if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) out.add(v)
  }
  visit(payload)
  return [...out]
}

export async function POST(request: Request) {
  const raw = await request.text()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // Verify the signature over body + timestamp (fail closed once a secret is configured).
  const timestamp = String(payload.timestamp ?? '')
  if (!verifyToastSignature(raw, timestamp, request.headers.get('toast-signature'))) {
    return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 })
  }

  try {
    const guids = orderGuids(payload).filter((g) => g !== timestamp)
    if (!guids.length) return NextResponse.json({ ok: true, note: 'no order guids' })

    const token = await toastToken()
    const orders = (await Promise.all(guids.map((g) => fetchOrder(token, g)))).filter(
      (o): o is ToastOrder => Boolean(o)
    )
    const result = await reconcileOrders(orders)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    // 500 so Toast retries; the poll backstop also covers misses.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
