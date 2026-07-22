// Cron del reporte nocturno del removal log.
//
// Lo dispara Vercel Cron (ver vercel.json) a las 03:55 UTC — 11:55 PM en Florida en
// horario de verano, la misma hora que el legado; 10:55 PM en invierno, porque Vercel
// solo programa en UTC. En ambos casos cae después del cierre y dentro del mismo día
// operativo, que es lo que importa.
//
// Además de enviar el día de hoy, recupera el de ayer si nunca salió: es la misma
// garantía que el legado añadió tras perder reportes por caídas del Mac Mini.

import { NextResponse } from 'next/server'
import { buildReport, marketDay, sendReportEmail, type ReportRow } from '@/lib/removal-report'

export const dynamic = 'force-dynamic'

const REMOVAL_COLUMNS =
  'id,item_name,vendor_name,qty,remove_by,weight_lb,created_at,signed_at,voided_at,' +
  'removed:profiles!removals_removed_by_fkey(full_name),signer:profiles!removals_signed_by_fkey(full_name)'

function db(path: string, init?: RequestInit) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials not configured')
  return fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
}

/** Envía el reporte de un día si no salió ya. Devuelve qué pasó, para el log del cron. */
async function reportFor(day: string, late: boolean, force = false) {
  if (!force) {
    const sentRes = await db(`/removal_report_log?local_date=eq.${day}&select=local_date`)
    if (!sentRes.ok) return { day, status: 'error', error: `report_log ${sentRes.status}` }
    if (((await sentRes.json()) as unknown[]).length) return { day, status: 'already_sent' }
  }

  const rowsRes = await db(
    `/removals?local_date=eq.${day}&select=${encodeURIComponent(REMOVAL_COLUMNS)}&order=created_at.asc`
  )
  if (!rowsRes.ok) return { day, status: 'error', error: `removals ${rowsRes.status}` }
  const rows = (await rowsRes.json()) as ReportRow[]

  const { subject, html, entries, unsigned } = buildReport(day, rows, late)
  const sent = await sendReportEmail(subject, html)
  // Se marca como enviado SOLO si Resend aceptó — si no, la próxima pasada reintenta.
  if (!sent.ok) return { day, status: 'send_failed', error: sent.error }

  await db('/removal_report_log', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ local_date: day, entries, unsigned_entries: unsigned, late }),
  })
  return { day, status: 'sent', entries, unsigned, late }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Reenvío manual de un día concreto: `?date=YYYY-MM-DD`. Ignora el registro de
    // enviados a propósito — se pide explícitamente, no es la pasada automática.
    const date = new URL(request.url).searchParams.get('date')
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ ok: false, error: 'date must be YYYY-MM-DD' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, resend: await reportFor(date, false, true) })
    }

    const today = await reportFor(marketDay(), false)
    const yesterday = await reportFor(marketDay(-1), true)
    return NextResponse.json({ ok: true, today, yesterday })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Cron failed'
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
}
