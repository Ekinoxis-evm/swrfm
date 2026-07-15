import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/supabase/server'

export default async function Home() {
  const { profile } = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role === 'vendor') redirect('/vendor')
  if (profile.role === 'admin') redirect('/dashboard')
  redirect('/receiving')
}
