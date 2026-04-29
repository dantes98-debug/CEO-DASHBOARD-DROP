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

const ESTADO_BADGE: Record<string, string> = {
  pendiente: 'bg-yellow-400/10 text-yellow-400',
  parcial:   'bg-blue-400/10 text-blue-400',
  enviado:   'bg-purple-400/10 text-purple-400',
  entregado: 'bg-green-400/10 text-green-400',
}

const ESTADO_ICON: Record<string, React.ElementType> = {
  pendiente: Clock,
  parcial:   Package,
  enviado:   Truck,
  entregado: CheckCircle,
}

const ESTADO_BTN: Record<string, string> = {
  pendiente: 'border-yellow-400 bg-yellow-400/10 text-yellow-400',
  parcial:   'border-blue-400 bg-blue-400/10 text-blue-400',
  enviado:   'border-purple-400 bg-purple-400/10 text-purple-400',
  entregado: 'border-green-400 bg-green-400/10 text-green-400',
}

const ESTADOS_OPTS: { value: Envio['estado']; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'parcial',   label: 'Parcial'   },
  { value: 'enviado',   label: 'Enviado'   },
  { value: 'entregado', label: 'Entregado' },
]

const TRANSPORTISTAS = ['RETIRO DROP', 'RETIRO MOTIC', 'TRANSPORTE']

const MES_LABEL: Record<string, string> = {
  '1': 'Ene', '2': 'Feb', '3': 'Mar', '4': 'Abr',
  '5': 'May', '6': 'Jun', '7': 'Jul', '8': 'Ago',
  '9': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

// Calcula el estado automático basado en cantidades enviadas
function calcEstado(items: ItemEnviado[]): Envio['estado'] {
  if (items.length === 0) return 'enviado'
  const total = items.reduce((s, i) => s + i.cantidad_total, 0)
  const enviado = items.reduce((s, i) => s + i.cantidad_enviada, 0)
  if (enviado === 0) return 'pendiente'
  if (enviado >= total) return 'enviado'
  return 'parcial'
}

export default function EnviosPage() {
  const [ventas, setVentas] = useState<VentaConEnvio[]>([])
  const [loading, setLoading] = useState(true)
  const [puedeVerMonto, setPuedeVerMonto] = useState(false)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<string>('todos')
  const [filterAnio, setFilterAnio] = useState('')
  const [filterMes, setFilterMes] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modal
  const [modalVenta, setModalVenta] = useState<VentaConEnvio | null>(null)
  const [formEstado, setFormEstado] = useState<Envio['estado']>('enviado')
  const [formFecha, setFormFecha] = useState(new Date().toISOString().split('T')[0])
  const [formTracking, setFormTracking] = useState('')
  const [formNotas, setFormNotas] = useState('')
  const [transportistaTipo, setTransportistaTipo] = useState('')
  const [transportistaDetalle, setTransportistaDetalle] = useState('')
  const [itemsEnviados, setItemsEnviados] = useState<ItemEnviado[]>([])
  const [autoEstado, setAutoEstado] = useState(true) // si el estado se calcula automático
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const { data: ventasData } = await supabase
      .from('ventas')
      .select('id, fecha, razon_social, numero_factura, monto_ars, items, canal')
      .order('fecha', { ascending: false })
      .limit(500)

    const { data: enviosData } = await supabase.from('envios').select('*')

    const map = new Map<string, Envio>()
    for (const e of (enviosData || [])) map.set(e.venta_id, e)

    setVentas((ventasData || []).map(v => ({ ...v, envio: map.get(v.id) ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase.from('user_profiles').select('role, permisos').eq('id', user.id).single()
      if (data) setPuedeVerMonto(data.role === 'admin' || data.permisos?.ventas === true)
    })
  }, [])

  const parseTransportista = (value: string | null) => {
    if (!value) return { tipo: '', detalle: '' }
    if (value === 'RETIRO DROP' || value === 'RETIRO MOTIC') return { tipo: value, detalle: '' }
    return { tipo: 'TRANSPORTE', detalle: value }
  }

  const buildItems = (v: VentaConEnvio): ItemEnviado[] =>
    (v.items || []).map(item => ({
      sku: item.sku,
      descripcion: item.descripcion,
      cantidad_total: item.cantidad,
      cantidad_enviada: item.cantidad,
    }))

  const openModal = (v: VentaConEnvio) => {
    if (v.envio) {
      const { tipo, detalle } = parseTransportista(v.envio.transportista)
      setFormEstado(v.envio.estado)
      setFormFecha(v.envio.fecha_envio || new Date().toISOString().split('T')[0])
      setFormTracking(v.envio.numero_tracking || '')
      setFormNotas(v.envio.notas || '')
      setTransportistaTipo(tipo)
      setTransportistaDetalle(detalle)
      setItemsEnviados(v.envio.items_enviados || buildItems(v))
      setAutoEstado(false) // al editar no auto-calcula
    } else {
      const items = buildItems(v)
      setFormEstado(calcEstado(items))
      setFormFecha(new Date().toISOString().split('T')[0])
      setFormTracking('')
      setFormNotas('')
      setTransportistaTipo('')
      setTransportistaDetalle('')
      setItemsEnviados(items)
      setAutoEstado(true)
    }
    setModalVenta(v)
  }

  const updateItemCantidad = (i: number, nueva: number) => {
    const updated = itemsEnviados.map((it, j) =>
      j === i ? { ...it, cantidad_enviada: Math.min(it.cantidad_total, Math.max(0, nueva)) } : it
    )
    setItemsEnviados(updated)
    if (autoEstado) setFormEstado(calcEstado(updated))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalVenta) return
    setSaving(true)

    const ventaId = modalVenta.id
    const envioId = modalVenta.envio?.id ?? null

    const transportistaFinal = transportistaTipo === 'TRANSPORTE'
      ? (transportistaDetalle.trim() || 'TRANSPORTE')
      : transportistaTipo || null

    const payload = {
      venta_id: ventaId,
      estado: formEstado,
      fecha_envio: formFecha || null,
      transportista: transportistaFinal,
      numero_tracking: formTracking || null,
      notas: formNotas || null,
      items_enviados: itemsEnviados.length > 0 ? itemsEnviados : null,
    }

    const supabase = createClient()
    let savedEnvio: Envio | null = null

    if (envioId) {
      const { data } = await supabase.from('envios').update(payload).eq('id', envioId).select().single()
      savedEnvio = data
    } else {
      const { data } = await supabase.from('envios').insert(payload).select().single()
      savedEnvio = data
    }

    // Cerrar modal y actualizar lista
    setModalVenta(null)
    setSaving(false)

    if (savedEnvio) {
      setVentas(prev => prev.map(v =>
        v.id === ventaId ? { ...v, envio: savedEnvio } : v
      ))
    } else {
      await fetchData()
    }
  }

  const handleDelete = async (envioId: string, ventaId: string) => {
    if (!confirm('¿Quitar el registro de envío?')) return
    const supabase = createClient()
    await supabase.from('envios').delete().eq('id', envioId)
    setVentas(prev => prev.map(v => v.id === ventaId ? { ...v, envio: null } : v))
  }

  // Años y meses
  const anios = Array.from(
    new Set(ventas.map(v => new Date(v.fecha).getFullYear().toString()))
  ).sort((a, b) => Number(b) - Number(a))

  const mesesDisponibles = filterAnio
    ? Array.from(new Set(
        ventas
          .filter(v => new Date(v.fecha).getFullYear().toString() === filterAnio)
          .map(v => (new Date(v.fecha).getMonth() + 1).toString())
      )).sort((a, b) => Number(a) - Number(b))
    : []

  const ventasPeriodo = ventas.filter(v => {
    if (!filterAnio) return true
    const d = new Date(v.fecha)
    if (d.getFullYear().toString() !== filterAnio) return false
    if (filterMes && (d.getMonth() + 1).toString() !== filterMes) return false
    return true
  })

  const sinEnvio  = ventasPeriodo.filter(v => !v.envio).length
  const pendientes = ventasPeriodo.filter(v => v.envio?.estado === 'pendiente').length
  const parciales  = ventasPeriodo.filter(v => v.envio?.estado === 'parcial').length
  const enviados   = ventasPeriodo.filter(v => v.envio?.estado === 'enviado').length
  const entregados = ventasPeriodo.filter(v => v.envio?.estado === 'entregado').length

  const filtered = ventasPeriodo.filter(v => {
    const q = search.toLowerCase()
    const matchSearch = !q || v.razon_social?.toLowerCase().includes(q) || v.numero_factura?.toLowerCase().includes(q)
    const matchEstado = filterEstado === 'todos'
      || (filterEstado === 'sin_envio' && !v.envio)
      || (v.envio?.estado === filterEstado)
    return matchSearch && matchEstado
  })

  return (
    <div>
      <PageHeader title="Envíos" description="Estado de envío por venta" icon={Truck} />

      {/* Filtro período */}
      <div className="mb-6 space-y-2">
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-xs text-muted w-10">Año:</span>
          <button onClick={() => { setFilterAnio(''); setFilterMes('') }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!filterAnio ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}>
            Todos
          </button>
          {anios.map(a => (
            <button key={a} onClick={() => { setFilterAnio(a); setFilterMes('') }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterAnio === a ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}>
              {a}
            </button>
          ))}
        </div>
        {filterAnio && mesesDisponibles.length > 0 && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-xs text-muted w-10">Mes:</span>
            <button onClick={() => setFilterMes('')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!filterMes ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}>
              Todos
            </button>
            {mesesDisponibles.map(m => (
              <button key={m} onClick={() => setFilterMes(filterMes === m ? '' : m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterMes === m ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}>
                {MES_LABEL[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {[
          { label: 'Sin registrar', value: sinEnvio,   color: 'text-muted',       bg: 'bg-card',           icon: AlertCircle },
          { label: 'Pendientes',    value: pendientes,  color: 'text-yellow-400',  bg: 'bg-yellow-400/10',  icon: Clock       },
          { label: 'Parciales',     value: parciales,   color: 'text-blue-400',    bg: 'bg-blue-400/10',    icon: Package     },
          { label: 'Enviados',      value: enviados,    color: 'text-purple-400',  bg: 'bg-purple-400/10',  icon: Truck       },
          { label: 'Entregados',    value: entregados,  color: 'text-green-400',   bg: 'bg-green-400/10',   icon: CheckCircle },
        ].map(s => (
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

      {/* Búsqueda + estado */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" placeholder="Buscar por cliente o factura..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:border-accent" />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 flex-wrap">
          {[
            ['todos',      'Todos'],
            ['sin_envio',  'Sin registrar'],
            ['pendiente',  'Pendiente'],
            ['parcial',    'Parcial'],
            ['enviado',    'Enviado'],
            ['entregado',  'Entregado'],
          ].map(([val, label]) => (
            <button key={val} onClick={() => setFilterEstado(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterEstado === val ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
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
                  {puedeVerMonto && <th className="text-left py-3 px-4 text-muted font-medium">Monto</th>}
                  <th className="text-left py-3 px-4 text-muted font-medium">Productos</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Estado</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Transportista</th>
                  <th className="text-center py-3 px-4 text-muted font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const estado = v.envio?.estado ?? null
                  const EstIcon = estado ? ESTADO_ICON[estado] : AlertCircle
                  const isExpanded = expandedId === v.id
                  const hasItems = (v.items?.length ?? 0) > 0
                  return (
                    <>
                      <tr key={v.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                        <td className="py-3 px-4 text-text-secondary">{formatDate(v.fecha)}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-text-primary">{v.razon_social || '—'}</p>
                          {v.numero_factura && <p className="text-xs text-muted">{v.numero_factura}</p>}
                        </td>
                        {puedeVerMonto && <td className="py-3 px-4 font-semibold">{v.monto_ars ? formatCurrency(v.monto_ars) : '—'}</td>}
                        <td className="py-3 px-4">
                          {hasItems ? (
                            <button onClick={() => setExpandedId(isExpanded ? null : v.id)}
                              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors">
                              {v.items!.length} producto{v.items!.length !== 1 ? 's' : ''}
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          ) : <span className="text-xs text-muted">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {estado ? (
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_BADGE[estado]}`}>
                              <EstIcon className="w-3 h-3" />
                              {ESTADOS_OPTS.find(e => e.value === estado)?.label}
                            </span>
                          ) : <span className="text-xs text-muted italic">Sin registrar</span>}
                        </td>
                        <td className="py-3 px-4">
                          {v.envio?.transportista ? (
                            <div>
                              <p className="text-xs font-medium text-text-secondary">{v.envio.transportista}</p>
                              {v.envio.numero_tracking && <p className="text-xs font-mono text-accent">{v.envio.numero_tracking}</p>}
                            </div>
                          ) : <span className="text-xs text-muted">—</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openModal(v)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                              {v.envio ? 'Editar' : 'Registrar'}
                            </button>
                            {v.envio && (
                              <button onClick={() => handleDelete(v.envio!.id, v.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                                Quitar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && hasItems && (
                        <tr key={`${v.id}-exp`} className="border-b border-border/50 bg-card-hover/30">
                          <td colSpan={puedeVerMonto ? 7 : 6} className="px-6 py-3">
                            <div className="space-y-1">
                              {v.items!.map((item, i) => {
                                const itemEnv = v.envio?.items_enviados?.find(ie => ie.sku === item.sku)
                                const enviada = itemEnv?.cantidad_enviada ?? null
                                const completo = enviada !== null && enviada >= item.cantidad
                                const parcialItem = enviada !== null && enviada > 0 && enviada < item.cantidad
                                return (
                                  <div key={i} className="flex items-center gap-3 text-xs py-1">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${completo ? 'bg-green-400/20 text-green-400' : parcialItem ? 'bg-blue-400/20 text-blue-400' : 'bg-border text-muted'}`}>
                                      {completo ? <Check className="w-2.5 h-2.5" /> : parcialItem ? <Package className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                                    </div>
                                    <span className="text-muted font-mono">{item.sku}</span>
                                    <span className="text-text-secondary flex-1">{item.descripcion}</span>
                                    <span className="text-muted">{enviada !== null ? `${enviada}/${item.cantidad}` : `0/${item.cantidad}`} u.</span>
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
            {filtered.length} de {ventasPeriodo.length} ventas
            {filterAnio && <span className="ml-1 text-accent">— {filterAnio}{filterMes ? ` · ${MES_LABEL[filterMes]}` : ''}</span>}
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={!!modalVenta} onClose={() => setModalVenta(null)} title={modalVenta?.envio ? 'Editar envío' : 'Registrar envío'}>
        {modalVenta && (
          <form onSubmit={handleSave} className="space-y-5">
            {/* Info venta */}
            <div className="rounded-lg border border-border bg-card-hover p-3 text-sm">
              <p className="font-medium text-text-primary">{modalVenta.razon_social || 'Sin cliente'}</p>
              <div className="flex gap-3 mt-0.5 text-xs text-muted">
                {modalVenta.numero_factura && <span>{modalVenta.numero_factura}</span>}
                <span>{formatDate(modalVenta.fecha)}</span>
                {puedeVerMonto && modalVenta.monto_ars && <span>{formatCurrency(modalVenta.monto_ars)}</span>}
              </div>
            </div>

            {/* Estado — botones */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">Estado</label>
                {autoEstado && itemsEnviados.length > 0 && (
                  <span className="text-xs text-accent">Se calcula automático según productos</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {ESTADOS_OPTS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setFormEstado(opt.value); setAutoEstado(false) }}
                    className={`py-2 rounded-lg border-2 text-xs font-semibold transition-all ${
                      formEstado === opt.value
                        ? ESTADO_BTN[opt.value]
                        : 'border-border text-text-secondary hover:border-accent hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de envío</label>
              <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)} />
            </div>

            {/* Transportista — botones */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Transportista</label>
              <div className="flex gap-2 flex-wrap">
                {TRANSPORTISTAS.map(t => (
                  <button key={t} type="button"
                    onClick={() => { setTransportistaTipo(transportistaTipo === t ? '' : t); setTransportistaDetalle('') }}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      transportistaTipo === t
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text-secondary hover:border-accent hover:text-text-primary'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
              {transportistaTipo === 'TRANSPORTE' && (
                <input type="text" className="mt-2" value={transportistaDetalle}
                  onChange={e => setTransportistaDetalle(e.target.value)}
                  placeholder="Ej: OCA, Andreani, Correo Argentino..." autoFocus />
              )}
            </div>

            {/* Tracking */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Nro. de tracking</label>
              <input type="text" value={formTracking} onChange={e => setFormTracking(e.target.value)} placeholder="Código de seguimiento" />
            </div>

            {/* Items enviados */}
            {itemsEnviados.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-text-secondary">Productos enviados</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { const all = itemsEnviados.map(i => ({ ...i, cantidad_enviada: i.cantidad_total })); setItemsEnviados(all); if (autoEstado) setFormEstado(calcEstado(all)) }}
                      className="text-xs text-accent hover:text-accent-hover transition-colors">Todos</button>
                    <span className="text-muted text-xs">·</span>
                    <button type="button" onClick={() => { const none = itemsEnviados.map(i => ({ ...i, cantidad_enviada: 0 })); setItemsEnviados(none); if (autoEstado) setFormEstado(calcEstado(none)) }}
                      className="text-xs text-muted hover:text-text-primary transition-colors">Ninguno</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {itemsEnviados.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 bg-card-hover rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{item.descripcion}</p>
                        <p className="text-xs text-muted font-mono">{item.sku} — {item.cantidad_total} u. totales</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button type="button"
                          onClick={() => updateItemCantidad(i, item.cantidad_enviada - 1)}
                          className="w-7 h-7 rounded bg-border hover:bg-card text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center text-lg font-bold leading-none">−</button>
                        <input type="number" min={0} max={item.cantidad_total}
                          value={item.cantidad_enviada}
                          onChange={e => updateItemCantidad(i, Number(e.target.value))}
                          className="w-14 text-center bg-card border border-border rounded px-1 py-1 text-sm font-semibold" />
                        <button type="button"
                          onClick={() => updateItemCantidad(i, item.cantidad_enviada + 1)}
                          className="w-7 h-7 rounded bg-border hover:bg-card text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center text-lg font-bold leading-none">+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted mt-1.5">
                  El estado se calcula automático: todos enviados = Enviado, algunos = Parcial, ninguno = Pendiente.
                  <button type="button" onClick={() => setAutoEstado(!autoEstado)}
                    className="ml-1 text-accent hover:underline">
                    {autoEstado ? 'Cambiar manualmente' : 'Volver a automático'}
                  </button>
                </p>
              </div>
            )}

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas</label>
              <textarea value={formNotas} onChange={e => setFormNotas(e.target.value)}
                placeholder="Ej: Falta un ítem, se envía la próxima semana..." rows={2} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalVenta(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
