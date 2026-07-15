import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component: middleware refreshes sessions instead.
          }
        },
      },
    }
  )
}

export type Profile = {
  id: string
  full_name: string
  role: 'admin' | 'staff' | 'vendor'
  vendor_id: string | null
  active: boolean
}

export async function getSessionProfile() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, vendor_id, active')
    .eq('id', user.id)
    .single()
  return { supabase, user, profile: profile as Profile | null }
}
