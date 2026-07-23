// Toast sales → floor drawdown, shared by the webhook (primary) and the poll cron (backstop).
//
// A sale of N units of a product posts a −N movement at location 'floor' (reason sale_toast),
// so on_hand and floor_on_hand both drop. Reconciled, not append-only: we remember the net
// units already posted per Toast selection and post only the delta, so a later void/refund
// (net drops) posts the compensating +movement. Idempotent — replaying an unchanged order
// posts nothing. Server-only; talks to Toast and to PostgREST with the service key.

import crypto from 'node:crypto'

if (typeof window !== 'undefined') {
  throw new Error('toast-sales.ts is server-only and must never be imported client-side')
}

// ---- Supabase (service key, bypasses RLS) ----
function db(path: string, init?: RequestInit) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials not configured')
  return fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
}

// ---- Toast auth + fetch ----
export async function toastToken(): Promise<string> {
  const res = await fetch(`${process.env.TOAST_API_HOST}/authentication/v1/authentication/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.TOAST_CLIENT_ID,
      clientSecret: process.env.TOAST_CLIENT_SECRET,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Toast login ${res.status}`)
  return (await res.json()).token.accessToken as string
}

function toastHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Toast-Restaurant-External-ID': process.env.TOAST_RESTAURANT_GUID as string,
  }
}

/** Orders modified in [startISO, endISO], paginated. */
export async function fetchOrdersModified(token: string, startISO: string, endISO: string) {
  const host = process.env.TOAST_API_HOST
  const orders: ToastOrder[] = []
  for (let page = 1; page <= 50; page++) {
    const url = `${host}/orders/v2/ordersBulk?startDate=${startISO}&endDate=${endISO}&pageSize=100&page=${page}`
    const r = await fetch(url, { headers: toastHeaders(token), cache: 'no-store' })
    if (!r.ok) throw new Error(`ordersBulk ${r.status}`)
    const arr = (await r.json()) as ToastOrder[]
    if (!Array.isArray(arr) || arr.length === 0) break
    orders.push(...arr)
    if (arr.length < 100) break
  }
  return orders
}

/** A single order by GUID (used by the webhook, which is notified by GUID). */
export async function fetchOrder(token: string, guid: string): Promise<ToastOrder | null> {
  const r = await fetch(`${process.env.TOAST_API_HOST}/orders/v2/orders/${guid}`, {
    headers: toastHeaders(token),
    cache: 'no-store',
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`orders/${guid} ${r.status}`)
  return (await r.json()) as ToastOrder
}

// ---- Types (only the fields we read) ----
type ToastSelection = {
  guid: string
  quantity?: number
  voided?: boolean
  displayName?: string
  item?: { guid?: string }
}
type ToastCheck = { voided?: boolean; deleted?: boolean; selections?: ToastSelection[] }
export type ToastOrder = {
  guid: string
  voided?: boolean
  deleted?: boolean
  businessDate?: number | string
  checks?: ToastCheck[]
}

type NetLine = { orderGuid: string; itemGuid: string; net: number; businessDate: string | null; name: string }

/** Collapse a set of orders into net sold units per selection GUID (voids → 0). */
function netLinesBySelection(orders: ToastOrder[]): Map<string, NetLine> {
  const out = new Map<string, NetLine>()
  for (const o of orders) {
    const orderDead = Boolean(o.voided || o.deleted)
    for (const c of o.checks ?? []) {
      const checkDead = orderDead || Boolean(c.voided || c.deleted)
      for (const s of c.selections ?? []) {
        const itemGuid = s.item?.guid
        if (!s.guid || !itemGuid) continue
        const net = checkDead || s.voided ? 0 : Number(s.quantity ?? 0)
        out.set(s.guid, {
          orderGuid: o.guid,
          itemGuid,
          net,
          businessDate: o.businessDate != null ? String(o.businessDate) : null,
          name: s.displayName ?? '',
        })
      }
    }
  }
  return out
}

export type ReconcileResult = {
  orders: number
  selections: number
  mapped: number
  unmapped: number
  movementsPosted: number
  unitsDrawn: number
}

/**
 * Reconcile a batch of orders into the floor ledger. With dryRun, reports what *would*
 * happen and writes nothing.
 */
export async function reconcileOrders(orders: ToastOrder[], opts: { dryRun?: boolean } = {}): Promise<ReconcileResult> {
  const lines = netLinesBySelection(orders)
  const result: ReconcileResult = {
    orders: orders.length,
    selections: lines.size,
    mapped: 0,
    unmapped: 0,
    movementsPosted: 0,
    unitsDrawn: 0,
  }
  if (lines.size === 0) return result

  // Which sold items exist in our master? (products.toast_guid == Toast item GUID)
  const itemGuids = [...new Set([...lines.values()].map((l) => l.itemGuid))]
  const valid = new Set<string>()
  for (let i = 0; i < itemGuids.length; i += 150) {
    const chunk = itemGuids.slice(i, i + 150)
    const r = await db(`/products?select=toast_guid&toast_guid=in.(${chunk.join(',')})`)
    if (r.ok) for (const p of (await r.json()) as { toast_guid: string }[]) valid.add(p.toast_guid)
  }

  // What have we already posted for these selections?
  const selGuids = [...lines.keys()]
  const posted = new Map<string, number>()
  for (let i = 0; i < selGuids.length; i += 150) {
    const chunk = selGuids.slice(i, i + 150)
    const r = await db(`/toast_sale_lines?select=selection_guid,qty&selection_guid=in.(${chunk.join(',')})`)
    if (r.ok) for (const l of (await r.json()) as { selection_guid: string; qty: number }[]) posted.set(l.selection_guid, Number(l.qty))
  }

  const movements: Record<string, unknown>[] = []
  const upserts: Record<string, unknown>[] = []
  for (const [selGuid, line] of lines) {
    if (!valid.has(line.itemGuid)) {
      result.unmapped++
      continue
    }
    result.mapped++
    const old = posted.get(selGuid) ?? 0
    const delta = line.net - old // positive = more sold since last time
    if (delta === 0) continue
    // Selling `delta` more units removes them from the floor: negative ledger delta.
    movements.push({
      toast_guid: line.itemGuid,
      delta: -delta,
      location: 'floor',
      reason: 'sale_toast',
      ref_id: selGuid,
      note: `Toast sale · ${line.name}`.slice(0, 120),
    })
    upserts.push({
      selection_guid: selGuid,
      order_guid: line.orderGuid,
      toast_guid: line.itemGuid,
      qty: line.net,
      business_date: line.businessDate,
      updated_at: new Date().toISOString(),
    })
    result.movementsPosted++
    result.unitsDrawn += delta
  }

  if (!opts.dryRun && movements.length) {
    const mv = await db('/inventory_movements', { method: 'POST', body: JSON.stringify(movements) })
    if (!mv.ok) throw new Error(`post movements ${mv.status}: ${(await mv.text()).slice(0, 160)}`)
    const up = await db('/toast_sale_lines', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(upserts),
    })
    if (!up.ok) throw new Error(`upsert sale lines ${up.status}: ${(await up.text()).slice(0, 160)}`)
  }

  return result
}

// ---- Watermark (poll cursor) ----
export async function getWatermark(key: string): Promise<string | null> {
  const r = await db(`/sync_state?key=eq.${key}&select=watermark`)
  if (!r.ok) return null
  const rows = (await r.json()) as { watermark: string | null }[]
  return rows[0]?.watermark ?? null
}

export async function setWatermark(key: string, iso: string) {
  await db('/sync_state', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, watermark: iso, updated_at: new Date().toISOString() }),
  })
}

// ---- Webhook signature (HMAC-SHA256 of body+timestamp, base64, header Toast-Signature) ----
export function verifyToastSignature(rawBody: string, timestamp: string, header: string | null): boolean {
  const secret = process.env.TOAST_WEBHOOK_SECRET
  if (!secret || !header) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody + timestamp).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
