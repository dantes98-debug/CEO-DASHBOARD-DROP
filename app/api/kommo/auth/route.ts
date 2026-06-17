import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/kommo'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.redirect(getAuthUrl())
}
