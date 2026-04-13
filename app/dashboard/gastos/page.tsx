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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface Gasto {
  id: string
  fecha: string
  tipo: 'fijo' | 'variable' | 'sueldo' | 'publicidad'
  categoria: string
  descripcion: string | null
  monto: number
  created_at: string
}

const TIPOS = [
  { key: 'fijo',       label: 'Fijos',       color: '#3b82f6' },
  { key: 'variable',   label: 'Variables',   color: '#f59e0b' },
  { key: 'sueldo',     label: 'Sueldos',     color: '#22c55e' },
  { key: 'publicidad', label: 'Publicidad',  color: '#a855f7' },
] as const

type TipoKey = typeof TIPOS[number]['key']

const CATEGORIAS_POR_TIPO: Record<TipoKey, string[]> = {
  fijo:       ['Alquiler', 'Servicios', 'Impuestos', 'Mantenimiento', 'Seguro', 'Otro'],
  variable:   ['Logística', 'Insumos', 'Envíos', 'Compras', 'Otro'],
  sueldo:     ['Empleado', 'Monotributo', 'Cargas sociales', 'Otro'],
  publicidad: ['Meta Ads', 'Google Ads', 'Influencers', 'Diseño', 'Otro'],
}

const TIPO_COLORS: Record<TipoKey, string> = {
  fijo: '#3b82f6', variable: '#f59e0b', sueldo: '#22c55e', publicidad: '#a855f7',
}

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TipoKey | 'todos'>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    fecha: string; tipo: TipoKey; categoria: string; descripcion: string; monto: string
  }>({
    fecha: new Date().toISOString().split('T')[0],
    tipo: 'fijo',
    categoria: CATEGORIAS_POR_TIPO.fijo[0],
    descripcion: '',
    monto: '',
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('gastos').select('*').order('fecha', { ascending: false })
    setGastos((data || []) as Gasto[])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('gastos').insert({
      fecha: form.fecha,
      tipo: form.tipo,
      categoria: form.categoria,
      descripcion: form.descripcion || null,
      monto: Number(form.monto),
    })
    await fetchData()
    setModalOpen(false)
    setForm({ fecha: new Date().toISOString().split('T')[0], tipo: 'fijo', categoria: CATEGORIAS_POR_TIPO.fijo[0], descripcion: '', monto: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    const supabase = createClient()
    await supabase.from('gastos').delete().eq('id', id)
    await fetchData()
  }

  // Metrics
  const { start, end } = getCurrentMonthRange()
  const gastosMes = gastos.filter(g => g.fecha >= start && g.fecha <= end)

  const totalMes = gastosMes.reduce((s, g) => s + Number(g.monto), 0)

  const mesPorTipo = (tipo: TipoKey) =>
    gastosMes.filter(g => g.tipo === tipo).reduce((s, g) => s + Number(g.monto), 0)

  // Monthly stacked chart (all data)
  const monthlyMap: Record<string, Record<TipoKey, number>> = {}
  gastos.forEach(g => {
    const month = parseInt(g.fecha.slice(5, 7))
    const year = g.fecha.slice(0, 4)
    const key = `${getMonthName(month)} ${year}`
    if (!monthlyMap[key]) monthlyMap[key] = { fijo: 0, variable: 0, sueldo: 0, publicidad: 0 }
    monthlyMap[key][g.tipo as TipoKey] = (monthlyMap[key][g.tipo as TipoKey] || 0) + Number(g.monto)
  })
  const barData = Object.entries(monthlyMap).map(([mes, vals]) => ({ mes, ...vals }))

  // Filtered table data
  const filtered = tab === 'todos' ? gastos : gastos.filter(g => g.tipo === tab)

  const columns = [
    { key: 'fecha', label: 'Fecha', render: (v: unknown) => formatDate(v as string) },
    {
      key: 'tipo', label: 'Tipo',
      render: (v: unknown) => {
        const t = TIPOS.find(x => x.key === v)
        return t ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: t.color + '22', color: t.color }}>
            {t.label}
          </span>
        ) : v as string
      },
    },
    { key: 'categoria', label: 'Categoría' },
    { key: 'descripcion', label: 'Descripción', render: (v: unknown) => v || <span className="text-muted">—</span> },
    {
      key: 'monto', label: 'Monto',
      render: (v: unknown) => <span className="font-semibold text-red-400">{formatCurrency(Number(v))}</span>,
    },
    {
      key: 'id', label: 'Acciones',
      render: (_: unknown, row: Gasto) => (
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}
          className="text-xs text-red-400 hover:text-red-300 transition-colors">
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
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Agregar gasto
          </button>
        }
      />

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MetricCard title="Total del mes" value={formatCurrency(totalMes)} icon={Receipt} color="red" loading={loading} />
        {TIPOS.map(t => (
          <MetricCard key={t.key} title={t.label} value={formatCurrency(mesPorTipo(t.key))} icon={Receipt} color="blue" loading={loading} />
        ))}
      </div>

      {/* Monthly stacked bar chart */}
      {barData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h3 className="text-base font-semibold text-text-primary mb-6">Gastos por mes</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                formatter={(value: number, name: string) => {
                  const t = TIPOS.find(x => x.key === name)
                  return [formatCurrency(value), t?.label || name]
                }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }}
                formatter={(value) => TIPOS.find(t => t.key === value)?.label || value} />
              {TIPOS.map(t => (
                <Bar key={t.key} dataKey={t.key} stackId="a" fill={t.color} radius={t.key === 'publicidad' ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tab filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['todos', ...TIPOS.map(t => t.key)] as Array<TipoKey | 'todos'>).map(key => {
          const label = key === 'todos' ? 'Todos' : TIPOS.find(t => t.key === key)!.label
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                active ? 'bg-accent border-accent text-white' : 'border-border text-text-secondary hover:text-text-primary hover:bg-card-hover'
              }`}>
              {label}
            </button>
          )
        })}
      </div>

      <DataTable
        columns={columns as never}
        data={filtered as never}
        loading={loading}
        emptyMessage="No hay gastos registrados"
      />

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo gasto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
            <select value={form.tipo} onChange={(e) => {
              const t = e.target.value as TipoKey
              setForm({ ...form, tipo: t, categoria: CATEGORIAS_POR_TIPO[t][0] })
            }}>
              {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Categoría</label>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_POR_TIPO[form.tipo].map(c => <option key={c} value={c}>{c}</option>)}
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
