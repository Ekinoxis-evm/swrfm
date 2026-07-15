import { redirect, notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/supabase/server'
import ReceivingEditor from './receiving-editor'

export const dynamic = 'force-dynamic'

export default async function ReceivingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, profile } = await getSessionProfile()
  if (!profile) redirect('/login')

  const { data: session } = await supabase
    .from('receiving_sessions')
    .select('id, date, invoice_no, status, vendor_id, vendors(id, name, workflow_type)')
    .eq('id', id)
    .single()
  if (!session) notFound()

  const vendor = session.vendors as unknown as {
    id: string
    name: string
    workflow_type: string
  }

  const { data: products } = await supabase
    .from('products')
    .select('toast_guid, name, category')
    .eq('vendor_id', vendor.id)
    .eq('active', true)
    .order('name')

  return (
    <ReceivingEditor
      sessionId={session.id}
      sessionMeta={{
        date: session.date,
        invoiceNo: session.invoice_no,
        status: session.status,
        vendorName: vendor.name,
        workflowType: vendor.workflow_type,
      }}
      products={products ?? []}
      me={{ id: profile.id, name: profile.full_name, role: profile.role }}
    />
  )
}
