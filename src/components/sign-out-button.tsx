'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut()
        router.push('/login')
        router.refresh()
      }}
      className="rounded-lg border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-3 hover:bg-surface"
    >
      Sign out
    </button>
  )
}
