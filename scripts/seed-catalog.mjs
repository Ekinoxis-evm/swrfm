// Seed the master catalog into Supabase from a Toast catalog export.
// Zero dependencies — uses Node's built-in fetch against Supabase REST.
// The catalog JSON is client business data and lives OUTSIDE this repo.
//
//   node scripts/seed-catalog.mjs ../swarm_buildapp/catalog_v1.json

import { readFileSync } from 'node:fs'

const envFile = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const env = { ...envFile, ...process.env }
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const catalogPath = process.argv[2]
if (!catalogPath) {
  console.error('Usage: node scripts/seed-catalog.mjs <path-to-catalog_v1.json>')
  process.exit(1)
}

// Sign in as the demo admin (RLS lets admins write products — no service key).
const authRes = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
})
if (!authRes.ok) throw new Error(`auth failed: ${await authRes.text()}`)
const { access_token } = await authRes.json()
const headers = {
  apikey: ANON,
  Authorization: `Bearer ${access_token}`,
  'Content-Type': 'application/json',
}

const { catalog, _meta } = JSON.parse(readFileSync(catalogPath, 'utf8'))
console.log(`Catalog ${_meta?.version ?? '?'} — ${catalog.length} items`)

const vendorsRes = await fetch(`${URL_BASE}/rest/v1/vendors?select=id,name&limit=500`, { headers })
const vendors = await vendorsRes.json()
const vendorId = new Map(vendors.map((v) => [v.name, v.id]))

const priceCents = (p) => {
  const n = Number(String(p ?? '').replace(/[$,]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const rows = catalog.map((it) => ({
  toast_guid: it.toast_guid,
  name: it.name,
  vendor_id: vendorId.get((it.vendor ?? '').trim()) ?? null,
  vendor_name: (it.vendor ?? '').trim() || null,
  category: it.category || null,
  barcode: it.barcode || null,
  price_cents: priceCents(it.price),
  cooler_relevant: !!it.cooler_relevant,
  shopify_handle: it.shopify_handle || null,
  shopify_match: it.shopify_match || null,
}))

let done = 0
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500)
  const res = await fetch(`${URL_BASE}/rest/v1/products?on_conflict=toast_guid`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(batch),
  })
  if (!res.ok) throw new Error(`upsert failed: ${await res.text()}`)
  done += batch.length
  console.log(`upserted ${done}/${rows.length}`)
}

const unmatched = rows.filter((r) => !r.vendor_id).length
console.log(`Done. ${unmatched} items without a vendor match (kept via vendor_name).`)
