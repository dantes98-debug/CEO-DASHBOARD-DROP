'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'
import { LineChart as LineChartIcon, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface Inversion {
  id: string
  nombre: string
  monto_inicial: number
  valor_actual: number
  fecha_inicio: string
  tipo: string | null
  notas: string | null
  rendimiento?: number
  created_at: string
}

export default function InversionesPage() {
  const [inversiones, setInversiones] = useState<Inversion[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: '',
    monto_inicial: '',
    valor_actual: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    tipo: '',
    notas: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('inversiones').select('*').order('fecha_inicio', { ascending: false })
    const withRendimiento = (data || []).map((inv) => ({
      ...inv,
      rendimiento: ((Number(inv.valor_actual) - Number(inv.monto_inicial)) / Number(inv.monto_inicial)) * 100,
    }))
    setInversiones(withRendimiento)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('inversiones').insert({
      nombre: form.nombre,
      monto_inicial: Number(form.monto_inicial),
      valor_actual: Number(form.valor_actual || form.monto_inicial),
      fecha_inicio: form.fecha_inicio,
      tipo: form.tipo || null,
      notas: form.notas || null,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ nombre: '', monto_inicial: '', valor_actual: '', fecha_inicio: new Date().toISOString().split('T')[0], tipo: '', notas: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta inversión?')) return
    const supabase = createClient()
    await supabase.from('inversiones').delete().eq('id', id)
    await fetchData()
  }

  const totalInvertido = inversiones.reduce((sum, i) => sum + Number(i.monto_inicial), 0)
  const valorActualTotal = inversiones.reduce((sum, i) => sum + Number(i.valor_actual), 0)
  const rendimientoTotal = totalInvertido > 0 ? ((valorActualTotal - totalInvertido) / totalInvertido) * 100 : 0

  const chartData = inversiones.map((inv) => ({
    nombre: inv.nombre.length > 14 ? inv.nombre.slice(0, 14) + '...' : inv.nombre,
    rendimiento: inv.rendimiento || 0,
  }))

  const columns = [
    { key: 'nombre', label: 'Nombre' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'fecha_inicio',
      label: 'Inicio',
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: 'monto_inicial',
      label: 'Invertido',
      render: (v: unknown) => formatCurrency(Number(v)),
    },
    {
      key: 'valor_actual',
      label: 'Valor actual',
      render: (v: unknown) => (
        <span className="font-semibold text-green-400">{formatCurrency(Number(v))}</span>
      ),
    },
    {
      key: 'rendimiento',
      label: 'Rendimiento',
      render: (v: unknown) => {
        const val = Number(v)
        return (
          <span className={`flex items-center gap-1 font-semibold text-sm ${val >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {val >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {val >= 0 ? '+' : ''}{formatPercent(val)}
          </span>
        )
      },
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Inversion) => (
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Inversiones"
        description="Portfolio de inversiones y rendimientos"
        icon={LineChartIcon}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva inversión
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard title="Total invertido" value={formatCurrency(totalInvertido)} icon={LineChartIcon} color="blue" loading={loading} />
        <MetricCard title="Valor actual" value={formatCurrency(valorActualTotal)} icon={LineChartIcon} color="green" loading={loading} />
        <MetricCard
          title="Rendimiento total"
          value={(rendimientoTotal >= 0 ? '+' : '') + formatPercent(rendimientoTotal)}
          icon={rendimientoTotal >= 0 ? TrendingUp : TrendingDown}
          color={rendimientoTotal >= 0 ? 'green' : 'red'}
          loading={loading}
        />
      </div>

      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-6">Rendimiento por inversión</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="nombre" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Rendimiento']}
              />
              <Bar dataKey="rendimiento" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.rendimiento >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable
        columns={columns as never}
        data={inversiones as never}
        loading={loading}
        emptyMessage="No hay inversiones registradas"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva inversión">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre</label>
            <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Plazo fijo BNA, Crypto, Inmueble" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
            <input type="text" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Ej: Renta fija, Variable, Inmueble" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de inicio</label>
            <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto invertido</label>
              <input type="number" min="0" step="0.01" value={form.monto_inicial} onChange={(e) => setForm({ ...form, monto_inicial: e.target.value })} placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Valor actual</label>
              <input type="number" min="0" step="0.01" value={form.valor_actual} onChange={(e) => setForm({ ...form, valor_actual: e.target.value })} placeholder={form.monto_inicial || '0.00'} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas</label>
            <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas adicionales..." rows={2} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
