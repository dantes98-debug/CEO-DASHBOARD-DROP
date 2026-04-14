'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import { formatDate, formatCurrency } from '@/lib/utils'
import Modal from '@/components/Modal'
import { Truck, Package, CheckCircle, Clock, AlertCircle, Search, ChevronDown, ChevronUp, Check, X } from 'lucide-react'

interface ItemFactura {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  total: number
}

interface Venta {
  id: string
  fecha: string
  razon_social: string | null
  numero_factura: string | null
  monto_ars: number | null
  items: ItemFactura[] | null
  canal: string | null
}

interface ItemEnviado {
  sku: string
  descripcion: string
  cantidad_total: number
  cantidad_enviada: number
}

interface Envio {
  id: string
  venta_id: string
  estado: 'pendiente' | 'parcial' | 'enviado' | 'entregado'
  items_enviados: ItemEnviado[] | null
  fecha_envio: string | null
  transportista: string | null
  numero_tracking: string | null
  notas: string | null
}

interface VentaConEnvio extends Venta {
  envio: Envio | null
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  enviado: 'Enviado',
  entregado: 'Entregado',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-400/10 text-yellow-400',
  parcial: 'bg-blue-400/10 text-blue-400',
  enviado: 'bg-purple-400/10 text-purple-400',
  entregado: 'bg-green-400/10 text-green-400',
}

const ESTADO_ICON: Record<string, React.ElementType> = {
  pendiente: Clock,
  parcial: Package,
  enviado: Truck,
  entregado: CheckCircle,
}

const FORM_DEFAULT = {
  estado: 'enviado' as Envio['estado'],
  fecha_envio: new Date().toISOString().split('T')[0],
  transportista: '',
  numero_tracking: '',
  notas: '',
}

export default function EnviosPage() {
  const [ventas, setVentas] = useState<VentaConEnvio[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<string>('todos')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalVenta, setModalVenta] = useState<VentaConEnvio | null>(null)
  const [form, setForm] = useState(FORM_DEFAULT)
  const [itemsEnviados, setItemsEnviados] = useState<ItemEnviado[]>([])
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [ventasRes, enviosRes] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, fecha, razon_social, numero_factura, monto_ars, items, canal')
        .order('fecha', { ascending: false })
        .limit(200),
      supabase.from('envios').select('*'),
    ])

    const enviosMap = new Map<string, Envio>()
    for (const e of (enviosRes.data || [])) {
      enviosMap.set(e.venta_id, e)
    }

    const combined: VentaConEnvio[] = (ventasRes.data || []).map((v) => ({
      ...v,
      envio: enviosMap.get(v.id) || null,
    }))

    setVentas(combined)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openModal = (v: VentaConEnvio) => {
    setModalVenta(v)
    if (v.envio) {
      setForm({
        estado: v.envio.estado,
        fecha_envio: v.envio.fecha_envio || new Date().toISOString().split('T')[0],
        transportista: v.envio.transportista || '',
        numero_tracking: v.envio.numero_tracking || '',
        notas: v.envio.notas || '',
      })
      setItemsEnviados(v.envio.items_enviados || buildItemsFromVenta(v))
    } else {
      setForm(FORM_DEFAULT)
      setItemsEnviados(buildItemsFromVenta(v))
    }
  }

  const buildItemsFromVenta = (v: VentaConEnvio): ItemEnviado[] => {
    if (!v.items || v.items.length === 0) return []
    return v.items.map((item) => ({
      sku: item.sku,
      descripcion: item.descripcion,
      cantidad_total: item.cantidad,
      cantidad_enviada: item.cantidad,
    }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalVenta) return
    setSaving(true)
    const supabase = createClient()

    const payload = {
      venta_id: modalVenta.id,
      estado: form.estado,
      fecha_envio: form.fecha_envio || null,
      transportista: form.transportista || null,
      numero_tracking: form.numero_tracking || null,
      notas: form.notas || null,
      items_enviados: itemsEnviados.length > 0 ? itemsEnviados : null,
    }

    if (modalVenta.envio) {
      await supabase.from('envios').update(payload).eq('id', modalVenta.envio.id)
    } else {
      await supabase.from('envios').insert(payload)
    }

    await fetchData()
    setModalVenta(null)
    setSaving(false)
  }

  const handleDeleteEnvio = async (envioId: string) => {
    if (!confirm('¿Quitar el registro de envío?')) return
    const supabase = createClient()
    await supabase.from('envios').delete().eq('id', envioId)
    await fetchData()
  }

  // Stats
  const total = ventas.length
  const sinEnvio = ventas.filter((v) => !v.envio).length
  const pendientes = ventas.filter((v) => v.envio?.estado === 'pendiente').length
  const parciales = ventas.filter((v) => v.envio?.estado === 'parcial').length
  const entregados = ventas.filter((v) => v.envio?.estado === 'entregado').length

  const filtered = ventas.filter((v) => {
    const matchSearch = !search || (
      v.razon_social?.toLowerCase().includes(search.toLowerCase()) ||
      v.numero_factura?.toLowerCase().includes(search.toLowerCase())
    )
    const estado = v.envio?.estado || 'sin_envio'
    const matchEstado = filterEstado === 'todos' || estado === filterEstado || (filterEstado === 'sin_envio' && !v.envio)
    return matchSearch && matchEstado
  })

  return (
    <div>
      <PageHeader
        title="Envíos"
        description="Estado de envío por venta"
        icon={Truck}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Sin registrar', value: sinEnvio, color: 'text-muted', bg: 'bg-card', icon: AlertCircle },
          { label: 'Pendientes', value: pendientes, color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Clock },
          { label: 'Parciales', value: parciales, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Package },
          { label: 'Entregados', value: entregados, color: 'text-green-400', bg: 'bg-green-400/10', icon: CheckCircle },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Buscar por cliente o factura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 flex-wrap">
          {[
            ['todos', 'Todos'],
            ['sin_envio', 'Sin registrar'],
            ['pendiente', 'Pendiente'],
            ['parcial', 'Parcial'],
            ['enviado', 'Enviado'],
            ['entregado', 'Entregado'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterEstado(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterEstado === val ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Truck className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">Sin resultados</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted font-medium">Fecha</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Cliente / Factura</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Monto</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Productos</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Estado envío</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Tracking</th>
                  <th className="text-center py-3 px-4 text-muted font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const estado = v.envio?.estado || null
                  const EstIcon = estado ? ESTADO_ICON[estado] : AlertCircle
                  const isExpanded = expandedId === v.id
                  const hasItems = v.items && v.items.length > 0

                  return (
                    <>
                      <tr
                        key={v.id}
                        className="border-b border-border/50 hover:bg-card-hover transition-colors"
                      >
                        <td className="py-3 px-4 text-text-secondary">{formatDate(v.fecha)}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-text-primary">{v.razon_social || '—'}</p>
                          {v.numero_factura && <p className="text-xs text-muted">{v.numero_factura}</p>}
                        </td>
                        <td className="py-3 px-4 font-semibold">{v.monto_ars ? formatCurrency(v.monto_ars) : '—'}</td>
                        <td className="py-3 px-4">
                          {hasItems ? (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : v.id)}
                              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
                            >
                              {v.items!.length} producto{v.items!.length !== 1 ? 's' : ''}
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {estado ? (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[estado]}`}>
                              <EstIcon className="w-3 h-3" />
                              {ESTADO_LABEL[estado]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted italic">Sin registrar</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {v.envio?.numero_tracking ? (
                            <div>
                              <p className="text-xs text-text-secondary">{v.envio.transportista || '—'}</p>
                              <p className="text-xs font-mono text-accent">{v.envio.numero_tracking}</p>
                            </div>
                          ) : v.envio?.transportista ? (
                            <p className="text-xs text-text-secondary">{v.envio.transportista}</p>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openModal(v)}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {v.envio ? 'Editar' : 'Registrar'}
                            </button>
                            {v.envio && (
                              <button
                                onClick={() => handleDeleteEnvio(v.envio!.id)}
                                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && hasItems && (
                        <tr key={`${v.id}-expanded`} className="border-b border-border/50 bg-card-hover/30">
                          <td colSpan={7} className="px-6 py-3">
                            <div className="grid grid-cols-1 gap-1">
                              {v.items!.map((item, i) => {
                                const itemEnv = v.envio?.items_enviados?.find((ie) => ie.sku === item.sku)
                                const enviada = itemEnv?.cantidad_enviada ?? null
                                const parcial = enviada !== null && enviada < item.cantidad
                                const completo = enviada !== null && enviada >= item.cantidad

                                return (
                                  <div key={i} className="flex items-center gap-3 text-xs py-1">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${completo ? 'bg-green-400/20 text-green-400' : parcial ? 'bg-blue-400/20 text-blue-400' : 'bg-border text-muted'}`}>
                                      {completo ? <Check className="w-2.5 h-2.5" /> : parcial ? <Package className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                                    </div>
                                    <span className="text-muted font-mono">{item.sku}</span>
                                    <span className="text-text-secondary flex-1">{item.descripcion}</span>
                                    <span className="text-muted">
                                      {enviada !== null ? `${enviada}/${item.cantidad}` : `0/${item.cantidad}`} u.
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted text-right">
            {filtered.length} de {total} ventas
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={!!modalVenta} onClose={() => setModalVenta(null)} title={modalVenta?.envio ? 'Editar envío' : 'Registrar envío'}>
        {modalVenta && (
          <form onSubmit={handleSave} className="space-y-4">
            {/* Venta info */}
            <div className="bg-card-hover rounded-lg p-3 text-sm">
              <p className="font-medium text-text-primary">{modalVenta.razon_social || 'Sin cliente'}</p>
              <div className="flex gap-3 mt-0.5 text-xs text-muted">
                {modalVenta.numero_factura && <span>{modalVenta.numero_factura}</span>}
                <span>{formatDate(modalVenta.fecha)}</span>
                {modalVenta.monto_ars && <span>{formatCurrency(modalVenta.monto_ars)}</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Estado *</label>
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as Envio['estado'] })}>
                  {Object.entries(ESTADO_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de envío</label>
                <input type="date" value={form.fecha_envio} onChange={(e) => setForm({ ...form, fecha_envio: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Transportista</label>
                <input type="text" value={form.transportista} onChange={(e) => setForm({ ...form, transportista: e.target.value })} placeholder="Ej: OCA, Andreani, Correo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Nro. de tracking</label>
                <input type="text" value={form.numero_tracking} onChange={(e) => setForm({ ...form, numero_tracking: e.target.value })} placeholder="Código de seguimiento" />
              </div>
            </div>

            {/* Items enviados */}
            {itemsEnviados.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Productos enviados</label>
                <div className="space-y-2">
                  {itemsEnviados.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 bg-card-hover rounded-lg px-3 py-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary truncate">{item.descripcion}</p>
                        <p className="text-xs text-muted font-mono">{item.sku} — total: {item.cantidad_total} u.</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setItemsEnviados(itemsEnviados.map((it, j) => j === i ? { ...it, cantidad_enviada: Math.max(0, it.cantidad_enviada - 1) } : it))}
                          className="w-6 h-6 rounded bg-border hover:bg-card text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center font-bold"
                        >−</button>
                        <input
                          type="number"
                          min={0}
                          max={item.cantidad_total}
                          value={item.cantidad_enviada}
                          onChange={(e) => setItemsEnviados(itemsEnviados.map((it, j) => j === i ? { ...it, cantidad_enviada: Math.min(item.cantidad_total, Math.max(0, Number(e.target.value))) } : it))}
                          className="w-12 text-center bg-card border border-border rounded px-1 py-0.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setItemsEnviados(itemsEnviados.map((it, j) => j === i ? { ...it, cantidad_enviada: Math.min(it.cantidad_total, it.cantidad_enviada + 1) } : it))}
                          className="w-6 h-6 rounded bg-border hover:bg-card text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center font-bold"
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted mt-1.5">Ajustá la cantidad enviada por producto para envíos parciales.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas</label>
              <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej: Falta un ítem, se envía la próxima semana..." rows={2} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalVenta(null)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
