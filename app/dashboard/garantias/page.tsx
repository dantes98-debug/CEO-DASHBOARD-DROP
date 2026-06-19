'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  ShieldCheck, Plus, Clock, Wrench, CheckCircle2, XCircle,
  AlertTriangle, Pencil, Trash2, MessageSquare, Search, X,
} from 'lucide-react'

type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
type Estado = 'pendiente' | 'en_gestion' | 'en_reparacion' | 'resuelto' | 'rechazado'

interface VentaRef {
  id: string
  numero_factura: string | null
  fecha: string
  monto_ars: number
  descripcion: string | null
  razon_social: string | null
  clientes: { nombre: string } | null
  items: { descripcion: string; cantidad: number }[] | null
}

interface Garantia {
  id: string
  numero: number
  venta_id: string | null
  cliente_nombre: string | null
  producto: string | null
  numero_factura: string | null
  fecha_compra: string | null
  problema: string
  prioridad: Prioridad
  estado: Estado
  notas_internas: string | null
  asignado_a: string | null
  created_at: string
  resuelto_at: string | null
  ventas?: {
    numero_factura: string | null
    fecha: string
    monto_ars: number
    razon_social: string | null
    clientes: { nombre: string } | null
    items: { descripcion: string; cantidad: number }[] | null
  } | null
}

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: 'Pendiente',
  en_gestion: 'En gestión',
  en_reparacion: 'En reparación',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
}

const ESTADO_COLOR: Record<Estado, string> = {
  pendiente: 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20',
  en_gestion: 'bg-blue-400/10 text-blue-400 border border-blue-400/20',
  en_reparacion: 'bg-orange-400/10 text-orange-400 border border-orange-400/20',
  resuelto: 'bg-green-400/10 text-green-400 border border-green-400/20',
  rechazado: 'bg-red-400/10 text-red-400 border border-red-400/20',
}

const ESTADO_ICON: Record<Estado, React.ElementType> = {
  pendiente: Clock,
  en_gestion: MessageSquare,
  en_reparacion: Wrench,
  resuelto: CheckCircle2,
  rechazado: XCircle,
}

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  baja: 'bg-slate-400/10 text-slate-400',
  media: 'bg-blue-400/10 text-blue-400',
  alta: 'bg-orange-400/10 text-orange-400',
  urgente: 'bg-red-400/10 text-red-400',
}

const ESTADOS_ORDEN: Estado[] = ['pendiente', 'en_gestion', 'en_reparacion', 'resuelto', 'rechazado']

const FORM_DEFAULT = {
  problema: '',
  prioridad: 'media' as Prioridad,
  estado: 'pendiente' as Estado,
  notas_internas: '',
  asignado_a: '',
}

function ventaLabel(v: VentaRef) {
  const cliente = v.clientes?.nombre || v.razon_social || 'Sin nombre'
  const factura = v.numero_factura ? `· ${v.numero_factura}` : ''
  return `${cliente} ${factura} — ${formatDate(v.fecha)} (${formatCurrency(v.monto_ars)})`
}

function ventaProducto(v: VentaRef | null | undefined): string {
  if (!v) return ''
  if (v.items?.length) return v.items.map(i => i.descripcion).filter(Boolean).join(', ')
  return v.descripcion || ''
}

function ventaCliente(v: VentaRef | null | undefined): string {
  if (!v) return ''
  return v.clientes?.nombre || v.razon_social || ''
}

export default function GarantiasPage() {
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Garantia | null>(null)
  const [form, setForm] = useState(FORM_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<Estado | 'todos'>('todos')
  const [selected, setSelected] = useState<Garantia | null>(null)

  // Venta search
  const [ventaQuery, setVentaQuery] = useState('')
  const [ventaResultados, setVentaResultados] = useState<VentaRef[]>([])
  const [ventaSeleccionada, setVentaSeleccionada] = useState<VentaRef | null>(null)
  const [buscandoVenta, setBuscandoVenta] = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('garantias')
      .select('*, ventas(numero_factura, fecha, monto_ars, razon_social, items, clientes(nombre))')
      .order('created_at', { ascending: false })
    setGarantias(data || [])
    setLoading(false)
  }

  const buscarVentas = (q: string) => {
    setVentaQuery(q)
    if (searchRef.current) clearTimeout(searchRef.current)
    if (!q.trim()) { setVentaResultados([]); return }
    setBuscandoVenta(true)
    searchRef.current = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('ventas')
        .select('id, numero_factura, fecha, monto_ars, descripcion, razon_social, items, clientes(nombre)')
        .or(`numero_factura.ilike.%${q}%,razon_social.ilike.%${q}%,descripcion.ilike.%${q}%`)
        .order('fecha', { ascending: false })
        .limit(8)
      setVentaResultados((data as VentaRef[]) || [])
      setBuscandoVenta(false)
    }, 300)
  }

  const seleccionarVenta = (v: VentaRef) => {
    setVentaSeleccionada(v)
    setVentaQuery('')
    setVentaResultados([])
  }

  const openNew = () => {
    setEditTarget(null)
    setForm(FORM_DEFAULT)
    setVentaSeleccionada(null)
    setVentaQuery('')
    setVentaResultados([])
    setMsg(null)
    setModalOpen(true)
  }

  const openEdit = (g: Garantia) => {
    setEditTarget(g)
    setForm({
      problema: g.problema,
      prioridad: g.prioridad,
      estado: g.estado,
      notas_internas: g.notas_internas || '',
      asignado_a: g.asignado_a || '',
    })
    // Reconstruct ventaRef from joined data if exists
    if (g.venta_id && g.ventas) {
      setVentaSeleccionada({
        id: g.venta_id,
        numero_factura: g.ventas.numero_factura,
        fecha: g.ventas.fecha,
        monto_ars: g.ventas.monto_ars,
        descripcion: null,
        razon_social: g.ventas.razon_social,
        clientes: g.ventas.clientes,
        items: g.ventas.items,
      })
    } else {
      setVentaSeleccionada(null)
    }
    setVentaQuery('')
    setVentaResultados([])
    setMsg(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ventaSeleccionada) { setMsg('Seleccioná una venta para vincular la garantía'); return }
    setSaving(true)
    setMsg(null)
    const supabase = createClient()

    const payload: Record<string, unknown> = {
      venta_id: ventaSeleccionada.id,
      problema: form.problema,
      prioridad: form.prioridad,
      estado: form.estado,
      notas_internas: form.notas_internas || null,
      asignado_a: form.asignado_a || null,
    }

    if (form.estado === 'resuelto' || form.estado === 'rechazado') {
      payload.resuelto_at = new Date().toISOString()
    } else {
      payload.resuelto_at = null
    }

    if (editTarget) {
      const { error } = await supabase.from('garantias').update(payload).eq('id', editTarget.id)
      if (error) { setMsg('Error al guardar'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('garantias').insert(payload)
      if (error) { setMsg('Error al guardar'); setSaving(false); return }
    }

    await fetchData()
    setModalOpen(false)
    setSaving(false)
    if (selected && editTarget && selected.id === editTarget.id) setSelected(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta consulta de garantía?')) return
    const supabase = createClient()
    await supabase.from('garantias').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    await fetchData()
  }

  const cambiarEstado = async (g: Garantia, nuevoEstado: Estado) => {
    const supabase = createClient()
    const extra: Record<string, unknown> = {}
    if (nuevoEstado === 'resuelto' || nuevoEstado === 'rechazado') {
      extra.resuelto_at = new Date().toISOString()
    } else {
      extra.resuelto_at = null
    }
    await supabase.from('garantias').update({ estado: nuevoEstado, ...extra }).eq('id', g.id)
    await fetchData()
    if (selected?.id === g.id) setSelected(prev => prev ? { ...prev, estado: nuevoEstado } : null)
  }

  const filtered = garantias.filter(g =>
    filtroEstado === 'todos' || g.estado === filtroEstado
  )

  const pendientes = garantias.filter(g => g.estado === 'pendiente').length
  const enGestion = garantias.filter(g => ['en_gestion', 'en_reparacion'].includes(g.estado)).length
  const resueltasMes = garantias.filter(g => {
    if (!g.resuelto_at) return false
    const d = new Date(g.resuelto_at)
    const hoy = new Date()
    return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear()
  }).length
  const urgentes = garantias.filter(g => g.prioridad === 'urgente' && !['resuelto', 'rechazado'].includes(g.estado)).length

  return (
    <div>
      <PageHeader
        title="Garantías & Postventa"
        description="Consultas de garantía vinculadas a ventas existentes"
        icon={ShieldCheck}
        action={
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva consulta
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pendientes', value: pendientes, color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Clock },
          { label: 'En gestión', value: enGestion, color: 'text-blue-400', bg: 'bg-blue-400/10', icon: Wrench },
          { label: 'Resueltas este mes', value: resueltasMes, color: 'text-green-400', bg: 'bg-green-400/10', icon: CheckCircle2 },
          { label: 'Urgentes activas', value: urgentes, color: urgentes > 0 ? 'text-red-400' : 'text-green-400', bg: urgentes > 0 ? 'bg-red-400/10' : 'bg-green-400/10', icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-xs text-muted">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-1 bg-background border border-border rounded-lg p-1 mb-6 w-fit">
        {(['todos', ...ESTADOS_ORDEN] as const).map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filtroEstado === e ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'}`}
          >
            {e === 'todos' ? 'Todos' : ESTADO_LABEL[e]}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-xl border border-border animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium mb-1">Sin consultas registradas</p>
          <p className="text-sm text-muted">Cargá una nueva consulta vinculando una venta existente.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          <div className="flex-1 space-y-3 min-w-0">
            {filtered.map((g) => {
              const Icon = ESTADO_ICON[g.estado]
              const isSelected = selected?.id === g.id
              const cliente = ventaCliente(g.ventas as any) || g.cliente_nombre || '—'
              const producto = ventaProducto(g.ventas as any) || g.producto || '—'
              const factura = g.ventas?.numero_factura || g.numero_factura || null
              return (
                <div
                  key={g.id}
                  onClick={() => setSelected(isSelected ? null : g)}
                  className={`bg-card rounded-xl border transition-all cursor-pointer ${isSelected ? 'border-accent/60 shadow-sm shadow-accent/10' : 'border-border hover:border-border/80 hover:bg-card-hover/30'}`}
                >
                  <div className="p-4 flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${ESTADO_COLOR[g.estado].split(' ').slice(0,2).join(' ')}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted font-mono">GAR-{String(g.numero).padStart(4, '0')}</span>
                            {factura && <span className="text-xs text-muted">· {factura}</span>}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[g.estado]}`}>{ESTADO_LABEL[g.estado]}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORIDAD_COLOR[g.prioridad]}`}>{g.prioridad.charAt(0).toUpperCase() + g.prioridad.slice(1)}</span>
                          </div>
                          <p className="font-semibold text-text-primary mt-1 truncate">{cliente}</p>
                          <p className="text-sm text-text-secondary truncate">{producto}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-muted">{formatDate(g.created_at.split('T')[0])}</p>
                          {g.asignado_a && <p className="text-xs text-accent mt-0.5">{g.asignado_a}</p>}
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary mt-2 line-clamp-2">{g.problema}</p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="border-t border-border px-4 py-3 flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                      <span className="text-xs text-muted">Estado:</span>
                      {ESTADOS_ORDEN.map(est => (
                        <button
                          key={est}
                          disabled={g.estado === est}
                          onClick={() => cambiarEstado(g, est)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${g.estado === est ? `${ESTADO_COLOR[est]} font-semibold` : 'border-border text-text-secondary hover:border-accent/50 hover:text-text-primary'}`}
                        >
                          {ESTADO_LABEL[est]}
                        </button>
                      ))}
                      <div className="flex-1" />
                      <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="w-80 flex-shrink-0">
              <div className="bg-card rounded-xl border border-border p-5 sticky top-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted font-mono">GAR-{String(selected.numero).padStart(4, '0')}</span>
                  <button onClick={() => setSelected(null)} className="text-muted hover:text-text-primary text-xs">✕</button>
                </div>

                <div>
                  <p className="text-base font-bold text-text-primary">{ventaCliente(selected.ventas as any) || selected.cliente_nombre || '—'}</p>
                </div>

                <div className="space-y-2 text-sm">
                  {(selected.ventas?.numero_factura || selected.numero_factura) && (
                    <Row label="Factura" value={selected.ventas?.numero_factura || selected.numero_factura || ''} />
                  )}
                  {selected.ventas?.fecha && <Row label="Fecha compra" value={formatDate(selected.ventas.fecha)} />}
                  {selected.ventas?.monto_ars && <Row label="Monto venta" value={formatCurrency(selected.ventas.monto_ars)} />}
                  {selected.asignado_a && <Row label="Asignado a" value={selected.asignado_a} />}
                  <Row label="Ingresado" value={formatDate(selected.created_at.split('T')[0])} />
                  {selected.resuelto_at && <Row label="Resuelto" value={formatDate(selected.resuelto_at.split('T')[0])} />}
                </div>

                {ventaProducto(selected.ventas as any) && (
                  <div>
                    <p className="text-xs text-muted mb-1 font-medium">Producto/s</p>
                    <p className="text-sm text-text-secondary">{ventaProducto(selected.ventas as any)}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted mb-1 font-medium">Problema</p>
                  <p className="text-sm text-text-secondary leading-relaxed">{selected.problema}</p>
                </div>

                {selected.notas_internas && (
                  <div>
                    <p className="text-xs text-muted mb-1 font-medium">Notas internas</p>
                    <p className="text-sm text-text-secondary leading-relaxed bg-card-hover rounded-lg p-3">{selected.notas_internas}</p>
                  </div>
                )}

                <button
                  onClick={() => openEdit(selected)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar consulta
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? `Editar GAR-${String(editTarget.numero).padStart(4, '0')}` : 'Nueva consulta de garantía'}
      >
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Venta search */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Venta vinculada</p>

            {ventaSeleccionada ? (
              <div className="flex items-start justify-between gap-3 bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {ventaCliente(ventaSeleccionada) || '—'}
                  </p>
                  {ventaSeleccionada.numero_factura && (
                    <p className="text-xs text-muted">{ventaSeleccionada.numero_factura} · {formatDate(ventaSeleccionada.fecha)}</p>
                  )}
                  {ventaProducto(ventaSeleccionada) && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{ventaProducto(ventaSeleccionada)}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setVentaSeleccionada(null)}
                  className="text-muted hover:text-red-400 flex-shrink-0 mt-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={ventaQuery}
                    onChange={e => buscarVentas(e.target.value)}
                    placeholder="Buscá por N° factura, cliente o descripción..."
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                {(ventaResultados.length > 0 || buscandoVenta) && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                    {buscandoVenta ? (
                      <p className="text-xs text-muted px-4 py-3">Buscando...</p>
                    ) : (
                      ventaResultados.map(v => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => seleccionarVenta(v)}
                          className="w-full text-left px-4 py-3 hover:bg-card-hover transition-colors border-b border-border/50 last:border-0"
                        >
                          <p className="text-sm font-medium text-text-primary truncate">
                            {ventaCliente(v) || v.razon_social || '—'}
                            {v.numero_factura && <span className="text-muted font-normal"> · {v.numero_factura}</span>}
                          </p>
                          <p className="text-xs text-muted mt-0.5">{formatDate(v.fecha)} · {formatCurrency(v.monto_ars)}</p>
                          {ventaProducto(v) && <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{ventaProducto(v)}</p>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Problema */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Consulta / Problema</p>
            <textarea
              value={form.problema}
              onChange={e => setForm({ ...form, problema: e.target.value })}
              placeholder="Describí el problema o la consulta del cliente..."
              rows={3}
              required
            />
          </div>

          {/* Gestión */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Gestión</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Prioridad</label>
                <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value as Prioridad })}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Estado</label>
                <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value as Estado })}>
                  {ESTADOS_ORDEN.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Asignado a</label>
                <input
                  type="text"
                  value={form.asignado_a}
                  onChange={e => setForm({ ...form, asignado_a: e.target.value })}
                  placeholder="Ej: Ramiro"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas internas</label>
                <textarea
                  value={form.notas_internas}
                  onChange={e => setForm({ ...form, notas_internas: e.target.value })}
                  placeholder="Notas internas de gestión..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          {msg && <p className="text-sm text-red-400">{msg}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted flex-shrink-0">{label}</span>
      <span className="text-text-primary text-right">{value}</span>
    </div>
  )
}
