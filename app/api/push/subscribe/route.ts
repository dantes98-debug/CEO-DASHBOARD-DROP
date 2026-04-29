import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const sub = await request.json()
    if (!sub?.endpoint || !sub?.keys) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('push_subscriptions').upsert(
      { endpoint: sub.endpoint, keys: sub.keys, user_id: user?.id ?? null },
      { onConflict: 'endpoint' }
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error al guardar suscripción' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { endpoint } = await request.json()
    const supabase = createClient()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
