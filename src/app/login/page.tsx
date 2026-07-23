'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

type Mode = 'code' | 'password'

const inputClass =
  'w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand'
const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3'

// Block deactivated accounts before they reach the app. Shared by both the
// password and the email-code sign-in paths. Returns an error message or null.
async function inactiveCheck(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('active')
    .eq('id', userId)
    .single()
  if (profile && profile.active === false) {
    await supabase.auth.signOut()
    return 'Your account is inactive — contact an administrator'
  }
  return null
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('code')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
    setCode('')
    setCodeSent(false)
  }

  async function enterApp(supabase: SupabaseClient, userId: string) {
    const inactive = await inactiveCheck(supabase, userId)
    if (inactive) {
      setError(inactive)
      setBusy(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  async function signInWithPassword(e: React.FormEvent) {
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
    await enterApp(supabase, data.user.id)
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    const supabase = createClient()
    // shouldCreateUser: false — only accounts created by an admin may log in.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    if (otpError) {
      if (otpError.status === 429 || /rate limit/i.test(otpError.message)) {
        setError('Email limit reached — try the password option or wait a few minutes.')
        setBusy(false)
        return
      }
      // Unknown email (signups are disabled for OTP). Show the same neutral
      // message as a successful send so account existence is not revealed.
      if (/signup/i.test(otpError.message) || /not allowed/i.test(otpError.message)) {
        setNotice('If this account exists, a code was sent.')
        setCodeSent(true)
        setBusy(false)
        return
      }
      setError(otpError.message)
      setBusy(false)
      return
    }
    setNotice('If this account exists, a code was sent.')
    setCodeSent(true)
    setBusy(false)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    if (verifyError || !data.user) {
      setError(
        verifyError && /rate limit/i.test(verifyError.message)
          ? 'Email limit reached — try the password option or wait a few minutes.'
          : 'Invalid or expired code — request a new one.'
      )
      setBusy(false)
      return
    }
    await enterApp(supabase, data.user.id)
  }

  const toggleButton = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
      active ? 'bg-ink text-cream' : 'bg-surface-2 text-ink-3 hover:text-ink-2'
    }`

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/swrfm-logo.png"
            alt="Southwest Ranches Farmers Market"
            width={64}
            height={61}
            className="mx-auto mb-3 h-16 w-auto"
            priority
          />
          <div className="text-2xl font-bold tracking-tight">SWRFM Master</div>
          <div className="mt-1 text-sm text-ink-3">Southwest Ranches Farmers Market</div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="mb-5 flex gap-1.5 rounded-xl bg-surface-2 p-1">
            <button type="button" onClick={() => switchMode('code')} className={toggleButton(mode === 'code')}>
              Email me a code
            </button>
            <button
              type="button"
              onClick={() => switchMode('password')}
              className={toggleButton(mode === 'password')}
            >
              Password
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={signInWithPassword}>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} mb-4`}
                placeholder="you@swrfmarket.com"
              />
              <label className={labelClass}>Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} mb-5`}
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
          ) : !codeSent ? (
            <form onSubmit={sendCode}>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} mb-5`}
                placeholder="you@swrfmarket.com"
              />
              {error && <p className="mb-4 text-sm font-semibold text-coral">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-ink py-3 font-bold text-cream transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              {notice && <p className="mb-4 text-sm text-ink-2">{notice}</p>}
              <label className={labelClass}>6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} mb-5 text-center text-xl font-bold tracking-[0.4em]`}
                placeholder="••••••"
              />
              {error && <p className="mb-4 text-sm font-semibold text-coral">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full rounded-lg bg-ink py-3 font-bold text-cream transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeSent(false)
                  setCode('')
                  setNotice(null)
                  setError(null)
                }}
                className="mt-3 w-full text-center text-xs font-semibold text-sea hover:underline"
              >
                Use a different email or resend the code
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-3">
          Access is by invitation only. Contact an administrator if you need an account.
        </p>
      </div>
    </main>
  )
}
