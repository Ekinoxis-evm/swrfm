// Sync de catálogo Toast → informe de conciliación (y upsert opcional).
// Zero dependencias. SOLO LECTURA por defecto; escribe en Supabase solo con --apply.
//
//   node scripts/sync-toast-catalog.mjs ../catalog-v12-links.json            (dry-run + informe)
//   node scripts/sync-toast-catalog.mjs ../catalog-v12-links.json --apply    (además upserta productos)
//
// El informe se escribe FUERA del repo (junto al archivo de links) — contiene datos del negocio.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const envFile = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const env = { ...envFile, ...process.env }

const linksPath = process.argv[2]
const APPLY = process.argv.includes('--apply')
if (!linksPath) {
  console.error('Uso: node scripts/sync-toast-catalog.mjs <catalog-v12-links.json> [--apply]')
  process.exit(1)
}

// ---------- Toast: catálogo en vivo ----------
const login = await fetch(`${env.TOAST_API_HOST}/authentication/v1/authentication/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    clientId: env.TOAST_CLIENT_ID,
    clientSecret: env.TOAST_CLIENT_SECRET,
    userAccessType: 'TOAST_MACHINE_CLIENT',
  }),
})
if (!login.ok) throw new Error(`Toast login: ${login.status}`)
const { token } = await login.json()
const toastHeaders = {
  Authorization: `Bearer ${token.accessToken}`,
  'Toast-Restaurant-External-ID': env.TOAST_RESTAURANT_GUID,
}
const menusRes = await fetch(`${env.TOAST_API_HOST}/menus/v2/menus`, { headers: toastHeaders })
if (!menusRes.ok) throw new Error(`menus: ${menusRes.status}`)
const menusDoc = await menusRes.json()

const live = new Map() // guid -> {name, price, menu, group, visibility}
const walkGroups = (groups, menuName, path) => {
  for (const g of groups ?? []) {
    for (const it of g.menuItems ?? []) {
      if (it.guid && !live.has(it.guid))
        live.set(it.guid, {
          name: it.name,
          price: it.price ?? null,
          menu: menuName,
          group: [...path, g.name].join(' > '),
          visibility: (it.visibility ?? []).join(','),
        })
    }
    walkGroups(g.menuGroups, menuName, [...path, g.name])
  }
}
for (const m of menusDoc.menus ?? []) walkGroups(m.menuGroups, m.name, [])

// ---------- Supabase: master actual ----------
const sb = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
const auth = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { ...sb, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
})
if (!auth.ok) throw new Error(`supabase auth: ${await auth.text()}`)
const { access_token } = await auth.json()
const sbH = { ...sb, Authorization: `Bearer ${access_token}` }
const dbProducts = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?select=toast_guid,name,barcode,price_cents,shopify_handle&order=toast_guid`,
    { headers: { ...sbH, Range: `${from}-${from + 999}` } }
  )
  const page = await r.json()
  dbProducts.push(...page)
  if (page.length < 1000) break
}
const db = new Map(dbProducts.map((p) => [p.toast_guid, p]))

// ---------- v12 de Ruben ----------
const v12 = JSON.parse(readFileSync(linksPath, 'utf8'))
const v12Toast = new Map(v12.links.filter((l) => l['Toast GUID']).map((l) => [l['Toast GUID'], l]))

// ---------- Conciliación ----------
const liveGuids = new Set(live.keys())
const dbGuids = new Set(db.keys())
const v12Guids = new Set(v12Toast.keys())

const setDiff = (a, b) => [...a].filter((x) => !b.has(x))
const nuevosVsDb = setDiff(liveGuids, dbGuids)
const retiradosVsDb = setDiff(dbGuids, liveGuids)
const liveNoV12 = setDiff(liveGuids, v12Guids)
const v12NoLive = setDiff(v12Guids, liveGuids)

const renombrados = []
const precioCambiado = []
for (const [guid, p] of db) {
  const l = live.get(guid)
  if (!l) continue
  if (l.name && p.name && l.name.trim() !== p.name.trim()) renombrados.push({ guid, antes: p.name, ahora: l.name })
  const liveCents = l.price != null ? Math.round(Number(l.price) * 100) : null
  if (liveCents != null && p.price_cents != null && liveCents !== p.price_cents)
    precioCambiado.push({ guid, name: l.name, antes: p.price_cents, ahora: liveCents })
}

const dupNames = new Map()
for (const [guid, l] of live) {
  const k = (l.name ?? '').trim().toLowerCase()
  if (!dupNames.has(k)) dupNames.set(k, [])
  dupNames.get(k).push(guid)
}
const duplicados = [...dupNames.entries()].filter(([, g]) => g.length > 1)

const fmt = (list, f, max = 15) =>
  list.slice(0, max).map(f).join('\n') + (list.length > max ? `\n… y ${list.length - max} más` : '')

const today = new Date().toISOString().slice(0, 10)
const report = `# Conciliación de catálogo — ${today}

Fuentes: **API Toast en vivo** (${liveGuids.size} items) · **master del app** (${dbGuids.size}) · **v12 de Ruben** (${v12Guids.size} GUIDs, export 2026-07-19).

| Comparación | Resultado |
|---|---|
| Nuevos en Toast que el app no tiene | **${nuevosVsDb.length}** |
| En el app pero ya no en Toast (¿archivados?) | **${retiradosVsDb.length}** |
| Renombrados (mismo GUID, otro nombre) | **${renombrados.length}** |
| Cambios de precio | **${precioCambiado.length}** |
| En vivo pero no en el v12 de Ruben | **${liveNoV12.length}** |
| En el v12 pero ya no en vivo | **${v12NoLive.length}** |
| Nombres duplicados en vivo | **${duplicados.length}** |

## Nuevos en Toast (no están en el app)
${fmt(nuevosVsDb, (g) => `- ${live.get(g).name} — \`${g}\` (${live.get(g).group})`)}

## En el app pero ya no en Toast
${fmt(retiradosVsDb, (g) => `- ${db.get(g).name} — \`${g}\``)}

## Renombrados
${fmt(renombrados, (r) => `- \`${r.guid}\`: "${r.antes}" → "${r.ahora}"`)}

## Cambios de precio
${fmt(precioCambiado, (r) => `- ${r.name}: $${(r.antes / 100).toFixed(2)} → $${(r.ahora / 100).toFixed(2)}`)}

## En vivo, ausentes del v12 (posibles no-retail / nuevos post-export)
${fmt(liveNoV12, (g) => `- ${live.get(g).name} — \`${g}\` (${live.get(g).menu} > ${live.get(g).group})`)}

## Nombres duplicados en vivo
${fmt(duplicados, ([name, guids]) => `- "${name}" × ${guids.length}`)}

---
*Generado por scripts/sync-toast-catalog.mjs (solo lectura${APPLY ? ' + apply' : ''}).*
`
const reportPath = resolve(dirname(resolve(linksPath)), `CONCILIACION_CATALOGO_${today}.md`)
writeFileSync(reportPath, report)

console.log(`Toast en vivo: ${liveGuids.size} · App: ${dbGuids.size} · v12: ${v12Guids.size}`)
console.log(
  `Nuevos: ${nuevosVsDb.length} · Retirados: ${retiradosVsDb.length} · Renombrados: ${renombrados.length} · Precios: ${precioCambiado.length} · Duplicados: ${duplicados.length}`
)
console.log(`Informe → ${reportPath}`)

// ---------- Apply (opcional): upsert nuevos + actualizar renombrados/precios ----------
if (APPLY) {
  // Filas con llaves UNIFORMES por lote (requisito de PostgREST).
  const cents = (p) => (p != null ? Math.round(Number(p) * 100) : null)
  const nuevos = nuevosVsDb.map((g) => ({
    toast_guid: g,
    name: live.get(g).name,
    price_cents: cents(live.get(g).price),
    category: live.get(g).group || null,
  }))
  const cambiadosGuids = new Set([...renombrados.map((r) => r.guid), ...precioCambiado.map((r) => r.guid)])
  const cambiados = [...cambiadosGuids].map((g) => ({
    toast_guid: g,
    name: live.get(g).name,
    price_cents: cents(live.get(g).price) ?? db.get(g).price_cents,
  }))
  for (const [label, rows] of [['nuevos', nuevos], ['cambiados', cambiados]]) {
    console.log(`Aplicando ${rows.length} ${label}…`)
    for (let i = 0; i < rows.length; i += 100) {
      const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?on_conflict=toast_guid`, {
        method: 'POST',
        headers: { ...sbH, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows.slice(i, i + 100)),
      })
      if (!r.ok) throw new Error(`upsert ${label}: ${r.status} ${await r.text()}`)
    }
  }
  console.log('✅ Master actualizado desde Toast.')
}
