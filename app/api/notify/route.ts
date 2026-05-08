import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { tipo, texto } = body as { tipo: 'admins' | 'warehouse'; texto: string }

  if (!tipo || !texto) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = getServiceClient()

  let recipientIds: string[] = []

  if (tipo === 'admins') {
    const { data } = await service
      .from('user_profiles')
      .select('id')
      .eq('role', 'admin')
      .neq('id', user.id)
    recipientIds = (data || []).map((r: { id: string }) => r.id)
  } else {
    const { data } = await service
      .from('user_profiles')
      .select('id, permisos')
      .neq('role', 'admin')
      .eq('activo', true)
    recipientIds = (data || [])
      .filter((u: { permisos?: Record<string, boolean> }) => u.permisos?.envios === true)
      .map((u: { id: string }) => u.id)
  }

  if (recipientIds.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const inserts = recipientIds.map(para_id => ({ de_id: user.id, para_id, texto }))
  const { error } = await service.from('mensajes').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sent: recipientIds.length })
}
