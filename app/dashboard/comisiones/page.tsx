'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { HandCoins, Plus, CheckCircle, Pencil } from 'lucide-react'

interface Estudio {
  id: string
  nombre: string
  contacto: string | null
  comision_pct: number
}

interface Venta {
  id: string
  fecha: string
  monto: number
  descripcion: string | null
}

interface Comision {
  id: string
  estudio_id: string | null
  venta_id: string | null
  monto: number
  pagada: boolean
  fecha: string
  estudios?: { nombre: string } | null
  ventas?: { monto: number; descripcion: string | null } | null
  created_at: string
}

export default function ComisionesPage() {
  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [estudios, setEstudios] = useState<Estudio[]>([])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalEstudioOpen, setModalEstudioOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    estudio_id: '',
    venta_id: '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
  })
  const [estudioForm, setEstudioForm] = useState({ nombre: '', contacto: '', comision_pct: '0' })
  const [editEstudio, setEditEstudio] = useState<Estudio | null>(null)
  const [editComisionPct, setEditComisionPct] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [comisionesRes, estudiosRes, ventasRes] = await Promise.all([
      supabase.from('comisiones').select('*, estudios(nombre), ventas(monto, descripcion)').order('fecha', { ascending: false }),
      supabase.from('estudios').select('*').order('nombre'),
      supabase.from('ventas').select('id, fecha, monto, descripcion').order('fecha', { ascending: false }),
    ])
    setComisiones(comisionesRes.data || [])
    setEstudios(estudiosRes.data || [])
    setVentas(ventasRes.data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('comisiones').insert({
      estudio_id: form.estudio_id || null,
      venta_id: form.venta_id || null,
      monto: Number(form.monto),
      fecha: form.fecha,
      pagada: false,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ estudio_id: '', venta_id: '', monto: '', fecha: new Date().toISOString().split('T')[0] })
    setSaving(false)
  }

  const handleEstudioSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('estudios').insert({
      nombre: estudioForm.nombre,
      contacto: estudioForm.contacto || null,
      comision_pct: Number(estudioForm.comision_pct),
    })
    await fetchData()
    setModalEstudioOpen(false)
    setEstudioForm({ nombre: '', contacto: '', comision_pct: '5' })
    setSaving(false)
  }

  const handleTogglePagada = async (id: string, pagada: boolean) => {
    const supabase = createClient()
    await supabase.from('comisiones').update({ pagada: !pagada }).eq('id', id)
    await fetchData()
  }

  const handleEditEstudio = (e: Estudio) => {
    setEditEstudio(e)
    setEditComisionPct(String(e.comision_pct))
  }

  const handleSaveEditEstudio = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!editEstudio) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('estudios').update({ comision_pct: Number(editComisionPct) }).eq('id', editEstudio.id)
    await fetchData()
    setEditEstudio(null)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta comisión?')) return
    const supabase = createClient()
    await supabase.from('comisiones').delete().eq('id', id)
    await fetchData()
  }

  const pendientes = comisiones.filter(c => !c.pagada).reduce((sum, c) => sum + Number(c.monto), 0)
  const pagadas = comisiones.filter(c => c.pagada).reduce((sum, c) => sum + Number(c.monto), 0)

  // Auto-calculate monto when venta selected
  const handleVentaChange = (ventaId: string) => {
    const venta = ventas.find(v => v.id === ventaId)
    const estudio = estudios.find(e => e.id === form.estudio_id)
    if (venta && estudio) {
      const monto = (Number(venta.monto) * Number(estudio.comision_pct)) / 100
      setForm({ ...form, venta_id: ventaId, monto: monto.toFixed(2) })
    } else {
      setForm({ ...form, venta_id: ventaId })
    }
  }

  const columns = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: 'estudios',
      label: 'Estudio',
      render: (_: unknown, row: Comision) => row.estudios?.nombre || <span className="text-muted">—</span>,
    },
    {
      key: 'ventas',
      label: 'Venta ref.',
      render: (_: unknown, row: Comision) =>
        row.ventas ? formatCurrency(Number(row.ventas.monto)) : <span className="text-muted">—</span>,
    },
    {
      key: 'monto',
      label: 'Comisión',
      render: (v: unknown) => (
        <span className="font-semibold text-yellow-400">{formatCurrency(Number(v))}</span>
      ),
    },
    {
      key: 'pagada',
      label: 'Estado',
      render: (v: unknown, row: Comision) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleTogglePagada(row.id, Boolean(v)) }}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
            v ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
          }`}
        >
          {v ? <CheckCircle className="w-3 h-3" /> : null}
          {v ? 'Pagada' : 'Pendiente'}
        </button>
      ),
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Comision) => (
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Comisiones"
        description="Comisiones a estudios de arquitectura"
        icon={HandCoins}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setModalEstudioOpen(true)}
              className="flex items-center gap-2 border border-border hover:bg-card-hover text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuevo estudio
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar comisión
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <MetricCard title="Comisiones pendientes" value={formatCurrency(pendientes)} icon={HandCoins} color="yellow" loading={loading} />
        <MetricCard title="Comisiones pagadas" value={formatCurrency(pagadas)} icon={HandCoins} color="green" loading={loading} />
      </div>

      {/* Estudios table */}
      {estudios.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-4">Estudios registrados</h3>
          <div className="divide-y divide-border">
            {estudios.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">{e.nombre}</p>
                  {e.contacto && <p className="text-xs text-muted">{e.contacto}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-yellow-400">{e.comision_pct}% comisión</span>
                  <button
                    onClick={() => handleEditEstudio(e)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                    title="Editar comisión"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        columns={columns as never}
        data={comisiones as never}
        loading={loading}
        emptyMessage="No hay comisiones registradas"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva comisión">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Estudio</label>
            <select value={form.estudio_id} onChange={(e) => setForm({ ...form, estudio_id: e.target.value })}>
              <option value="">Seleccionar estudio</option>
              {estudios.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.comision_pct}%)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Venta de referencia</label>
            <select value={form.venta_id} onChange={(e) => handleVentaChange(e.target.value)}>
              <option value="">Seleccionar venta</option>
              {ventas.map((v) => <option key={v.id} value={v.id}>{formatDate(v.fecha)} — {formatCurrency(Number(v.monto))} {v.descripcion ? `(${v.descripcion})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto comisión</label>
            <input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0.00" required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editEstudio} onClose={() => setEditEstudio(null)} title={`Editar comisión — ${editEstudio?.nombre}`} size="sm">
        <form onSubmit={handleSaveEditEstudio} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Comisión (%)</label>
            <input
              type="number" min="0" max="100" step="0.1"
              value={editComisionPct}
              onChange={(e) => setEditComisionPct(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditEstudio(null)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modalEstudioOpen} onClose={() => setModalEstudioOpen(false)} title="Nuevo estudio de arquitectura">
        <form onSubmit={handleEstudioSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre del estudio</label>
            <input type="text" value={estudioForm.nombre} onChange={(e) => setEstudioForm({ ...estudioForm, nombre: e.target.value })} placeholder="Estudio XYZ" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Contacto</label>
            <input type="text" value={estudioForm.contacto} onChange={(e) => setEstudioForm({ ...estudioForm, contacto: e.target.value })} placeholder="Nombre del contacto" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Comisión (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={estudioForm.comision_pct} onChange={(e) => setEstudioForm({ ...estudioForm, comision_pct: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalEstudioOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
