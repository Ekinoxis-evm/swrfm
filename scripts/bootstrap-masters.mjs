// Bootstrap the master admin accounts (idempotent).
// Zero dependencies — uses Node's built-in fetch against the Supabase
// Auth Admin REST + PostgREST with the service role key.
//
//   node scripts/bootstrap-masters.mjs
//
// For each master email: creates the auth user if it does not exist
// (temp password printed ONCE — share securely) and upserts the profiles
// row with role 'admin' + is_master true. Existing users keep their
// password untouched. Requires migration 20260722_profiles_is_master.sql.

import { readFileSync } from 'node:fs'
import { webcrypto as crypto } from 'node:crypto'

const envFile = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const env = { ...envFile, ...process.env }
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL not configured — add it to .env.local')
  process.exit(1)
}
if (!SERVICE) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not configured — add it to .env.local')
  console.error('(Supabase Dashboard > Settings > API. NEVER expose client-side.)')
  process.exit(1)
}

const MASTERS = [
  { email: 'ruben@swrfmarket.com', fullName: 'Ruben Dario Hernandez' },
  { email: 'hola@ekinoxis.xyz', fullName: 'Ekinoxis (William)' },
]

const headers = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
}

// Readable temp password: 3 blocks of 4 chars, no ambiguous characters.
function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const block = (n) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((x) => alphabet[x % alphabet.length])
      .join('')
  return `${block(4)}-${block(4)}-${block(4)}`
}

async function fail(res, what) {
  console.error(`${what} failed (${res.status}): ${await res.text()}`)
  process.exit(1)
}

// Existing auth users, matched by email (case-insensitive).
const listRes = await fetch(`${URL_BASE}/auth/v1/admin/users?page=1&per_page=1000`, { headers })
if (!listRes.ok) await fail(listRes, 'listing auth users')
const { users: existing = [] } = await listRes.json()
const byEmail = new Map(existing.map((u) => [String(u.email ?? '').toLowerCase(), u]))

for (const master of MASTERS) {
  let user = byEmail.get(master.email)

  if (user) {
    console.log(`✓ ${master.email} already exists (${user.id}) — password unchanged`)
  } else {
    const tempPassword = generateTempPassword()
    const createRes = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: master.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: master.fullName },
      }),
    })
    if (!createRes.ok) await fail(createRes, `creating ${master.email}`)
    user = await createRes.json()
    console.log(`✓ ${master.email} created (${user.id})`)
    console.log(`  TEMP PASSWORD (shown once, share securely): ${tempPassword}`)
    console.log('  The user should change it after first login (Account page).')
  }

  // Ensure the profile row: role admin + master flag, active.
  const upsertRes = await fetch(`${URL_BASE}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([
      {
        id: user.id,
        full_name: master.fullName,
        role: 'admin',
        is_master: true,
        vendor_id: null,
        active: true,
      },
    ]),
  })
  if (!upsertRes.ok) {
    const text = await upsertRes.text()
    if (text.includes('is_master')) {
      console.error(
        `profile upsert for ${master.email} failed — run migration 20260722_profiles_is_master.sql first`
      )
    } else {
      console.error(`profile upsert for ${master.email} failed (${upsertRes.status}): ${text}`)
    }
    process.exit(1)
  }
  console.log(`  profile ensured: role=admin, is_master=true, active=true`)
}

console.log('Done — master admins bootstrapped.')
