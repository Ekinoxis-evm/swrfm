'use client'

// Tabla reusable del sistema: buscador, encabezados ordenables, números tabulares
// alineados, encabezado pegajoso y estado vacío. Toda lista de la app la hereda —
// nada de tablas one-off. Los filtros específicos de cada pantalla se pasan por `toolbar`.

import { useMemo, useState, type ReactNode } from 'react'

export type Column<T> = {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  /** Valor para ordenar. Si falta, la columna no es ordenable. */
  sortValue?: (row: T) => number | string
  render: (row: T) => ReactNode
  /** Ancho fijo opcional, p. ej. '1%' para columnas de acción. */
  width?: string
  headerClassName?: string
  cellClassName?: string
}

type Props<T> = {
  rows: T[]
  columns: Column<T>[]
  getKey: (row: T) => string
  /** Texto sobre el que busca el buscador. Omitir para ocultar el buscador. */
  searchText?: (row: T) => string
  searchPlaceholder?: string
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  /** Controles a la derecha de la barra (filtros por columna, botones…). */
  toolbar?: ReactNode
  emptyText?: string
  /** Máximo de filas a pintar; si se excede muestra un aviso al pie. */
  limit?: number
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export default function DataTable<T>({
  rows,
  columns,
  getKey,
  searchText,
  searchPlaceholder = 'Search…',
  initialSort,
  toolbar,
  emptyText = 'Nothing here yet.',
  limit,
}: Props<T>) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    let out = searchText && t ? rows.filter((r) => searchText(r).toLowerCase().includes(t)) : rows
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      if (col?.sortValue) {
        const f = col.sortValue
        out = [...out].sort((a, b) => {
          const va = f(a)
          const vb = f(b)
          const cmp =
            typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb))
          return sort.dir === 'asc' ? cmp : -cmp
        })
      }
    }
    return out
  }, [rows, q, sort, columns, searchText])

  const shown = limit ? filtered.slice(0, limit) : filtered

  function toggleSort(col: Column<T>) {
    if (!col.sortValue) return
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, dir: 'asc' }
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {(searchText || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          {searchText && (
            <label className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-3 focus-within:border-brand">
              <span aria-hidden>⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-ink outline-none placeholder:text-ink-3"
              />
            </label>
          )}
          {toolbar}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              {columns.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    onClick={() => toggleSort(c)}
                    className={`whitespace-nowrap px-4 py-3 ${alignClass[c.align ?? 'left']} ${
                      c.sortValue ? 'cursor-pointer select-none hover:text-ink-2' : ''
                    } ${c.headerClassName ?? ''}`}
                  >
                    {c.header}
                    {c.sortValue && (
                      <span className={`ml-1 ${active ? 'text-brand' : 'text-ink-3 opacity-40'}`}>
                        {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((row) => (
              <tr key={getKey(row)} className="hover:bg-surface-2">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-2.5 ${alignClass[c.align ?? 'left']} ${
                      c.align === 'right' ? 'tnum' : ''
                    } ${c.cellClassName ?? ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-ink-3">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {limit && filtered.length > limit && (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
          Showing first {limit} of {filtered.length} — refine the search or filters.
        </p>
      )}
    </div>
  )
}
