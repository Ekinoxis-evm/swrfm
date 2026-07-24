// Toast catalog refresh — keeps the master's names/prices current from Toast Menus V2.
//
// Toast owns name + price (invariant 2), so this overwrites only those (plus adds items new
// to Toast); it never touches our own fields (vendor, category, barcode, cooler_relevant).
// It polls /menus/v2/metadata and re-fetches the menu only when `lastUpdated` changed. It does
// NOT auto-archive items missing from the menu — that stays with the manual 3-source
// reconciliation script, which cross-checks before archiving. Records each run in `sync_state`
// so the dashboard can show a real "last synced" time. Server-only.

import { toastToken } from '@/lib/toast-sales'

if (typeof window !== 'undefined') {
  throw new Error('toast-catalog.ts is server-only and must never be imported client-side')
}

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

type Live = { name: string; price: number | null; group: string }

// Walk the Menus V2 tree (menus → menuGroups → menuItems, nested groups) into guid → item.
function walkLive(menusDoc: {
  menus?: { name?: string; menuGroups?: MenuGroup[] }[]
}): Map<string, Live> {
  const live = new Map<string, Live>()
  const walk = (groups: MenuGroup[] | undefined, path: string[]) => {
    for (const g of groups ?? []) {
      const here = [...path, g.name ?? '']
      for (const it of g.menuItems ?? []) {
        if (it.guid && !live.has(it.guid)) {
          live.set(it.guid, { name: it.name ?? '', price: it.price ?? null, group: here.join(' > ') })
        }
      }
      walk(g.menuGroups, here)
    }
  }
  for (const m of menusDoc.menus ?? []) walk(m.menuGroups, [])
  return live
}
type MenuItem = { guid?: string; name?: string; price?: number | null }
type MenuGroup = { name?: string; menuItems?: MenuItem[]; menuGroups?: MenuGroup[] }

async function currentProducts(): Promise<Map<string, { name: string; price_cents: number | null }>> {
  const out = new Map<string, { name: string; price_cents: number | null }>()
  for (let from = 0; ; from += 1000) {
    const r = await db('/products?select=toast_guid,name,price_cents&order=toast_guid', {
      headers: { Range: `${from}-${from + 999}` },
    })
    if (!r.ok) throw new Error(`load products ${r.status}`)
    const page = (await r.json()) as { toast_guid: string; name: string; price_cents: number | null }[]
    for (const p of page) out.set(p.toast_guid, { name: p.name, price_cents: p.price_cents })
    if (page.length < 1000) break
  }
  return out
}

async function getState(key: string): Promise<string | null> {
  const r = await db(`/sync_state?key=eq.${key}&select=watermark`)
  if (!r.ok) return null
  const rows = (await r.json()) as { watermark: string | null }[]
  return rows[0]?.watermark ?? null
}
async function setState(key: string, iso: string) {
  await db('/sync_state', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, watermark: iso, updated_at: new Date().toISOString() }),
  })
}

const cents = (p: number | null) => (p != null ? Math.round(Number(p) * 100) : null)

export type CatalogSyncResult = {
  liveItems: number
  added: number
  updated: number
  skipped?: boolean
  lastUpdated: string | null
}

/** Refresh names/prices from Toast Menus V2. `force` bypasses the metadata-unchanged skip. */
export async function syncCatalogFromToast(opts: { force?: boolean } = {}): Promise<CatalogSyncResult> {
  const host = process.env.TOAST_API_HOST
  const token = await toastToken()
  const H = {
    Authorization: `Bearer ${token}`,
    'Toast-Restaurant-External-ID': process.env.TOAST_RESTAURANT_GUID as string,
  }

  const metaRes = await fetch(`${host}/menus/v2/metadata`, { headers: H, cache: 'no-store' })
  if (!metaRes.ok) throw new Error(`menus/metadata ${metaRes.status}`)
  const lastUpdated: string | null = (await metaRes.json())?.lastUpdated ?? null

  const now = new Date().toISOString()
  const seen = await getState('toast_catalog_meta')
  if (!opts.force && lastUpdated && seen === lastUpdated) {
    await setState('toast_catalog', now) // record that we checked
    return { liveItems: 0, added: 0, updated: 0, skipped: true, lastUpdated }
  }

  const menusRes = await fetch(`${host}/menus/v2/menus`, { headers: H, cache: 'no-store' })
  if (!menusRes.ok) throw new Error(`menus ${menusRes.status}`)
  const live = walkLive(await menusRes.json())
  const db0 = await currentProducts()

  const added: Record<string, unknown>[] = []
  const updated: Record<string, unknown>[] = []
  for (const [guid, l] of live) {
    const existing = db0.get(guid)
    const priceCents = cents(l.price)
    if (!existing) {
      added.push({
        toast_guid: guid,
        name: l.name,
        price_cents: priceCents,
        category: l.group || null,
        synced_at: now,
        active: true,
      })
    } else {
      const nameChanged = l.name && l.name.trim() !== (existing.name ?? '').trim()
      const priceChanged = priceCents != null && priceCents !== existing.price_cents
      if (nameChanged || priceChanged) {
        updated.push({ toast_guid: guid, name: l.name, price_cents: priceCents ?? existing.price_cents, synced_at: now })
      }
    }
  }

  for (const [label, rows] of [['added', added], ['updated', updated]] as const) {
    for (let i = 0; i < rows.length; i += 100) {
      const r = await db('/products?on_conflict=toast_guid', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows.slice(i, i + 100)),
      })
      if (!r.ok) throw new Error(`upsert ${label} ${r.status}: ${(await r.text()).slice(0, 160)}`)
    }
  }

  await setState('toast_catalog', now)
  if (lastUpdated) await setState('toast_catalog_meta', lastUpdated)

  return { liveItems: live.size, added: added.length, updated: updated.length, lastUpdated }
}
