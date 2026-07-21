import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSessionProfile } from '@/lib/supabase/server'
import { adminConfigured, createAuthUser, listAuthUsers, SERVICE_KEY_MISSING } from '@/lib/supabase/admin'
import UsersClient, { type UserRow } from './users-client'

export const dynamic = 'force-dynamic'

type Role = 'admin' | 'staff' | 'vendor'

// Readable temp password: 3 blocks of 4 chars, no ambiguous characters (0/O, 1/l/I).
function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const block = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((x) => alphabet[x % alphabet.length])
      .join('')
  return `${block(4)}-${block(4)}-${block(4)}`
}

async function requireAdmin() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role !== 'admin') return { supabase, admin: null }
  return { supabase, admin: profile }
}

export default async function UsersPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/')

  async function createUser(input: {
    fullName: string
    email: string
    role: Role
    vendorId: string | null
  }): Promise<{ error?: string; tempPassword?: string }> {
    'use server'
    const { supabase, admin } = await requireAdmin()
    if (!admin) return { error: 'Not authorized' }

    const fullName = input.fullName.trim()
    const email = input.email.trim().toLowerCase()
    if (!fullName || !email) return { error: 'Full name and email are required' }
    if (!['admin', 'staff', 'vendor'].includes(input.role)) return { error: 'Invalid role' }
    if (input.role === 'vendor' && !input.vendorId)
      return { error: 'Pick a vendor for vendor accounts' }
    if (!adminConfigured()) return { error: SERVICE_KEY_MISSING }

    const tempPassword = generateTempPassword()
    const created = await createAuthUser({ email, password: tempPassword, fullName })
    if (created.error !== null) return { error: created.error }

    // A DB trigger may or may not create the profile row — upsert covers both.
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: created.data.id,
      full_name: fullName,
      role: input.role,
      vendor_id: input.role === 'vendor' ? input.vendorId : null,
      active: true,
    })
    if (profileError) return { error: `User created but profile failed: ${profileError.message}` }

    revalidatePath('/users')
    return { tempPassword }
  }

  async function updateUser(
    id: string,
    patch: { role?: Role; vendor_id?: string | null; active?: boolean }
  ): Promise<{ error?: string }> {
    'use server'
    const { supabase, admin } = await requireAdmin()
    if (!admin) return { error: 'Not authorized' }
    if (id === admin.id && (patch.active === false || (patch.role && patch.role !== 'admin')))
      return { error: 'You cannot deactivate or demote your own account' }
    if (patch.role && !['admin', 'staff', 'vendor'].includes(patch.role))
      return { error: 'Invalid role' }
    if (patch.role && patch.role !== 'vendor') patch.vendor_id = null

    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/users')
    return {}
  }

  const [{ data: profiles }, { data: vendors }, authUsers] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, vendor_id, active').order('full_name'),
    supabase.from('vendors').select('id, name').eq('active', true).order('name'),
    listAuthUsers(),
  ])

  const authById = new Map((authUsers.data ?? []).map((u) => [u.id, u]))
  const rows: UserRow[] = (profiles ?? []).map((p) => ({
    ...p,
    email: authById.get(p.id)?.email ?? null,
    created_at: authById.get(p.id)?.created_at?.slice(0, 10) ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Users</h1>
        <p className="text-sm text-ink-3">
          {rows.length} accounts — manage roles and access. Temp passwords are shown once.
        </p>
      </div>
      <UsersClient
        rows={rows}
        vendors={vendors ?? []}
        meId={profile.id}
        adminApiError={authUsers.error}
        createUser={createUser}
        updateUser={updateUser}
      />
    </div>
  )
}
