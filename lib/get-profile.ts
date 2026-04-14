import { createClient } from '@/lib/supabase-server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import type { UserProfile } from '@/lib/permisos'

export async function getProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Use service role to bypass RLS (safe — server-side only)
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data } = await admin
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data as UserProfile | null
}
