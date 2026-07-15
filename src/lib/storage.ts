import { createClient } from '@/lib/supabase/server'

// Server-side: upload a File from a form into the private documents bucket.
export async function uploadDocument(file: File, prefix: string): Promise<string | null> {
  if (!file || file.size === 0) return null
  const supabase = await createClient()
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `${prefix}/${crypto.randomUUID()}-${safeName}`
  const { error } = await supabase.storage.from('documents').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw error
  return path
}

// Server-side: signed URL for viewing a private document (1 hour).
export async function signedDocUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const supabase = await createClient()
  const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
