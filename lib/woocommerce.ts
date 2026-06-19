import { createClient } from '@supabase/supabase-js'

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function mapMetodoPago(wcMethod: string): string | null {
  const m = wcMethod.toLowerCase()
  if (m.includes('mercadopago') || m.includes('mercado_pago')) return 'mercado_pago'
  if (m.includes('bacs') || m.includes('transferencia') || m.includes('transfer')) return 'transferencia_motic'
  if (m.includes('stripe') || m.includes('credit') || m.includes('card')) return 'mercado_pago'
  return null
}

export function mapProvincia(state: string): string | null {
  const map: Record<string, string> = {
    'B': 'Buenos Aires', 'C': 'CABA', 'K': 'Catamarca', 'H': 'Chaco',
    'U': 'Chubut', 'X': 'Cordoba', 'W': 'Corrientes', 'E': 'Entre Rios',
    'P': 'Formosa', 'Y': 'Jujuy', 'L': 'La Pampa', 'F': 'La Rioja',
    'M': 'Mendoza', 'N': 'Misiones', 'Q': 'Neuquen', 'R': 'Rio Negro',
    'A': 'Salta', 'J': 'San Juan', 'D': 'San Luis', 'Z': 'Santa Cruz',
    'S': 'Santa Fe', 'G': 'Santiago del Estero', 'V': 'Tierra del Fuego', 'T': 'Tucuman',
  }
  return map[state?.toUpperCase()] || state || null
}

// Extract value from WooCommerce meta_data array by key
function getMeta(metaData: Record<string, unknown>[], key: string): string | null {
  const item = metaData.find(m => String(m.key || '').toLowerCase() === key.toLowerCase())
  return item ? String(item.value || '') : null
}

function extractWcData(order: Record<string, unknown>) {
  const billing  = (order.billing  || {}) as Record<string, string>
  const shipping = (order.shipping || {}) as Record<string, string>
  const metaData = (order.meta_data || []) as Record<string, unknown>[]
  const paymentTitle = String(order.payment_method_title || '')

  // Shipping address
  const shippingName = [shipping.first_name, shipping.last_name].filter(Boolean).join(' ').trim()
  const shippingAddr = [
    shipping.address_1,
    shipping.address_2,
    shipping.city,
    mapProvincia(shipping.state) || shipping.state,
    shipping.postcode,
  ].filter(Boolean).join(', ')

  // Billing address
  const billingAddr = [
    billing.address_1,
    billing.address_2,
    billing.city,
    mapProvincia(billing.state) || billing.state,
    billing.postcode,
  ].filter(Boolean).join(', ')

  // CUIT — common keys from Argentine WooCommerce AFIP plugins
  const cuit =
    getMeta(metaData, '_billing_wcaf_cuit') ||
    getMeta(metaData, '_billing_cuit') ||
    getMeta(metaData, 'billing_cuit') ||
    getMeta(metaData, '_billing_afip_cuit') ||
    getMeta(metaData, 'vat_number') ||
    billing.vat_number || null

  // Tipo de factura — A or B
  const tipoFactura =
    getMeta(metaData, '_billing_invoice_type') ||
    getMeta(metaData, '_wcaf_invoice_type') ||
    getMeta(metaData, 'billing_invoice_type') ||
    getMeta(metaData, '_billing_wcaf_invoice_type') || null

  // Installments / Cuotas (Mercado Pago)
  let cuotas: number | null = null
  const cuotasMeta =
    getMeta(metaData, '_mp_installments') ||
    getMeta(metaData, 'mp_installments') ||
    getMeta(metaData, 'Cuotas') ||
    getMeta(metaData, 'cuotas') ||
    getMeta(metaData, '_wc_mercadopago_installments')

  if (cuotasMeta) {
    const n = parseInt(cuotasMeta)
    if (!isNaN(n) && n > 0) cuotas = n
  }
  // Also try to extract from payment_method_title: "Mercadopago (3 cuotas)"
  if (!cuotas) {
    const match = paymentTitle.match(/(\d+)\s*cuota/i)
    if (match) cuotas = parseInt(match[1])
  }

  // Shipping lines
  const shippingLines = (order.shipping_lines || []) as Record<string, unknown>[]
  const shippingMethod = shippingLines[0]
    ? String((shippingLines[0] as Record<string, unknown>).method_title || '')
    : null
  const shippingCost = shippingLines.reduce((s, l) => s + Number((l as Record<string, unknown>).total || 0), 0)

  return {
    // Envío
    shipping_nombre: shippingName || null,
    shipping_direccion: shippingAddr || null,
    shipping_metodo: shippingMethod,
    shipping_costo: shippingCost || null,
    // Facturación
    billing_email: billing.email || null,
    billing_telefono: billing.phone || null,
    billing_direccion: billingAddr || null,
    cuit: cuit || null,
    tipo_factura: tipoFactura || null,
    // Pago
    payment_title: paymentTitle || null,
    cuotas: cuotas,
    // Raw
    wc_order_id: String(order.id || ''),
    wc_status: String(order.status || ''),
  }
}

export async function upsertOrdenWooCommerce(
  order: Record<string, unknown>,
  supabase: ReturnType<typeof getServiceClient>
): Promise<{ action: 'created' | 'updated' | 'skipped'; id?: string; error?: string }> {
  const status = String(order.status || '')
  if (['cancelled', 'failed', 'refunded', 'trash'].includes(status)) {
    return { action: 'skipped' }
  }

  const billing   = (order.billing   || {}) as Record<string, string>
  const lineItems = (order.line_items || []) as Record<string, unknown>[]
  const orderId   = String(order.id || '')
  const numeroFactura = `WC-${orderId}`

  const { data: existing } = await supabase
    .from('ventas')
    .select('id')
    .eq('numero_factura', numeroFactura)
    .maybeSingle()

  let clienteId: string | null = null
  const email  = billing.email?.trim() || null
  const nombre = [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim()
    || billing.company || 'Cliente WooCommerce'

  if (email) {
    const { data: clienteExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (clienteExistente) {
      clienteId = clienteExistente.id
    } else {
      const { data: nuevoCliente } = await supabase
        .from('clientes')
        .insert({ nombre, email, telefono: billing.phone || null })
        .select('id')
        .single()
      clienteId = nuevoCliente?.id || null
    }
  }

  const items = lineItems.map(item => ({
    sku:             String(item.sku        || ''),
    descripcion:     String(item.name       || ''),
    cantidad:        Number(item.quantity   || 1),
    precio_unitario: Number(item.price      || 0),
    total:           Number(item.total      || 0),
  }))

  const total          = Number(order.total    || 0)
  const subtotalWc     = Number(order.subtotal || order.total || 0)
  const shippingTotal  = Number(order.shipping_total || 0)
  const montoFactura   = total + shippingTotal
  const cobrada        = ['processing', 'completed'].includes(status)
  const fechaStr       = String(order.date_created || new Date().toISOString()).slice(0, 10)

  const wcData = extractWcData(order)

  const payload = {
    fecha:           fechaStr,
    cliente_id:      clienteId,
    monto:           montoFactura,
    moneda:          'ars',
    tipo_cambio:     1,
    monto_ars:       montoFactura,
    tipo:            'blanco_b',
    costo:           0,
    iva_pct:         21,
    iva_monto:       0,
    subtotal:        subtotalWc,
    numero_factura:  numeroFactura,
    razon_social:    billing.company || nombre,
    canal:           'ecommerce',
    origen:          'ecommerce',
    metodo_pago:     mapMetodoPago(String(order.payment_method || '')),
    cobrada,
    fecha_cobro:     cobrada ? fechaStr : null,
    provincia:       mapProvincia(billing.state),
    items:           items.length > 0 ? items : null,
    descripcion:     `Orden WooCommerce #${orderId}`,
    estado:          'pendiente',
    confirmada:      false,
    wc_data:         wcData,
  }

  if (existing) {
    await supabase.from('ventas').update(payload).eq('id', existing.id)
    return { action: 'updated', id: existing.id }
  } else {
    const { data: nueva, error } = await supabase.from('ventas').insert(payload).select('id').single()
    if (error) return { action: 'skipped', error: error.message }
    return { action: 'created', id: nueva.id }
  }
}
