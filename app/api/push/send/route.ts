import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    webpush.setVapidDetails(
      'mailto:dantescarpato98@gmail.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )
    const { userId, ...payload } = await request.json()
    const supabase = createClient()
    let query = supabase.from('push_subscriptions').select('endpoint, keys')
    if (userId) query = query.eq('user_id', userId)
    const { data: subs } = await query
    if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify(payload)
        )
      )
    )

    // Remove expired subscriptions
    const expired = results
      .map((r, i) => (r.status === 'rejected' ? subs[i].endpoint : null))
      .filter(Boolean) as string[]
    if (expired.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expired)
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length
    return NextResponse.json({ sent })
  } catch (e) {
    console.error('Push error:', e)
    return NextResponse.json({ error: 'Error al enviar notificación' }, { status: 500 })
  }
}
