// El día operativo del mercado es el día local de America/New_York, no UTC.
// El removal log del legado agrupa por ese día; en Vercel el servidor corre en UTC,
// así que calcularlo con `new Date().setHours(0,0,0,0)` cortaba el día equivocado.

export function marketToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Columnas del removal log, compartidas por la carga del servidor y la del cliente. */
export const REMOVAL_SELECT =
  'id, item_name, vendor_name, qty, remove_by, weight_lb, note, created_at, signed_at, edited_at, voided_at, void_reason, removed:profiles!removals_removed_by_fkey(full_name), signer:profiles!removals_signed_by_fkey(full_name)'
