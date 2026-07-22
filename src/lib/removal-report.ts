// Reporte nocturno del removal log — puerto del correo diario del `server.js` legado
// (swarm_buildapp/docs/removal handoff/). Mismo contenido y mismas garantías: se registra
// la fecha SOLO cuando el proveedor aceptó el mensaje, y un día que no salió se recupera
// tarde en la siguiente pasada.
//
// Cero dependencias: fetch nativo contra la API REST de Resend y contra PostgREST con la
// service role key, igual que `src/lib/supabase/admin.ts`.

if (typeof window !== 'undefined') {
  throw new Error('removal-report.ts is server-only and must never be imported client-side')
}

export type ReportRow = {
  id: string
  item_name: string
  vendor_name: string | null
  qty: number
  remove_by: 'case' | 'unit'
  weight_lb: number
  created_at: string
  signed_at: string | null
  voided_at: string | null
  removed: { full_name: string } | null
  signer: { full_name: string } | null
}

/** Día operativo (America/New_York) desplazado `offsetDays` días. */
export function marketDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

export function buildReport(date: string, rows: ReportRow[], late: boolean) {
  const live = rows.filter((r) => !r.voided_at)
  const unsigned = live.filter((r) => !r.signed_at).length
  const totalQty = live.reduce((n, r) => n + Number(r.qty), 0)
  const totalWt = live.reduce((n, r) => n + Number(r.weight_lb), 0)

  const td = 'padding:8px;border-top:1px solid #e8dfd0'
  const body = rows
    .map((r) => {
      const dim = r.voided_at ? 'color:#9a9184;text-decoration:line-through' : ''
      const manager = r.voided_at
        ? '<span style="color:#9a9184">voided</span>'
        : r.signed_at
          ? `✓ ${esc(r.signer?.full_name ?? 'signed')}`
          : '<b style="color:#b45309">UNSIGNED</b>'
      return `<tr style="${dim}">
        <td style="${td}">${time(r.created_at)}</td>
        <td style="${td}">${esc(r.removed?.full_name ?? '—')}</td>
        <td style="${td}">${esc(r.item_name)}<div style="font-size:11px;color:#9a9184">${esc(r.vendor_name ?? '')}</div></td>
        <td style="${td};text-align:center">${Number(r.qty)} <span style="font-size:11px;color:#9a9184">${r.remove_by}</span></td>
        <td style="${td};text-align:right">${Number(r.weight_lb) > 0 ? Number(r.weight_lb).toFixed(1) + ' lb' : '—'}</td>
        <td style="${td}">${manager}</td>
      </tr>`
    })
    .join('')

  const th = 'padding:8px;text-align:left'
  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;background:#fef9f3;padding:24px;color:#2b2620">
      <h2 style="margin:0 0 4px">🥩 SWR Daily Removal Report</h2>
      ${
        late
          ? '<p style="margin:0 0 8px;padding:8px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;color:#92400e"><b>⚠ LATE DELIVERY</b> — this report was recovered automatically after it failed to send at its scheduled time.</p>'
          : ''
      }
      <p style="margin:0 0 16px;color:#6b6257">${date} · ${live.length} removal${live.length !== 1 ? 's' : ''} · ${totalQty} total qty · ${totalWt.toFixed(1)} lb · ${
        unsigned ? `<b style="color:#b45309">${unsigned} UNSIGNED</b>` : 'all signed ✓'
      }</p>
      ${
        rows.length
          ? `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e8dfd0;border-radius:8px">
        <tr style="background:#2b2620;color:#fef9f3">
          <th style="${th}">Time</th><th style="${th}">Employee</th><th style="${th}">Item</th>
          <th style="padding:8px">Qty</th><th style="padding:8px;text-align:right">Weight</th><th style="${th}">Manager</th>
        </tr>${body}</table>`
          : '<p>No removals logged this day.</p>'
      }
      <p style="margin:16px 0 0;font-size:12px;color:#9a9184">Automated report · SWR Cooler System</p>
    </div>`

  const subject = `SWR Removal Report — ${date} (${live.length} entries${
    unsigned ? `, ${unsigned} unsigned` : ''
  })${late ? ' [LATE — auto-recovered]' : ''}`

  return { subject, html, entries: live.length, unsigned }
}

type SendResult = { ok: true; id: string } | { ok: false; error: string }

/** Envía por la API REST de Resend. Devuelve ok solo si Resend aceptó el mensaje. */
export async function sendReportEmail(
  subject: string,
  html: string,
  to: string[]
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.REMOVAL_REPORT_FROM || 'SWR Reports <hola@ekinoxis.xyz>'

  if (!key) return { ok: false, error: 'RESEND_API_KEY not configured' }
  if (!to.length) return { ok: false, error: 'No hay destinatarios configurados' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.message || `Resend error ${res.status}` }
    return { ok: true, id: String(data?.id ?? '') }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Resend request failed' }
  }
}
