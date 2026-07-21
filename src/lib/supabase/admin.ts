// Server-only helper for the Supabase Auth Admin REST API.
// Zero dependencies — plain fetch, same style as scripts/. Uses the
// SUPABASE_SERVICE_ROLE_KEY, which must NEVER reach the client bundle.

if (typeof window !== 'undefined') {
  throw new Error('supabase/admin.ts is server-only and must never be imported client-side')
}

export const SERVICE_KEY_MISSING =
  'SUPABASE_SERVICE_ROLE_KEY not configured — add it to .env.local and Vercel'

export function adminConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export type AuthAdminUser = {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
}

type AdminResult<T> = { data: T; error: null } | { data: null; error: string }

async function adminFetch<T>(path: string, init?: RequestInit): Promise<AdminResult<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return { data: null, error: SERVICE_KEY_MISSING }
  if (!url) return { data: null, error: 'NEXT_PUBLIC_SUPABASE_URL not configured' }

  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      cache: 'no-store',
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        body?.msg || body?.message || body?.error_description || `Auth admin error ${res.status}`
      return { data: null, error: String(msg) }
    }
    return { data: body as T, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Auth admin request failed' }
  }
}

/** List all auth users (id, email, created_at). */
export async function listAuthUsers(): Promise<AdminResult<AuthAdminUser[]>> {
  const result = await adminFetch<{ users: AuthAdminUser[] }>(
    '/auth/v1/admin/users?page=1&per_page=1000'
  )
  if (result.error !== null) return result
  return { data: result.data.users ?? [], error: null }
}

/** Create an auth user with a confirmed email so they can sign in immediately. */
export async function createAuthUser(input: {
  email: string
  password: string
  fullName: string
}): Promise<AdminResult<AuthAdminUser>> {
  return adminFetch<AuthAdminUser>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    }),
  })
}

/** Update an auth user (e.g. reset password, change email). */
export async function updateAuthUser(
  id: string,
  patch: Record<string, unknown>
): Promise<AdminResult<AuthAdminUser>> {
  return adminFetch<AuthAdminUser>(`/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}
