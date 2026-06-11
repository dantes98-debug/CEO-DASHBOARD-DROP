import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, upsertOrdenWooCommerce } from '@/lib/woocommerce'

export async function POST(request: NextRequest) {
    const storeUrl = process.env.WOOCOMMERCE_STORE_URL
    const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY
    const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET

    if (!storeUrl || !consumerKey || !consumerSecret) {
          return NextResponse.json(
                  { error: 'Faltan variables: WOOCOMMERCE_STORE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET' },
                  { status: 500 }
                )
        }

    const supabase = getServiceClient()
    let page = 1
    let totalCreated = 0
    let totalUpdated = 0
    let totalSkipped = 0
    const errors: string[] = []

    while (true) {
          const url = `${storeUrl}/wp-json/wc/v3/orders?per_page=100&page=${page}&status=any&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`

          let orders: Record<string, unknown>[]
          try {
                  const resp = await fetch(url)
                  if (!resp.ok) {
                            errors.push(`Error HTTP ${resp.status} en pagina ${page}`)
                            break
                          }
                  orders = await resp.json()
                } catch (e) {
                  errors.push(`Error de red en pagina ${page}: ${String(e)}`)
                  break
                }

          if (!orders || orders.length === 0) break

          for (const order of orders) {
                  const result = await upsertOrdenWooCommerce(order, supabase)
                  if (result.action === 'created') totalCreated++
                  else if (result.action === 'updated') totalUpdated++
                  else totalSkipped++
                  if (result.error) errors.push(`WC-${order.id}: ${result.error}`)
                }

          if (orders.length < 100) break
          page++
        }

    return NextResponse.json({
          ok: true,
          pagesProcessed: page,
          created: totalCreated,
          updated: totalUpdated,
          skipped: totalSkipped,
          errors: errors.slice(0, 10),
        })
  }
