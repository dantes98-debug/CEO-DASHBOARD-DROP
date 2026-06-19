import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/woocommerce'
import { syncStock } from '@/lib/woocommerce-push'

export async function POST() {
  if (!process.env.WOOCOMMERCE_STORE_URL || !process.env.WOOCOMMERCE_CONSUMER_KEY) {
    return NextResponse.json({ error: 'Faltan credenciales de WooCommerce' }, { status: 500 })
  }

  const supabase = getServiceClient()
  const { data: items, error } = await supabase
    .from('stock')
    .select('sku, cantidad_total')
    .not('sku', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items?.length) return NextResponse.json({ ok: true, updated: 0, notFound: [], errors: [] })

  const products = items.map(i => ({ sku: String(i.sku), cantidad: Number(i.cantidad_total ?? 0) }))

  try {
    const result = await syncStock(products)
    return NextResponse.json({ ok: true, total: products.length, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
