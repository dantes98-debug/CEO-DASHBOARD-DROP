import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/woocommerce'
import { syncPrices } from '@/lib/woocommerce-push'

export async function POST() {
  if (!process.env.WOOCOMMERCE_STORE_URL || !process.env.WOOCOMMERCE_CONSUMER_KEY) {
    return NextResponse.json({ error: 'Faltan credenciales de WooCommerce' }, { status: 500 })
  }

  const supabase = getServiceClient()
  const { data: productos, error } = await supabase
    .from('productos')
    .select('sku, precio_venta')
    .not('sku', 'is', null)
    .gt('precio_venta', 0)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!productos?.length) return NextResponse.json({ ok: true, updated: 0, notFound: [], errors: [] })

  const items = productos.map(p => ({ sku: String(p.sku), precio: Number(p.precio_venta) }))

  try {
    const result = await syncPrices(items)
    return NextResponse.json({ ok: true, total: items.length, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
