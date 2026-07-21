'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AccountPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-bold">Account</h1>
        <p className="text-sm text-ink-3">Change the password you use to sign in.</p>
      </div>

      <form
        onSubmit={changePassword}
        className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
      >
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
          New password
        </label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
          placeholder="At least 8 characters"
        />
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
          Confirm new password
        </label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mb-5 w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
          placeholder="Repeat the new password"
        />
        {error && <p className="mb-4 text-sm font-semibold text-coral">{error}</p>}
        {done && (
          <p className="mb-4 text-sm font-semibold text-pine">Password updated successfully.</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-ink py-3 font-bold text-cream transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
