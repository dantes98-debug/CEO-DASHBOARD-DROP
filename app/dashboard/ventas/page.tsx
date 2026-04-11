'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate, getCurrentMonthRange, getMonthName } from '@/lib/utils'
import { TrendingUp, Plus } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

type TipoVenta = 'blanco_a' | 'blanco_b' | 'negro'

const TIPO_LABEL: Record<TipoVenta, string> = {
  blanco_a: 'Factura A',
  blanco_b: 'Factura B',
  negro:    'Negro',
}

const TIPO_COLOR: Record<TipoVenta, string> = {
  blanco_a: 'text-blue-400',
  blanco_b: 'text-purple-400',
  negro:    'text-yellow-400',
}

interface Venta {
  id: string
  fecha: string
  monto: number
  tipo: TipoVenta
  descripcion: string | null
  archivo_url: string | null
  cliente_id: string | null
  clientes?: { nombre: string } | null
  created_at: string
}

interface Cliente {
  id: string
  nombre: string
}

type FiltroTipo = 'todos' | TipoVenta

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState<FiltroTipo>('todos')
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    cliente_id: '',
    monto: '',
    tipo: 'blanco_a' as TipoVenta,
    descripcion: '',
  })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [ventasRes, clientesRes] = await Promise.all([
      supabase.from('ventas').select('*, clientes(nombre)').order('fecha', { ascending: false }),
      supabase.from('clientes').select('id, nombre').order('nombre'),
    ])
    setVentas(ventasRes.data || [])
    setClientes(clientesRes.data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('ventas').insert({
      fecha: form.fecha,
      cliente_id: form.cliente_id || null,
      monto: Number(form.monto),
      tipo: form.tipo,
      descripcion: form.descripcion || null,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ fecha: new Date().toISOString().split('T')[0], cliente_id: '', monto: '', tipo: 'blanco_a', descripcion: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta venta?')) return
    const supabase = createClient()
    await supabase.from('ventas').delete().eq('id', id)
    await fetchData()
  }

  const { start, end } = getCurrentMonthRange()

  const ventasFiltradas = filtro === 'todos' ? ventas : ventas.filter(v => v.tipo === filtro)

  const ventasMes = ventas.filter(v => v.fecha >= start && v.fecha <= end).reduce((sum, v) => sum + Number(v.monto), 0)
  const ventasMesFiltradas = ventasFiltradas.filter(v => v.fecha >= start && v.fecha <= end).reduce((sum, v) => sum + Number(v.monto), 0)
  const totalVentas = ventasFiltradas.reduce((sum, v) => sum + Number(v.monto), 0)

  // Chart por mes y tipo
  const monthlyMap: Record<string, { blanco_a: number; blanco_b: number; negro: number }> = {}
  ventas.forEach((v) => {
    const month = parseInt(v.fecha.slice(5, 7))
    const key = getMonthName(month)
    if (!monthlyMap[key]) monthlyMap[key] = { blanco_a: 0, blanco_b: 0, negro: 0 }
    monthlyMap[key][v.tipo || 'blanco_a'] += Number(v.monto)
  })
  const chartData = Object.entries(monthlyMap).map(([mes, vals]) => ({ mes, ...vals }))

  const columns = [
    { key: 'fecha', label: 'Fecha', render: (v: unknown) => formatDate(v as string) },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v: unknown) => {
        const t = (v as TipoVenta) || 'blanco_a'
        return <span className={`text-xs font-semibold ${TIPO_COLOR[t]}`}>{TIPO_LABEL[t]}</span>
      },
    },
    {
      key: 'clientes',
      label: 'Cliente',
      render: (_: unknown, row: Venta) => row.clientes?.nombre || <span className="text-muted text-xs">Sin cliente</span>,
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      render: (v: unknown) => v ? String(v) : <span className="text-muted">—</span>,
    },
    {
      key: 'monto',
      label: 'Monto',
      render: (v: unknown) => <span className="font-semibold text-green-400">{formatCurrency(Number(v))}</span>,
    },
    {
      key: 'id',
      label: '',
      render: (_: unknown, row: Venta) => (
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Registro de ventas y facturación"
        icon={TrendingUp}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar venta
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard title="Ventas del mes (total)" value={formatCurrency(ventasMes)} icon={TrendingUp} color="blue" loading={loading} />
        <MetricCard title={`Mes — ${filtro === 'todos' ? 'Todos' : TIPO_LABEL[filtro as TipoVenta]}`} value={formatCurrency(ventasMesFiltradas)} icon={TrendingUp} color="green" loading={loading} />
        <MetricCard title="Acumulado filtrado" value={formatCurrency(totalVentas)} icon={TrendingUp} color="purple" loading={loading} />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {(['todos', 'blanco_a', 'blanco_b', 'negro'] as FiltroTipo[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtro === f
                ? 'bg-accent text-white'
                : 'bg-card border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {f === 'todos' ? 'Todos' : TIPO_LABEL[f as TipoVenta]}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-6">Ventas por mes y tipo</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value: number, name: string) => [formatCurrency(value), name === 'blanco_a' ? 'Factura A' : name === 'blanco_b' ? 'Factura B' : 'Negro']}
              />
              <Legend formatter={(v) => v === 'blanco_a' ? 'Factura A' : v === 'blanco_b' ? 'Factura B' : 'Negro'} />
              <Bar dataKey="blanco_a" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="blanco_b" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="negro" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns as never}
        data={ventasFiltradas as never}
        loading={loading}
        emptyMessage="No hay ventas registradas"
      />

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva venta">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoVenta })}>
                <option value="blanco_a">Factura A</option>
                <option value="blanco_b">Factura B</option>
                <option value="negro">Negro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Cliente</label>
            <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
              <option value="">Sin cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto</label>
            <input
              type="number" min="0" step="0.01"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción de la venta..." rows={2} />
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
