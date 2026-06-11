import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { getServiceClient, upsertOrdenWooCommerce } from '@/lib/woocommerce'

function verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    return expected === signature
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
    return NextResponse.json({ ok: true, ...result })
}
