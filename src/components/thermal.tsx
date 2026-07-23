// Piezas compartidas del sistema bi-thermal: la lectura fría/cálida de una cantidad
// (almacén vs piso) y los chips de estado tipográficos. Un solo lugar para el vocabulario.

import type { ReactNode } from 'react'

/** Lectura térmica de una cantidad: frío = almacén (cooler), cálido = piso (venta). */
export function ThermalReading({ storage, floor }: { storage: number; floor: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        title="In cold storage (cooler)"
        className="tnum rounded-md bg-cold-soft px-1.5 py-0.5 text-xs font-semibold text-cold"
      >
        {storage}
      </span>
      <span
        title="Out on the sales floor"
        className="tnum rounded-md bg-warm-soft px-1.5 py-0.5 text-xs font-semibold text-warm"
      >
        {floor}
      </span>
    </span>
  )
}

type Tone = 'ok' | 'warn' | 'crit' | 'cold' | 'warm' | 'neutral'

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
  cold: 'bg-cold-soft text-cold',
  warm: 'bg-warm-soft text-warm',
  neutral: 'bg-surface-3 text-ink-2',
}

/** Chip de estado tipográfico — reemplaza los emoji de estado. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}
