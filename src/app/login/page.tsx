'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DEMO_ACCOUNTS = [
  { label: 'Admin — Ruben', email: 'admin.ruben@demo.swrfm.app', tone: 'bg-brand text-white' },
  { label: 'Admin — Keiry', email: 'admin.keiry@demo.swrfm.app', tone: 'bg-brand text-white' },
  { label: 'Staff — Sergio', email: 'staff.sergio@demo.swrfm.app', tone: 'bg-pine text-white' },
  { label: 'Vendor — Florida Fresh', email: 'vendor.ffm@demo.swrfm.app', tone: 'bg-sea text-white' },
]

const DEMO_PASSWORD = 'SwrDemo2026!'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: string, p: string) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p })
    if (error) {
      setError(error.message)
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
            SWR <span className="text-brand">//</span> Inventory
          </div>
          <div className="mt-1 text-sm text-ink-3">Southwest Ranches Farmers Market</div>
        </div>

        <form
          className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault()
            signIn(email, password)
          }}
        >
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
            Email
          </label>
          <input
            type="email"
            required
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

        <div className="mt-6 rounded-2xl border border-dashed border-line-2 p-4">
          <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-ink-3">
            Demo accounts — one tap
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                disabled={busy}
                onClick={() => signIn(a.email, DEMO_PASSWORD)}
                className={`rounded-lg px-3 py-2.5 text-xs font-bold transition active:scale-[0.97] disabled:opacity-50 ${a.tone}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
