'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate, getCurrentMonthRange, getMonthName } from '@/lib/utils'
import { Receipt, Plus } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

interface Gasto {
  id: string
  fecha: string
  categoria: string
  descripcion: string | null
  monto: number
  created_at: string
}

const CATEGORIAS = [
  'Alquiler', 'Sueldos', 'Servicios', 'Marketing', 'Logística',
  'Insumos', 'Impuestos', 'Mantenimiento', 'Otro'
]

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#64748b']

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    categoria: CATEGORIAS[0],
    descripcion: '',
    monto: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('gastos').select('*').order('fecha', { ascending: false })
    setGastos(data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('gastos').insert({
      fecha: form.fecha,
      categoria: form.categoria,
      descripcion: form.descripcion || null,
      monto: Number(form.monto),
    })
    await fetchData()
    setModalOpen(false)
    setForm({ fecha: new Date().toISOString().split('T')[0], categoria: CATEGORIAS[0], descripcion: '', monto: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    const supabase = createClient()
    await supabase.from('gastos').delete().eq('id', id)
    await fetchData()
  }

  const { start, end } = getCurrentMonthRange()
  const gastosMes = gastos
    .filter(g => g.fecha >= start && g.fecha <= end)
    .reduce((sum, g) => sum + Number(g.monto), 0)

  const totalGastos = gastos.reduce((sum, g) => sum + Number(g.monto), 0)

  // Category breakdown
  const categoriaMap: Record<string, number> = {}
  gastos.forEach((g) => {
    categoriaMap[g.categoria] = (categoriaMap[g.categoria] || 0) + Number(g.monto)
  })
  const pieData = Object.entries(categoriaMap).map(([name, value]) => ({ name, value }))

  // Monthly chart
  const monthlyMap: Record<string, number> = {}
  gastos.forEach((g) => {
    const month = parseInt(g.fecha.slice(5, 7))
    const key = getMonthName(month)
    monthlyMap[key] = (monthlyMap[key] || 0) + Number(g.monto)
  })
  const barData = Object.entries(monthlyMap).map(([mes, monto]) => ({ mes, monto }))

  const columns = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v: unknown) => formatDate(v as string),
    },
    { key: 'categoria', label: 'Categoría' },
    {
      key: 'descripcion',
      label: 'Descripción',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'monto',
      label: 'Monto',
      render: (v: unknown) => (
        <span className="font-semibold text-red-400">{formatCurrency(Number(v))}</span>
      ),
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Gasto) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Gastos"
        description="Control de egresos por categoría"
        icon={Receipt}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar gasto
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <MetricCard title="Gastos del mes" value={formatCurrency(gastosMes)} icon={Receipt} color="red" loading={loading} />
        <MetricCard title="Total acumulado" value={formatCurrency(totalGastos)} icon={Receipt} color="yellow" loading={loading} />
      </div>

      {(barData.length > 0 || pieData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {barData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-base font-semibold text-text-primary mb-6">Gastos por mes</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: number) => [formatCurrency(value), 'Gastos']}
                  />
                  <Bar dataKey="monto" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {pieData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-base font-semibold text-text-primary mb-6">Por categoría</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name">
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                  />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <DataTable
        columns={columns as never}
        data={gastos as never}
        loading={loading}
        emptyMessage="No hay gastos registrados"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo gasto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Categoría</label>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción</label>
            <input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción del gasto..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto</label>
            <input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0.00" required />
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
