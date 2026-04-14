import { createClient } from '@/lib/supabase-server'
import type { UserProfile } from '@/lib/permisos'

export async function getProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data as UserProfile | null
}
