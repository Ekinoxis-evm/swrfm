'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Invalid email or password'
          : authError.message
      )
      setBusy(false)
      return
    }
    // Block deactivated accounts before they reach the app.
    const { data: profile } = await supabase
      .from('profiles')
      .select('active')
      .eq('id', data.user.id)
      .single()
    if (profile && profile.active === false) {
      await supabase.auth.signOut()
      setError('Your account is inactive — contact an administrator')
      setBusy(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold tracking-tight">
            SWR <span className="text-brand">{'//'}</span> Cooler System
          </div>
          <div className="mt-1 text-sm text-ink-3">Southwest Ranches Farmers Market</div>
        </div>

        <form className="rounded-2xl border border-line bg-surface p-6 shadow-sm" onSubmit={signIn}>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
            placeholder="you@swrfmarket.com"
          />
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Password
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-5 w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
            placeholder="••••••••"
          />
          {error && <p className="mb-4 text-sm font-semibold text-coral">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-ink py-3 font-bold text-cream transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-3">
          Access is by invitation only. Contact an administrator if you need an account.
        </p>
      </div>
    </main>
  )
}
