// Seed the master catalog into Supabase from a Toast catalog export.
// The catalog JSON is client business data and lives OUTSIDE this repo —
// pass its path as the first argument. Auth: demo admin via RLS (no service key).
//
//   node scripts/seed-catalog.mjs ../swarm_buildapp/catalog_v1.json

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const envFile = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const env = { ...envFile, ...process.env }

const catalogPath = process.argv[2]
if (!catalogPath) {
  console.error('Usage: node scripts/seed-catalog.mjs <path-to-catalog_v1.json>')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const { error: authError } = await supabase.auth.signInWithPassword({
  email: env.SEED_ADMIN_EMAIL,
  password: env.SEED_ADMIN_PASSWORD,
})
if (authError) throw authError

const { catalog, _meta } = JSON.parse(readFileSync(catalogPath, 'utf8'))
console.log(`Catalog ${_meta?.version ?? '?'} — ${catalog.length} items`)

const { data: vendors, error: vendorsError } = await supabase.from('vendors').select('id, name')
if (vendorsError) throw vendorsError
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
  const { error } = await supabase.from('products').upsert(batch, { onConflict: 'toast_guid' })
  if (error) throw error
  done += batch.length
  console.log(`upserted ${done}/${rows.length}`)
}

const unmatched = rows.filter((r) => !r.vendor_id).length
console.log(`Done. ${unmatched} items without a vendor match (kept via vendor_name).`)
await supabase.auth.signOut()
