'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency } from '@/lib/utils'
import { Package, Plus } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface StockItem {
  id: string
  producto: string
  tipo: 'propio' | 'reventa'
  cantidad: number
  precio_lista: number
  proveedor: string | null
  created_at: string
  valor_total?: number
}

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    producto: '',
    tipo: 'propio' as 'propio' | 'reventa',
    cantidad: '',
    precio_lista: '',
    proveedor: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('stock').select('*').order('producto')
    const withTotal = (data || []).map((s) => ({
      ...s,
      valor_total: Number(s.cantidad) * Number(s.precio_lista),
    }))
    setItems(withTotal)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('stock').insert({
      producto: form.producto,
      tipo: form.tipo,
      cantidad: Number(form.cantidad),
      precio_lista: Number(form.precio_lista),
      proveedor: form.proveedor || null,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ producto: '', tipo: 'propio', cantidad: '', precio_lista: '', proveedor: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este ítem de stock?')) return
    const supabase = createClient()
    await supabase.from('stock').delete().eq('id', id)
    await fetchData()
  }

  const totalPropio = items.filter(s => s.tipo === 'propio').reduce((sum, s) => sum + (s.valor_total || 0), 0)
  const totalReventa = items.filter(s => s.tipo === 'reventa').reduce((sum, s) => sum + (s.valor_total || 0), 0)
  const totalGeneral = totalPropio + totalReventa

  const pieData = [
    { name: 'Propio', value: totalPropio },
    { name: 'Reventa', value: totalReventa },
  ].filter(d => d.value > 0)

  const columns = [
    { key: 'producto', label: 'Producto' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v: unknown) => (
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          v === 'propio' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
        }`}>
          {v === 'propio' ? 'Propio' : 'Reventa'}
        </span>
      ),
    },
    {
      key: 'cantidad',
      label: 'Cantidad',
      render: (v: unknown) => <span className="font-medium">{Number(v).toLocaleString()}</span>,
    },
    {
      key: 'precio_lista',
      label: 'Precio lista',
      render: (v: unknown) => formatCurrency(Number(v)),
    },
    {
      key: 'valor_total',
      label: 'Valor total',
      render: (v: unknown) => (
        <span className="font-semibold text-green-400">{formatCurrency(Number(v))}</span>
      ),
    },
    {
      key: 'proveedor',
      label: 'Proveedor',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: StockItem) => (
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Inventario propio y de reventa"
        icon={Package}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar ítem
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard title="Stock total valorizado" value={formatCurrency(totalGeneral)} icon={Package} color="blue" loading={loading} />
        <MetricCard title="Stock propio" value={formatCurrency(totalPropio)} icon={Package} color="green" loading={loading} />
        <MetricCard title="Stock reventa" value={formatCurrency(totalReventa)} icon={Package} color="purple" loading={loading} />
      </div>

      {pieData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-6">Distribución del stock</h3>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="#8b5cf6" />
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <DataTable
        columns={columns as never}
        data={items as never}
        loading={loading}
        emptyMessage="No hay ítems en el stock"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo ítem de stock">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Producto</label>
            <input type="text" value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })} placeholder="Nombre del producto" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as 'propio' | 'reventa' })}>
              <option value="propio">Propio</option>
              <option value="reventa">Reventa</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Cantidad</label>
              <input type="number" min="0" step="0.01" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} placeholder="0" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Precio lista</label>
              <input type="number" min="0" step="0.01" value={form.precio_lista} onChange={(e) => setForm({ ...form, precio_lista: e.target.value })} placeholder="0.00" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Proveedor</label>
            <input type="text" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} placeholder="Nombre del proveedor" />
          </div>
          {form.cantidad && form.precio_lista && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-400">
              Valor total: {formatCurrency(Number(form.cantidad) * Number(form.precio_lista))}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
