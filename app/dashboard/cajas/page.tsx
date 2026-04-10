'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, Plus, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'

interface Caja {
  id: string
  nombre: string
  saldo_actual: number
  created_at: string
}

interface Movimiento {
  id: string
  caja_id: string
  tipo: 'ingreso' | 'egreso'
  monto: number
  descripcion: string | null
  fecha: string
  cajas?: { nombre: string } | null
  created_at: string
}

export default function CajasPage() {
  const [cajas, setCajas] = useState<Caja[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [modalCajaOpen, setModalCajaOpen] = useState(false)
  const [modalMovOpen, setModalMovOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cajaForm, setCajaForm] = useState({ nombre: '', saldo_actual: '' })
  const [movForm, setMovForm] = useState({
    caja_id: '',
    tipo: 'ingreso' as 'ingreso' | 'egreso',
    monto: '',
    descripcion: '',
    fecha: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [cajasRes, movRes] = await Promise.all([
      supabase.from('cajas').select('*').order('nombre'),
      supabase.from('movimientos_caja').select('*, cajas(nombre)').order('fecha', { ascending: false }).limit(100),
    ])
    setCajas(cajasRes.data || [])
    setMovimientos(movRes.data || [])
    setLoading(false)
  }

  const handleCajaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('cajas').insert({
      nombre: cajaForm.nombre,
      saldo_actual: Number(cajaForm.saldo_actual),
    })
    await fetchData()
    setModalCajaOpen(false)
    setCajaForm({ nombre: '', saldo_actual: '' })
    setSaving(false)
  }

  const handleMovSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    // Insert movement
    await supabase.from('movimientos_caja').insert({
      caja_id: movForm.caja_id,
      tipo: movForm.tipo,
      monto: Number(movForm.monto),
      descripcion: movForm.descripcion || null,
      fecha: movForm.fecha,
    })

    // Update caja balance
    const caja = cajas.find(c => c.id === movForm.caja_id)
    if (caja) {
      const delta = movForm.tipo === 'ingreso' ? Number(movForm.monto) : -Number(movForm.monto)
      await supabase.from('cajas').update({ saldo_actual: caja.saldo_actual + delta }).eq('id', caja.id)
    }

    await fetchData()
    setModalMovOpen(false)
    setMovForm({ caja_id: '', tipo: 'ingreso', monto: '', descripcion: '', fecha: new Date().toISOString().split('T')[0] })
    setSaving(false)
  }

  const handleDeleteMov = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    const supabase = createClient()
    await supabase.from('movimientos_caja').delete().eq('id', id)
    await fetchData()
  }

  const saldoTotal = cajas.reduce((sum, c) => sum + Number(c.saldo_actual), 0)

  const movColumns = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: 'cajas',
      label: 'Caja',
      render: (_: unknown, row: Movimiento) => row.cajas?.nombre || <span className="text-muted">—</span>,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v: unknown) => (
        <span className={`flex items-center gap-1.5 text-xs font-medium ${v === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
          {v === 'ingreso' ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
          {v === 'ingreso' ? 'Ingreso' : 'Egreso'}
        </span>
      ),
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'monto',
      label: 'Monto',
      render: (v: unknown, row: Movimiento) => (
        <span className={`font-semibold ${row.tipo === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
          {row.tipo === 'egreso' ? '-' : '+'}{formatCurrency(Number(v))}
        </span>
      ),
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Movimiento) => (
        <button onClick={(e) => { e.stopPropagation(); handleDeleteMov(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Cajas"
        description="Saldos y movimientos de efectivo"
        icon={Landmark}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setModalCajaOpen(true)}
              className="flex items-center gap-2 border border-border hover:bg-card-hover text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva caja
            </button>
            <button
              onClick={() => setModalMovOpen(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Movimiento
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard title="Saldo total" value={formatCurrency(saldoTotal)} icon={Landmark} color="cyan" loading={loading} />
        {!loading && cajas.slice(0, 2).map((c) => (
          <MetricCard key={c.id} title={c.nombre} value={formatCurrency(c.saldo_actual)} icon={Landmark} color="blue" />
        ))}
      </div>

      {/* Cajas summary */}
      {cajas.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-4">Resumen de cajas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cajas.map((c) => (
              <div key={c.id} className="bg-card-hover rounded-lg p-4 border border-border">
                <p className="text-xs text-muted mb-1">{c.nombre}</p>
                <p className={`text-lg font-bold ${c.saldo_actual >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(c.saldo_actual)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-base font-semibold text-text-primary mb-4">Movimientos recientes</h3>
      <DataTable
        columns={movColumns as never}
        data={movimientos as never}
        loading={loading}
        emptyMessage="No hay movimientos registrados"
      />

      <Modal isOpen={modalCajaOpen} onClose={() => setModalCajaOpen(false)} title="Nueva caja">
        <form onSubmit={handleCajaSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre de la caja</label>
            <input type="text" value={cajaForm.nombre} onChange={(e) => setCajaForm({ ...cajaForm, nombre: e.target.value })} placeholder="Ej: Caja principal, Caja USD" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Saldo inicial</label>
            <input type="number" step="0.01" value={cajaForm.saldo_actual} onChange={(e) => setCajaForm({ ...cajaForm, saldo_actual: e.target.value })} placeholder="0.00" required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalCajaOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Crear'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modalMovOpen} onClose={() => setModalMovOpen(false)} title="Nuevo movimiento">
        <form onSubmit={handleMovSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
            <input type="date" value={movForm.fecha} onChange={(e) => setMovForm({ ...movForm, fecha: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Caja</label>
            <select value={movForm.caja_id} onChange={(e) => setMovForm({ ...movForm, caja_id: e.target.value })} required>
              <option value="">Seleccionar caja</option>
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({formatCurrency(c.saldo_actual)})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
            <div className="grid grid-cols-2 gap-3">
              {(['ingreso', 'egreso'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMovForm({ ...movForm, tipo: t })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    movForm.tipo === t
                      ? t === 'ingreso' ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-border text-text-secondary hover:bg-card-hover'
                  }`}
                >
                  {t === 'ingreso' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                  {t === 'ingreso' ? 'Ingreso' : 'Egreso'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto</label>
            <input type="number" min="0" step="0.01" value={movForm.monto} onChange={(e) => setMovForm({ ...movForm, monto: e.target.value })} placeholder="0.00" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción</label>
            <input type="text" value={movForm.descripcion} onChange={(e) => setMovForm({ ...movForm, descripcion: e.target.value })} placeholder="Descripción del movimiento" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalMovOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
