'use client'

import { useState, useTransition } from 'react'

type Role = 'admin' | 'staff' | 'vendor'

export type UserRow = {
  id: string
  full_name: string
  role: Role
  vendor_id: string | null
  active: boolean
  email: string | null
  created_at: string | null
}

type Vendor = { id: string; name: string }

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-brand-soft text-brand',
  staff: 'bg-pine-soft text-pine',
  vendor: 'bg-sea-soft text-sea',
}

export default function UsersClient({
  rows,
  vendors,
  meId,
  adminApiError,
  createUser,
  updateUser,
}: {
  rows: UserRow[]
  vendors: Vendor[]
  meId: string
  adminApiError: string | null
  createUser: (input: {
    fullName: string
    email: string
    role: Role
    vendorId: string | null
  }) => Promise<{ error?: string; tempPassword?: string }>
  updateUser: (
    id: string,
    patch: { role?: Role; vendor_id?: string | null; active?: boolean }
  ) => Promise<{ error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [rowError, setRowError] = useState<string | null>(null)
  const [pickingVendorFor, setPickingVendorFor] = useState<string | null>(null)

  // Add-user form state
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [vendorId, setVendorId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function applyUpdate(id: string, patch: { role?: Role; vendor_id?: string | null; active?: boolean }) {
    setRowError(null)
    startTransition(async () => {
      const res = await updateUser(id, patch)
      if (res.error) setRowError(res.error)
    })
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const res = await createUser({
        fullName,
        email,
        role,
        vendorId: role === 'vendor' ? vendorId || null : null,
      })
      if (res.error) {
        setFormError(res.error)
        return
      }
      setCreated({ email: email.trim().toLowerCase(), tempPassword: res.tempPassword! })
      setShowForm(false)
      setFullName('')
      setEmail('')
      setRole('staff')
      setVendorId('')
    })
  }

  async function copyPassword() {
    if (!created) return
    await navigator.clipboard.writeText(created.tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      {adminApiError && (
        <div className="rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
          {adminApiError} — emails and new accounts are unavailable until it is set.
        </div>
      )}

      {created && (
        <div className="rounded-2xl border border-pine/40 bg-pine-soft px-4 py-4">
          <p className="text-sm font-bold text-pine">Account created for {created.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-line-2 bg-surface px-3 py-1.5 font-mono text-sm font-bold">
              {created.tempPassword}
            </code>
            <button
              onClick={copyPassword}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-cream"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              onClick={() => setCreated(null)}
              className="rounded-lg border border-line-2 bg-surface px-3 py-1.5 text-xs font-bold text-ink-3"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            This temporary password is shown only once. Share securely; the user should change it
            after first login (Account page).
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => {
            setShowForm((s) => !s)
            setFormError(null)
          }}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-bold text-cream transition active:scale-[0.98]"
        >
          {showForm ? 'Cancel' : '＋ Add user'}
        </button>
        {rowError && <p className="text-sm font-semibold text-coral">{rowError}</p>}
      </div>

      {showForm && (
        <form
          onSubmit={submitCreate}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
                Full name
              </label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
                placeholder="jane@swrfmarket.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
            {role === 'vendor' && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3">
                  Vendor
                </label>
                <select
                  required
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full rounded-lg border border-line-2 bg-cream px-3 py-2.5 outline-none focus:border-brand"
                >
                  <option value="">Pick a vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {formError && <p className="mt-3 text-sm font-semibold text-coral">{formError}</p>}
          <button
            type="submit"
            disabled={pending}
            className="mt-4 rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-cream transition active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create user'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u) => {
              const isMe = u.id === meId
              return (
                <tr key={u.id} className="hover:bg-cream">
                  <td className="px-4 py-2.5 font-semibold">
                    {u.full_name}
                    {isMe && <span className="ml-2 text-xs font-normal text-ink-3">(you)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">{u.email ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ROLE_BADGE[u.role]}`}
                      >
                        {u.role}
                      </span>
                      <select
                        value={pickingVendorFor === u.id ? 'vendor' : u.role}
                        disabled={isMe || pending}
                        title={isMe ? 'You cannot change your own role' : 'Change role'}
                        onChange={(e) => {
                          const next = e.target.value as Role
                          if (next === u.role) return
                          if (next === 'vendor') {
                            setPickingVendorFor(u.id)
                            return
                          }
                          setPickingVendorFor(null)
                          applyUpdate(u.id, { role: next, vendor_id: null })
                        }}
                        className="rounded-lg border border-line-2 bg-surface-2 px-2 py-1 text-xs font-semibold disabled:opacity-40"
                      >
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                        <option value="vendor">Vendor</option>
                      </select>
                      {pickingVendorFor === u.id && (
                        <select
                          autoFocus
                          defaultValue={u.vendor_id ?? ''}
                          disabled={pending}
                          onChange={(e) => {
                            if (!e.target.value) return
                            setPickingVendorFor(null)
                            applyUpdate(u.id, { role: 'vendor', vendor_id: e.target.value })
                          }}
                          className="rounded-lg border border-line-2 bg-surface-2 px-2 py-1 text-xs font-semibold"
                        >
                          <option value="">Vendor…</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                        u.active ? 'bg-pine-soft text-pine' : 'bg-surface-2 text-ink-3'
                      }`}
                    >
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-3">{u.created_at ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      disabled={isMe || pending}
                      title={isMe ? 'You cannot deactivate your own account' : undefined}
                      onClick={() => applyUpdate(u.id, { active: !u.active })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-[0.97] disabled:opacity-40 ${
                        u.active ? 'bg-surface-2 text-ink-3' : 'bg-pine-soft text-pine'
                      }`}
                    >
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
