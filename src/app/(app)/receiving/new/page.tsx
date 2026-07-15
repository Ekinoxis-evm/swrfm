import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/supabase/server'
import ReceiveWizard from './receive-wizard'

export const dynamic = 'force-dynamic'

export default async function NewReceivingPage() {
  const { supabase, profile } = await getSessionProfile()
  if (!profile || profile.role === 'vendor') redirect('/')

  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name, workflow_type, contact_name')
    .eq('active', true)
    .order('name')

  return <ReceiveWizard vendors={vendors ?? []} meId={profile.id} />
}
