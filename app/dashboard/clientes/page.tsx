'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency } from '@/lib/utils'
import { Users, Plus } from 'lucide-react'
import { toast } from 'sonner'
import RowMenu from '@/components/RowMenu'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface Estudio {
  id: string
  nombre: string
}

interface Cliente {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  estudio_id: string | null
  estudios?: { nombre: string } | null
  total_compras?: number
  created_at: string
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [estudios, setEstudios] = useState<Estudio[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', estudio_id: '' })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [clientesRes, estudiosRes, ventasRes] = await Promise.all([
      supabase.from('clientes').select('*, estudios(nombre)').order('nombre'),
      supabase.from('estudios').select('id, nombre').order('nombre'),
      supabase.from('ventas').select('cliente_id, monto'),
    ])

    const ventasPorCliente: Record<string, number> = {}
    ;(ventasRes.data || []).forEach((v) => {
      if (v.cliente_id) {
        ventasPorCliente[v.cliente_id] = (ventasPorCliente[v.cliente_id] || 0) + Number(v.monto)
      }
    })

    const clientesConTotal = (clientesRes.data || []).map((c) => ({
      ...c,
      total_compras: ventasPorCliente[c.id] || 0,
    }))

    setClientes(clientesConTotal)
    setEstudios(estudiosRes.data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clientes').insert({
      nombre: form.nombre,
      email: form.email || null,
      telefono: form.telefono || null,
      estudio_id: form.estudio_id || null,
    })
    if (error) { toast.error('Error al guardar el cliente'); setSaving(false); return }
    await fetchData()
    setModalOpen(false)
    setForm({ nombre: '', email: '', telefono: '', estudio_id: '' })
    setSaving(false)
    toast.success('Cliente agregado correctamente')
  }

  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('clientes').delete().eq('id', deleteTarget.id)
    await fetchData()
    toast.success('Cliente eliminado')
    setDeleteTarget(null)
    setDeleting(false)
  }

  const topClientes = [...clientes]
    .sort((a, b) => (b.total_compras || 0) - (a.total_compras || 0))
    .slice(0, 8)
    .map((c) => ({ nombre: c.nombre.split(' ')[0], compras: c.total_compras || 0 }))

  const columns = [
    { key: 'nombre', label: 'Nombre' },
    {
      key: 'email',
      label: 'Email',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'telefono',
      label: 'Teléfono',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'estudios',
      label: 'Estudio',
      render: (_: unknown, row: Cliente) =>
        row.estudios?.nombre || <span className="text-muted">Sin estudio</span>,
    },
    {
      key: 'total_compras',
      label: 'Total compras',
      render: (v: unknown) => (
        <span className="font-semibold text-green-400">{formatCurrency(Number(v))}</span>
      ),
    },
    {
      key: 'id',
      label: '',
      render: (_: unknown, row: Cliente) => (
        <RowMenu actions={[
          { label: 'Eliminar', onClick: () => setDeleteTarget(row), variant: 'danger' },
        ]} />
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cartera de clientes y sus compras"
        icon={Users}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar cliente
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <MetricCard
          title="Total clientes"
          value={String(clientes.length)}
          icon={Users}
          color="blue"
          loading={loading}
        />
        <MetricCard
          title="Facturación total"
          value={formatCurrency(clientes.reduce((s, c) => s + (c.total_compras || 0), 0))}
          icon={Users}
          color="green"
          loading={loading}
        />
      </div>

      {topClientes.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-6">Top clientes por compras</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topClientes} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="nombre" type="category" tick={{ fill: '#94a3b8', fontSize: 12 }} width={70} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value: number) => [formatCurrency(value), 'Compras']}
              />
              <Bar dataKey="compras" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable
        columns={columns as never}
        data={clientes as never}
        loading={loading}
        emptyMessage="No hay clientes registrados"
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar este cliente?"
        description={deleteTarget && (
          <>Se eliminará el cliente <strong>{deleteTarget.nombre}</strong> y todos sus datos asociados. Esta acción no se puede deshacer.</>
        )}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo cliente">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre</label>
            <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre completo" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@email.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Teléfono</label>
            <input type="text" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="+54 11 0000-0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Estudio (derivador)</label>
            <select value={form.estudio_id} onChange={(e) => setForm({ ...form, estudio_id: e.target.value })}>
              <option value="">Sin estudio</option>
              {estudios.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
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
