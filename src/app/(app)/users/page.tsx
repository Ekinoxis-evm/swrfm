import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSessionProfile } from '@/lib/supabase/server'
import { adminConfigured, createAuthUser, listAuthUsers, SERVICE_KEY_MISSING } from '@/lib/supabase/admin'
import UsersClient, { type UserRow } from './users-client'
import ReportRecipients from './report-recipients'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const dynamic = 'force-dynamic'

type Role = 'admin' | 'staff' | 'vendor'

const MASTER_MIGRATION_MISSING =
  'Run migration 20260722_profiles_is_master.sql to enable master admins'

// Readable temp password: 3 blocks of 4 chars, no ambiguous characters (0/O, 1/l/I).
function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const block = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((x) => alphabet[x % alphabet.length])
      .join('')
  return `${block(4)}-${block(4)}-${block(4)}`
}

function isMissingMasterColumn(error: { code?: string; message: string } | null) {
  return Boolean(error && error.code === '42703' && error.message.includes('is_master'))
}

async function requireAdmin() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role !== 'admin') return { supabase, admin: null }
  // is_master is fetched separately so the app tolerates the column not
  // existing yet — pre-migration everyone is treated as non-master.
  const { data } = await supabase
    .from('profiles')
    .select('is_master')
    .eq('id', profile.id)
    .single()
  return { supabase, admin: { ...profile, is_master: Boolean(data?.is_master) } }
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
    isMaster?: boolean
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
    // Master-only territory: creating admin (or master) accounts.
    if (input.role === 'admin' && !admin.is_master)
      return { error: 'Only a master admin can create admin accounts' }
    if (input.isMaster && (!admin.is_master || input.role !== 'admin'))
      return { error: 'Only a master admin can create master admin accounts' }
    if (!adminConfigured()) return { error: SERVICE_KEY_MISSING }

    const tempPassword = generateTempPassword()
    const created = await createAuthUser({ email, password: tempPassword, fullName })
    if (created.error !== null) return { error: created.error }

    // A DB trigger may or may not create the profile row — upsert covers both.
    const payload: Record<string, unknown> = {
      id: created.data.id,
      full_name: fullName,
      role: input.role,
      vendor_id: input.role === 'vendor' ? input.vendorId : null,
      active: true,
    }
    if (input.isMaster) payload.is_master = true
    const { error: profileError } = await supabase.from('profiles').upsert(payload)
    if (profileError) {
      if (isMissingMasterColumn(profileError)) return { error: MASTER_MIGRATION_MISSING }
      return { error: `User created but profile failed: ${profileError.message}` }
    }

    revalidatePath('/users')
    return { tempPassword }
  }

  async function updateUser(
    id: string,
    patch: { role?: Role; vendor_id?: string | null; active?: boolean; is_master?: boolean }
  ): Promise<{ error?: string }> {
    'use server'
    const { supabase, admin } = await requireAdmin()
    if (!admin) return { error: 'Not authorized' }
    if (patch.role && !['admin', 'staff', 'vendor'].includes(patch.role))
      return { error: 'Invalid role' }

    const { data: target } = await supabase.from('profiles').select('role').eq('id', id).single()
    if (!target) return { error: 'User not found' }

    // Master-only territory: anything touching admin accounts or the master flag.
    if (!admin.is_master) {
      if (target.role === 'admin')
        return { error: 'Only a master admin can manage admin accounts' }
      if (patch.role === 'admin') return { error: 'Only a master admin can grant the admin role' }
      if (patch.is_master !== undefined)
        return { error: 'Only a master admin can change master status' }
    }

    // Self-protection: never demote, deactivate, or un-master yourself.
    if (
      id === admin.id &&
      (patch.active === false ||
        (patch.role && patch.role !== 'admin') ||
        patch.is_master === false)
    )
      return {
        error: 'You cannot deactivate, demote, or remove master status from your own account',
      }

    if (patch.role && patch.role !== 'vendor') patch.vendor_id = null
    // Dropping the admin role always drops the master flag with it.
    if (patch.role && patch.role !== 'admin' && admin.is_master) patch.is_master = false

    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) {
      if (isMissingMasterColumn(error)) return { error: MASTER_MIGRATION_MISSING }
      return { error: error.message }
    }
    revalidatePath('/users')
    return {}
  }

  async function addRecipient(email: string): Promise<{ error?: string }> {
    'use server'
    const { supabase, admin } = await requireAdmin()
    if (!admin?.is_master) return { error: 'Only a master admin can manage recipients' }
    const clean = email.trim().toLowerCase()
    if (!EMAIL_RE.test(clean)) return { error: 'Enter a valid email address' }
    // RLS (is_master) es la barrera real; el chequeo de arriba solo da mejor mensaje.
    const { error } = await supabase
      .from('removal_report_recipients')
      .upsert({ email: clean, added_by: admin.id })
    if (error) return { error: error.message }
    revalidatePath('/users')
    return {}
  }

  async function removeRecipient(email: string): Promise<{ error?: string }> {
    'use server'
    const { supabase, admin } = await requireAdmin()
    if (!admin?.is_master) return { error: 'Only a master admin can manage recipients' }
    const { error } = await supabase
      .from('removal_report_recipients')
      .delete()
      .eq('email', email.trim().toLowerCase())
    if (error) return { error: error.message }
    revalidatePath('/users')
    return {}
  }

  // Tolerate the is_master column not existing yet: fall back to a select
  // without it and treat everyone as non-master.
  let masterColumnMissing = false
  let profilesData: Omit<UserRow, 'email' | 'created_at'>[] = []
  const withMaster = await supabase
    .from('profiles')
    .select('id, full_name, role, vendor_id, active, is_master')
    .order('full_name')
  if (withMaster.error) {
    masterColumnMissing = true
    const { data: fallback } = await supabase
      .from('profiles')
      .select('id, full_name, role, vendor_id, active')
      .order('full_name')
    profilesData = (fallback ?? []).map((p) => ({ ...p, is_master: false }))
  } else {
    profilesData = (withMaster.data ?? []).map((p) => ({ ...p, is_master: Boolean(p.is_master) }))
  }

  const [{ data: vendors }, authUsers] = await Promise.all([
    supabase.from('vendors').select('id, name').eq('active', true).order('name'),
    listAuthUsers(),
  ])

  const authById = new Map((authUsers.data ?? []).map((u) => [u.id, u]))
  const rows: UserRow[] = profilesData.map((p) => ({
    ...p,
    email: authById.get(p.id)?.email ?? null,
    created_at: authById.get(p.id)?.created_at?.slice(0, 10) ?? null,
  }))

  const meIsMaster =
    !masterColumnMissing && Boolean(rows.find((r) => r.id === profile.id)?.is_master)

  // La lista de destinatarios solo la ve/edita el master (la RLS lo respalda).
  let recipients: string[] = []
  if (meIsMaster) {
    const { data } = await supabase
      .from('removal_report_recipients')
      .select('email')
      .order('email')
    recipients = (data ?? []).map((r) => r.email)
  }

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
        meIsMaster={meIsMaster}
        masterColumnMissing={masterColumnMissing}
        adminApiError={authUsers.error}
        createUser={createUser}
        updateUser={updateUser}
      />
      {meIsMaster && (
        <ReportRecipients
          initial={recipients}
          addRecipient={addRecipient}
          removeRecipient={removeRecipient}
        />
      )}
    </div>
  )
}
