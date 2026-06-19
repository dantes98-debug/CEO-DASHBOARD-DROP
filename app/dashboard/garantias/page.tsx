'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import { formatDate } from '@/lib/utils'
import {
  ShieldCheck, Plus, Clock, Wrench, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, Pencil, Trash2, MessageSquare,
} from 'lucide-react'

type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
type Estado = 'pendiente' | 'en_gestion' | 'en_reparacion' | 'resuelto' | 'rechazado'

interface Garantia {
  id: string
  numero: number
  cliente_nombre: string
  cliente_telefono: string | null
  cliente_email: string | null
  producto: string
  fecha_compra: string | null
  numero_factura: string | null
  problema: string
  prioridad: Prioridad
  estado: Estado
  notas_internas: string | null
  asignado_a: string | null
  created_at: string
  resuelto_at: string | null
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

const FORM_DEFAULT = {
  cliente_nombre: '',
  cliente_telefono: '',
  cliente_email: '',
  producto: '',
  fecha_compra: '',
  numero_factura: '',
  problema: '',
  prioridad: 'media' as Prioridad,
  estado: 'pendiente' as Estado,
  notas_internas: '',
  asignado_a: '',
}

const ESTADOS_ORDEN: Estado[] = ['pendiente', 'en_gestion', 'en_reparacion', 'resuelto', 'rechazado']

export default function GarantiasPage() {
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Garantia | null>(null)
  const [form, setForm] = useState(FORM_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<Estado | 'todos'>('todos')
  const [filtroPrioridad, setFiltroPrioridad] = useState<Prioridad | 'todos'>('todos')
  const [selected, setSelected] = useState<Garantia | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('garantias')
      .select('*')
      .order('created_at', { ascending: false })
    setGarantias(data || [])
    setLoading(false)
  }

  const openNew = () => {
    setEditTarget(null)
    setForm(FORM_DEFAULT)
    setMsg(null)
    setModalOpen(true)
  }

  const openEdit = (g: Garantia) => {
    setEditTarget(g)
    setForm({
      cliente_nombre: g.cliente_nombre,
      cliente_telefono: g.cliente_telefono || '',
      cliente_email: g.cliente_email || '',
      producto: g.producto,
      fecha_compra: g.fecha_compra || '',
      numero_factura: g.numero_factura || '',
      problema: g.problema,
      prioridad: g.prioridad,
      estado: g.estado,
      notas_internas: g.notas_internas || '',
      asignado_a: g.asignado_a || '',
    })
    setMsg(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const supabase = createClient()

    const payload: Record<string, unknown> = {
      cliente_nombre: form.cliente_nombre,
      cliente_telefono: form.cliente_telefono || null,
      cliente_email: form.cliente_email || null,
      producto: form.producto,
      fecha_compra: form.fecha_compra || null,
      numero_factura: form.numero_factura || null,
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

    // Refresh selected detail if open
    if (selected && editTarget && selected.id === editTarget.id) {
      setSelected(null)
    }
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
    if (selected?.id === g.id) {
      setSelected(prev => prev ? { ...prev, estado: nuevoEstado } : null)
    }
  }

  const filtered = garantias.filter(g => {
    if (filtroEstado !== 'todos' && g.estado !== filtroEstado) return false
    if (filtroPrioridad !== 'todos' && g.prioridad !== filtroPrioridad) return false
    return true
  })

  // KPIs
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
        description="Gestión de consultas de garantía y servicio postventa"
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
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex gap-1 bg-background border border-border rounded-lg p-1">
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
        <div className="flex gap-1 bg-background border border-border rounded-lg p-1">
          {(['todos', 'urgente', 'alta', 'media', 'baja'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFiltroPrioridad(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filtroPrioridad === p ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'}`}
            >
              {p === 'todos' ? 'Prioridad' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
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
          <p className="text-sm text-muted">Cargá una nueva consulta de garantía con el botón de arriba.</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* List */}
          <div className="flex-1 space-y-3 min-w-0">
            {filtered.map((g) => {
              const Icon = ESTADO_ICON[g.estado]
              const isSelected = selected?.id === g.id
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
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLOR[g.estado]}`}>{ESTADO_LABEL[g.estado]}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORIDAD_COLOR[g.prioridad]}`}>{g.prioridad.charAt(0).toUpperCase() + g.prioridad.slice(1)}</span>
                          </div>
                          <p className="font-semibold text-text-primary mt-1 truncate">{g.cliente_nombre}</p>
                          <p className="text-sm text-text-secondary truncate">{g.producto}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-muted">{formatDate(g.created_at.split('T')[0])}</p>
                          {g.asignado_a && <p className="text-xs text-accent mt-0.5">{g.asignado_a}</p>}
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary mt-2 line-clamp-2">{g.problema}</p>
                    </div>
                  </div>

                  {/* Quick estado change */}
                  {isSelected && (
                    <div className="border-t border-border px-4 py-3 flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                      <span className="text-xs text-muted">Cambiar estado:</span>
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
                  <p className="text-base font-bold text-text-primary">{selected.cliente_nombre}</p>
                  {selected.cliente_telefono && (
                    <a href={`https://wa.me/${selected.cliente_telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline block mt-0.5">
                      {selected.cliente_telefono}
                    </a>
                  )}
                  {selected.cliente_email && <p className="text-sm text-text-secondary">{selected.cliente_email}</p>}
                </div>

                <div className="space-y-2 text-sm">
                  <Row label="Producto" value={selected.producto} />
                  {selected.fecha_compra && <Row label="Fecha compra" value={formatDate(selected.fecha_compra)} />}
                  {selected.numero_factura && <Row label="Factura" value={selected.numero_factura} />}
                  {selected.asignado_a && <Row label="Asignado a" value={selected.asignado_a} />}
                  <Row label="Ingresado" value={formatDate(selected.created_at.split('T')[0])} />
                  {selected.resuelto_at && <Row label="Resuelto" value={formatDate(selected.resuelto_at.split('T')[0])} />}
                </div>

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
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cliente */}
          <div className="border-b border-border pb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Datos del cliente</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre del cliente *</label>
                <input type="text" value={form.cliente_nombre} onChange={e => setForm({ ...form, cliente_nombre: e.target.value })} placeholder="Juan Pérez" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Teléfono / WhatsApp</label>
                <input type="text" value={form.cliente_telefono} onChange={e => setForm({ ...form, cliente_telefono: e.target.value })} placeholder="+54 9 11 1234-5678" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
                <input type="email" value={form.cliente_email} onChange={e => setForm({ ...form, cliente_email: e.target.value })} placeholder="cliente@mail.com" />
              </div>
            </div>
          </div>

          {/* Producto */}
          <div className="border-b border-border pb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Producto</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Producto / Descripción *</label>
                <input type="text" value={form.producto} onChange={e => setForm({ ...form, producto: e.target.value })} placeholder="Ej: Grifería cocina mod. XYZ" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de compra</label>
                <input type="date" value={form.fecha_compra} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">N° de factura</label>
                <input type="text" value={form.numero_factura} onChange={e => setForm({ ...form, numero_factura: e.target.value })} placeholder="Ej: 0001-00000123" />
              </div>
            </div>
          </div>

          {/* Problema */}
          <div className="border-b border-border pb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Consulta / Problema</p>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción del problema *</label>
              <textarea value={form.problema} onChange={e => setForm({ ...form, problema: e.target.value })} placeholder="Describí el problema o la consulta del cliente..." rows={3} required />
            </div>
          </div>

          {/* Gestión */}
          <div>
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
                <input type="text" value={form.asignado_a} onChange={e => setForm({ ...form, asignado_a: e.target.value })} placeholder="Ej: Ramiro" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas internas</label>
                <textarea value={form.notas_internas} onChange={e => setForm({ ...form, notas_internas: e.target.value })} placeholder="Notas internas de gestión..." rows={2} />
              </div>
            </div>
          </div>

          {msg && <p className="text-sm text-red-400">{msg}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
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
