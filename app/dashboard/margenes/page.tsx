'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { Percent, Plus } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface Producto {
  id: string
  nombre: string
  costo: number
  precio_venta: number
  margen?: number
  created_at: string
}

export default function MargenesPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nombre: '', costo: '', precio_venta: '' })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('productos').select('*').order('nombre')
    const withMargen = (data || []).map((p) => ({
      ...p,
      margen: ((Number(p.precio_venta) - Number(p.costo)) / Number(p.precio_venta)) * 100,
    }))
    setProductos(withMargen)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('productos').insert({
      nombre: form.nombre,
      costo: Number(form.costo),
      precio_venta: Number(form.precio_venta),
    })
    await fetchData()
    setModalOpen(false)
    setForm({ nombre: '', costo: '', precio_venta: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return
    const supabase = createClient()
    await supabase.from('productos').delete().eq('id', id)
    await fetchData()
  }

  const margenPromedio = productos.length > 0
    ? productos.reduce((sum, p) => sum + (p.margen || 0), 0) / productos.length
    : 0

  const mejorMargen = productos.length > 0
    ? Math.max(...productos.map((p) => p.margen || 0))
    : 0

  const columns = [
    { key: 'nombre', label: 'Producto' },
    {
      key: 'costo',
      label: 'Costo',
      render: (v: unknown) => formatCurrency(Number(v)),
    },
    {
      key: 'precio_venta',
      label: 'Precio venta',
      render: (v: unknown) => formatCurrency(Number(v)),
    },
    {
      key: 'margen',
      label: 'Margen',
      render: (v: unknown) => {
        const val = Number(v)
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 max-w-24 bg-border rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${val > 30 ? 'bg-green-500' : val > 15 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(val, 100)}%` }}
              />
            </div>
            <span className={`font-semibold text-sm ${val > 30 ? 'text-green-400' : val > 15 ? 'text-yellow-400' : 'text-red-400'}`}>
              {formatPercent(val)}
            </span>
          </div>
        )
      },
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Producto) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Eliminar
        </button>
      ),
    },
  ]

  const chartData = productos.map((p) => ({
    nombre: p.nombre.length > 12 ? p.nombre.slice(0, 12) + '...' : p.nombre,
    margen: p.margen || 0,
  }))

  const previewMargen = form.costo && form.precio_venta
    ? ((Number(form.precio_venta) - Number(form.costo)) / Number(form.precio_venta)) * 100
    : null

  return (
    <div>
      <PageHeader
        title="Márgenes"
        description="Rentabilidad por producto"
        icon={Percent}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar producto
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <MetricCard
          title="Margen promedio"
          value={formatPercent(margenPromedio)}
          icon={Percent}
          color="green"
          loading={loading}
        />
        <MetricCard
          title="Mejor margen"
          value={formatPercent(mejorMargen)}
          icon={Percent}
          color="blue"
          loading={loading}
        />
      </div>

      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-6">Margen por producto</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="nombre" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Margen']}
              />
              <Bar dataKey="margen" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.margen > 30 ? '#22c55e' : entry.margen > 15 ? '#eab308' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable
        columns={columns as never}
        data={productos as never}
        loading={loading}
        emptyMessage="No hay productos registrados"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo producto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre del producto</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Piso porcelanato 60x60"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Costo</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costo}
                onChange={(e) => setForm({ ...form, costo: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Precio de venta</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.precio_venta}
                onChange={(e) => setForm({ ...form, precio_venta: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
          </div>
          {previewMargen !== null && (
            <div className={`p-3 rounded-lg text-sm font-medium ${previewMargen > 30 ? 'bg-green-500/10 text-green-400' : previewMargen > 15 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
              Margen calculado: {formatPercent(previewMargen)}
            </div>
          )}
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
