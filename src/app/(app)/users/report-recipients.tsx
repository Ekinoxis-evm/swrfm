'use client'

// Destinatarios del reporte nocturno del removal log — editable solo por el master admin.
// Reemplaza la env var REMOVAL_REPORT_TO: lo que hay aquí es la fuente de verdad del cron.

import { useState, useTransition } from 'react'

export default function ReportRecipients({
  initial,
  addRecipient,
  removeRecipient,
}: {
  initial: string[]
  addRecipient: (email: string) => Promise<{ error?: string }>
  removeRecipient: (email: string) => Promise<{ error?: string }>
}) {
  const [emails, setEmails] = useState<string[]>(initial)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function add() {
    const email = value.trim().toLowerCase()
    setError(null)
    if (!email) return
    startTransition(async () => {
      const { error } = await addRecipient(email)
      if (error) return setError(error)
      setEmails((prev) => (prev.includes(email) ? prev : [...prev, email].sort()))
      setValue('')
    })
  }

  function remove(email: string) {
    setError(null)
    startTransition(async () => {
      const { error } = await removeRecipient(email)
      if (error) return setError(error)
      setEmails((prev) => prev.filter((e) => e !== email))
    })
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-bold">Removal report recipients</h2>
      <p className="mb-4 mt-0.5 text-sm text-ink-3">
        Who gets the nightly removal-log email. Empty ⇒ the report is not sent.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-coral bg-coral-soft px-3 py-2 text-sm font-semibold text-coral">
          {error}
        </p>
      )}

      <ul className="mb-4 space-y-2">
        {emails.map((email) => (
          <li
            key={email}
            className="flex items-center justify-between rounded-lg border border-line-2 bg-cream px-3 py-2"
          >
            <span className="text-sm font-semibold">{email}</span>
            <button
              onClick={() => remove(email)}
              disabled={pending}
              className="rounded-lg px-2 py-1 text-xs font-bold text-coral hover:bg-coral hover:text-white disabled:opacity-40"
            >
              Remove
            </button>
          </li>
        ))}
        {!emails.length && (
          <li className="rounded-lg border border-dashed border-line-2 px-3 py-3 text-center text-sm text-ink-3">
            No recipients yet — the nightly report will not be sent.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="name@example.com"
          className="min-w-0 flex-1 rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
        />
        <button
          onClick={add}
          disabled={pending || !value.trim()}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-bold text-cream active:scale-[0.98] disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </section>
  )
}
