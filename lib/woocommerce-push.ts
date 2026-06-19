// Server-side only — uses WooCommerce REST API to push data from dashboard to store

function wcAuth() {
  const key = process.env.WOOCOMMERCE_CONSUMER_KEY!
  const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET!
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
}

function wcUrl(path: string) {
  const base = process.env.WOOCOMMERCE_STORE_URL!.replace(/\/$/, '')
  return `${base}/wp-json/wc/v3${path}`
}

async function wcGet(path: string) {
  const res = await fetch(wcUrl(path), {
    headers: { Authorization: wcAuth() },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`WC GET ${path} → ${res.status}`)
  return res.json()
}

async function wcPost(path: string, body: unknown) {
  const res = await fetch(wcUrl(path), {
    method: 'POST',
    headers: { Authorization: wcAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WC POST ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

export interface WcProductRef {
  productId: number
  variationId?: number
}

// Build a full SKU → WC product/variation ID map
export async function buildSkuMap(): Promise<Record<string, WcProductRef>> {
  const map: Record<string, WcProductRef> = {}

  // Simple products + variable product parents
  let page = 1
  const variableIds: number[] = []
  while (true) {
    const products: any[] = await wcGet(`/products?per_page=100&page=${page}&status=publish,draft`)
    if (!products.length) break
    for (const p of products) {
      if (p.sku) map[p.sku] = { productId: p.id }
      if (p.type === 'variable') variableIds.push(p.id)
    }
    if (products.length < 100) break
    page++
  }

  // Variations (override parent if variation has its own SKU)
  for (const parentId of variableIds) {
    let vpage = 1
    while (true) {
      const variations: any[] = await wcGet(`/products/${parentId}/variations?per_page=100&page=${vpage}`)
      if (!variations.length) break
      for (const v of variations) {
        if (v.sku) map[v.sku] = { productId: parentId, variationId: v.id }
      }
      if (variations.length < 100) break
      vpage++
    }
  }

  return map
}

// Push regular_price for a list of { sku, precio } pairs
// Returns { updated, notFound, errors }
export async function syncPrices(products: { sku: string; precio: number }[]) {
  const skuMap = await buildSkuMap()

  const simpleUpdates: { id: number; regular_price: string }[] = []
  const variationsByParent: Record<number, { id: number; regular_price: string }[]> = {}
  const notFound: string[] = []

  for (const { sku, precio } of products) {
    const ref = skuMap[sku]
    if (!ref) { notFound.push(sku); continue }
    const priceStr = precio.toFixed(2)
    if (ref.variationId) {
      if (!variationsByParent[ref.productId]) variationsByParent[ref.productId] = []
      variationsByParent[ref.productId].push({ id: ref.variationId, regular_price: priceStr })
    } else {
      simpleUpdates.push({ id: ref.productId, regular_price: priceStr })
    }
  }

  let updated = 0
  const errors: string[] = []

  // Batch simple products in chunks of 100
  for (let i = 0; i < simpleUpdates.length; i += 100) {
    try {
      const chunk = simpleUpdates.slice(i, i + 100)
      const result = await wcPost('/products/batch', { update: chunk })
      updated += (result.update || []).length
    } catch (e) {
      errors.push(String(e))
    }
  }

  // Batch variations per parent
  for (const [parentId, varUpdates] of Object.entries(variationsByParent)) {
    for (let i = 0; i < varUpdates.length; i += 100) {
      try {
        const chunk = varUpdates.slice(i, i + 100)
        const result = await wcPost(`/products/${parentId}/variations/batch`, { update: chunk })
        updated += (result.update || []).length
      } catch (e) {
        errors.push(String(e))
      }
    }
  }

  return { updated, notFound, errors }
}

// Push stock_quantity for a list of { sku, cantidad } pairs
export async function syncStock(products: { sku: string; cantidad: number }[]) {
  const skuMap = await buildSkuMap()

  const simpleUpdates: { id: number; stock_quantity: number; manage_stock: true }[] = []
  const variationsByParent: Record<number, { id: number; stock_quantity: number; manage_stock: true }[]> = {}
  const notFound: string[] = []

  for (const { sku, cantidad } of products) {
    const ref = skuMap[sku]
    if (!ref) { notFound.push(sku); continue }
    const entry = { stock_quantity: Math.max(0, Math.round(cantidad)), manage_stock: true as const }
    if (ref.variationId) {
      if (!variationsByParent[ref.productId]) variationsByParent[ref.productId] = []
      variationsByParent[ref.productId].push({ id: ref.variationId, ...entry })
    } else {
      simpleUpdates.push({ id: ref.productId, ...entry })
    }
  }

  let updated = 0
  const errors: string[] = []

  for (let i = 0; i < simpleUpdates.length; i += 100) {
    try {
      const chunk = simpleUpdates.slice(i, i + 100)
      const result = await wcPost('/products/batch', { update: chunk })
      updated += (result.update || []).length
    } catch (e) {
      errors.push(String(e))
    }
  }

  for (const [parentId, varUpdates] of Object.entries(variationsByParent)) {
    for (let i = 0; i < varUpdates.length; i += 100) {
      try {
        const chunk = varUpdates.slice(i, i + 100)
        const result = await wcPost(`/products/${parentId}/variations/batch`, { update: chunk })
        updated += (result.update || []).length
      } catch (e) {
        errors.push(String(e))
      }
    }
  }

  return { updated, notFound, errors }
}
