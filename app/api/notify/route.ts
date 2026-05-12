import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { z } from 'zod'

const NotifySchema = z.object({
  tipo:  z.enum(['admins', 'warehouse']),
  texto: z.string().min(1).max(1000),
})

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
  const parsed = NotifySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { tipo, texto } = parsed.data

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
