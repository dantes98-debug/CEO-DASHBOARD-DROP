import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getServiceClient, upsertOrdenWooCommerce } from '@/lib/woocommerce'
import webpush from 'web-push'

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('base64')
  return expected === signature
}

async function sendPushToAdmins(title: string, body: string) {
  try {
    webpush.setVapidDetails(
      'mailto:dantescarpato98@gmail.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const supabase = getServiceClient()

    // Get all admin user IDs
    const { data: admins } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', 'admin')

    if (!admins?.length) return

    const adminIds = admins.map((a: { id: string }) => a.id)

    // Get their push subscriptions
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys, user_id')
      .in('user_id', adminIds)

    if (!subs?.length) return

    const payload = JSON.stringify({ title, body, icon: '/logo-drop.png' })

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          payload
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
  } catch (e) {
    console.error('[webhook/woocommerce] push error:', e)
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-wc-webhook-signature') || ''
  const topic = request.headers.get('x-wc-webhook-topic') || ''
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET

  if (secret && !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (!['order.created', 'order.updated'].includes(topic)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  let order: Record<string, unknown>
  try {
    order = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const result = await upsertOrdenWooCommerce(order, supabase)

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  // Send push notification for new orders
  if (result.action === 'created') {
    const billing = (order.billing || {}) as Record<string, string>
    const nombre = [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim()
      || billing.company || 'Cliente'
    const total = Number(order.total || 0)
    const montoStr = total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

    await sendPushToAdmins(
      '🛒 Nueva venta ecommerce',
      `${nombre} · ${montoStr}`
    )
  }

  return NextResponse.json({ ok: true, ...result })
}
