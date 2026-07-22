'use client'

// Admin-only inline editor for a product: category, barcode, vendor and
// cooler flag are editable; name and price stay synced from Toast (read-only).
// Also hosts the Archive / Unarchive action (with confirm).

import { useState } from 'react'

type Product = {
  toast_guid: string
  name: string
  category: string | null
  barcode: string | null
  vendor_id: string | null
  price_cents: number | null
  cooler_relevant: boolean
  units_per_case: number | null
  low_stock_cases: number | null
  archived_at: string | null
}

const input = 'w-full rounded-lg border border-line-2 bg-cream px-3 py-2'
const label = 'mb-1 block text-xs font-bold uppercase tracking-wide text-ink-3'

export default function ProductEdit({
  product,
  vendors,
  updateProduct,
  setArchived,
}: {
  product: Product
  vendors: { id: string; name: string }[]
  updateProduct: (formData: FormData) => Promise<void>
  setArchived: (formData: FormData) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const archived = Boolean(product.archived_at)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line-2 bg-surface px-4 py-2 text-sm font-bold text-ink-2 hover:bg-cream"
      >
        ✎ Edit product
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">Edit product</h2>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg bg-surface-3 px-2.5 py-1 text-xs font-bold text-ink-3"
        >
          ✕ Close
        </button>
      </div>

      <form action={updateProduct} className="space-y-3">
        <input type="hidden" name="toast_guid" value={product.toast_guid} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Name</label>
            <input value={product.name} disabled className={`${input} opacity-60`} />
          </div>
          <div>
            <label className={label}>Price</label>
            <input
              value={product.price_cents != null ? `$${(product.price_cents / 100).toFixed(2)}` : '—'}
              disabled
              className={`${input} opacity-60`}
            />
          </div>
        </div>
        <p className="text-[11px] text-ink-3">Name and price are synced from Toast.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Category</label>
            <input name="category" defaultValue={product.category ?? ''} className={input} />
          </div>
          <div>
            <label className={label}>Barcode</label>
            <input
              name="barcode"
              defaultValue={product.barcode ?? ''}
              placeholder="scan or type…"
              className={input}
            />
          </div>
        </div>
        <div>
          <label className={label}>Vendor</label>
          <select name="vendor_id" defaultValue={product.vendor_id ?? ''} className={input}>
            <option value="">— No vendor —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Units per case</label>
            <input
              name="units_per_case"
              type="number"
              min={1}
              defaultValue={product.units_per_case ?? ''}
              placeholder="e.g. 12"
              className={input}
            />
            <p className="mt-1 text-[11px] text-ink-3">
              Needed to remove by the case. Empty = this product is handled by unit only.
            </p>
          </div>
          <div>
            <label className={label}>Low stock (cases)</label>
            <input
              name="low_stock_cases"
              type="number"
              min={0}
              defaultValue={product.low_stock_cases ?? 2}
              className={input}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-2">
          <input
            type="checkbox"
            name="cooler_relevant"
            defaultChecked={product.cooler_relevant}
            className="h-4 w-4 accent-brand"
          />
          Cooler-relevant (shows in the removal log picker)
        </label>
        <button className="rounded-lg bg-ink px-5 py-2.5 text-sm font-bold text-cream active:scale-[0.98]">
          Save changes
        </button>
      </form>

      <div className="mt-4 border-t border-line pt-4">
        <form
          action={setArchived}
          onSubmit={(e) => {
            const msg = archived
              ? `Unarchive "${product.name}"? It will show again in inventory and pickers.`
              : `Archive "${product.name}"? It will be hidden from inventory, pickers, and counts. Its history stays available on this page.`
            if (!window.confirm(msg)) e.preventDefault()
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="toast_guid" value={product.toast_guid} />
          <input type="hidden" name="archive" value={archived ? '0' : '1'} />
          <button
            className={`rounded-lg px-4 py-2 text-sm font-bold ${
              archived
                ? 'bg-pine-soft text-pine hover:bg-pine hover:text-white'
                : 'bg-coral-soft text-coral hover:bg-coral hover:text-white'
            }`}
          >
            {archived ? '↩ Unarchive product' : '🗄 Archive product'}
          </button>
          <span className="text-xs text-ink-3">
            {archived
              ? 'Archived — hidden everywhere except this page.'
              : 'Archiving hides it everywhere but keeps its history.'}
          </span>
        </form>
      </div>
    </section>
  )
}
