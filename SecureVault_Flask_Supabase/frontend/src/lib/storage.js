import { supabase } from './supabase'

// Files are stored under the authenticated user's UUID folder.
// Bucket must be private; RLS policies are supplied in supabase/policies.sql.
export async function uploadFdrDocument(file, userId) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`
  const { data, error } = await supabase.storage.from('fdr-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream'
  })
  if (error) throw error
  return { path: data.path, original_filename: file.name, content_type: file.type }
}
