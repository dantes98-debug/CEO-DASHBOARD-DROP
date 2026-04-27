'use client'

import { useEffect, useState, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Users, Plus, Download, Search, ChevronDown, ChevronRight, Building2, X } from 'lucide-react'
import { exportarExcel } from '@/lib/exportar'
import { toast } from 'sonner'
import RowMenu from '@/components/RowMenu'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Estudio {
  id: string
  nombre: string
}

interface VentaDetalle {
  id: string
  fecha: string
  numero_factura: string | null
  tipo: string
  monto_ars: number
  razon_social: string | null
  items: { sku: string; descripcion: string; cantidad: number; precio_unitario: number }[] | null
}

interface Cliente {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  estudio_id: string | null
  estudios?: { nombre: string } | null
  ventas: VentaDetalle[]
  total_compras: number
  created_at: string
}

const TIPO_LABEL: Record<string, string> = {
  blanco_a: 'Factura A', blanco_b: 'Factura B', negro: 'Negro',
}
const TIPO_COLOR: Record<string, string> = {
  blanco_a: 'bg-blue-50 text-blue-700 border-blue-200',
  blanco_b: 'bg-purple-50 text-purple-700 border-purple-200',
  negro: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

function VentasTable({ ventas, total }: { ventas: VentaDetalle[]; total: number }) {
  if (ventas.length === 0) return <p className="text-xs text-text-muted py-3 text-center">Sin ventas registradas</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border/50">
          <th className="text-left py-1.5 text-text-muted font-medium">Fecha</th>
          <th className="text-left py-1.5 text-text-muted font-medium">N° Factura</th>
          <th className="text-left py-1.5 text-text-muted font-medium">Tipo</th>
          <th className="text-left py-1.5 text-text-muted font-medium">Productos</th>
          <th className="text-right py-1.5 text-text-muted font-medium">Monto</th>
        </tr>
      </thead>
      <tbody>
        {ventas.map(v => (
          <tr key={v.id} className="border-b border-border/20">
            <td className="py-2 text-text-secondary">{formatDate(v.fecha)}</td>
            <td className="py-2 font-mono text-text-primary">{v.numero_factura || '—'}</td>
            <td className="py-2">
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${TIPO_COLOR[v.tipo] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {TIPO_LABEL[v.tipo] || v.tipo}
              </span>
            </td>
            <td className="py-2 text-text-muted max-w-xs">
              <span className="truncate block">
                {Array.isArray(v.items) && v.items.length > 0
                  ? v.items.map(i => `${i.sku} ×${i.cantidad}`).join(', ')
                  : v.razon_social || '—'}
              </span>
            </td>
            <td className="py-2 text-right font-semibold text-green-400">{formatCurrency(v.monto_ars)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="pt-2 text-right text-xs font-semibold text-text-secondary">Total:</td>
          <td className="pt-2 text-right text-sm font-bold text-green-400">{formatCurrency(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function EstudioClientesRows({ clientes, expandedId, setExpandedId }: {
  clientes: Cliente[]
  expandedId: string | null
  setExpandedId: (id: string | null) => void
}) {
  return (
    <div className="border-t border-border divide-y divide-border/40">
      {clientes.map(c => (
        <Fragment key={c.id}>
          <button
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
            className="w-full flex items-center gap-3 px-6 py-3 hover:bg-card-hover transition-colors text-left"
          >
            {expandedId === c.id
              ? <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
            <span className="flex-1 text-sm font-medium text-text-primary">{c.nombre}</span>
            {c.email && <span className="text-xs text-text-muted hidden sm:block">{c.email}</span>}
            <span className="text-xs text-text-muted ml-2">{c.ventas.length} venta{c.ventas.length !== 1 ? 's' : ''}</span>
            <span className="text-sm font-semibold text-green-400 ml-4 flex-shrink-0">{formatCurrency(c.total_compras)}</span>
          </button>
          {expandedId === c.id && (
            <div className="px-10 py-4 bg-card-hover/40">
              <VentasTable ventas={c.ventas} total={c.total_compras} />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [estudios, setEstudios] = useState<Estudio[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Cliente | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', estudio_id: '' })
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [vista, setVista] = useState<'clientes' | 'estudios'>('clientes')
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstudio, setFiltroEstudio] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedEstudio, setExpandedEstudio] = useState<string | null>(null)
  const [expandedClienteEnEstudio, setExpandedClienteEnEstudio] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [clientesRes, estudiosRes, ventasRes] = await Promise.all([
      supabase.from('clientes').select('*, estudios(nombre)').order('nombre'),
      supabase.from('estudios').select('id, nombre').order('nombre'),
      supabase.from('ventas')
        .select('id, fecha, monto, moneda, tipo_cambio, monto_ars, numero_factura, razon_social, tipo, items, cliente_id')
        .order('fecha', { ascending: false }),
    ])

    const ventasPorCliente: Record<string, VentaDetalle[]> = {}
    const totalPorCliente: Record<string, number> = {}

    for (const v of (ventasRes.data || [])) {
      if (!v.cliente_id) continue
      let montoArs = v.moneda === 'usd'
        ? Number(v.monto) * Number(v.tipo_cambio || 1000)
        : Number(v.monto)
      if (montoArs === 0 && Array.isArray(v.items) && v.items.length > 0) {
        montoArs = (v.items as { precio_unitario: number; cantidad: number }[])
          .reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
      }
      if (!ventasPorCliente[v.cliente_id]) ventasPorCliente[v.cliente_id] = []
      ventasPorCliente[v.cliente_id].push({ ...v, monto_ars: montoArs } as VentaDetalle)
      totalPorCliente[v.cliente_id] = (totalPorCliente[v.cliente_id] || 0) + montoArs
    }

    const clientesConVentas: Cliente[] = (clientesRes.data || []).map(c => ({
      ...c,
      ventas: ventasPorCliente[c.id] || [],
      total_compras: totalPorCliente[c.id] || 0,
    }))

    setClientes(clientesConVentas)
    setEstudios(estudiosRes.data || [])
    setLoading(false)
  }

  const openEdit = (c: Cliente) => {
    setEditTarget(c)
    setForm({ nombre: c.nombre, email: c.email || '', telefono: c.telefono || '', estudio_id: c.estudio_id || '' })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const payload = {
      nombre: form.nombre,
      email: form.email || null,
      telefono: form.telefono || null,
      estudio_id: form.estudio_id || null,
    }
    const { error } = editTarget
      ? await supabase.from('clientes').update(payload).eq('id', editTarget.id)
      : await supabase.from('clientes').insert(payload)
    if (error) { toast.error('Error al guardar'); setSaving(false); return }
    await fetchData()
    setModalOpen(false)
    setEditTarget(null)
    setForm({ nombre: '', email: '', telefono: '', estudio_id: '' })
    setSaving(false)
    toast.success(editTarget ? 'Cliente actualizado' : 'Cliente agregado')
  }

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

  const clientesFiltrados = clientes.filter(c => {
    const matchBusqueda = !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchEstudio = !filtroEstudio || c.estudio_id === filtroEstudio
    return matchBusqueda && matchEstudio
  })

  const estudiosConClientes = estudios
    .map(e => {
      const cc = clientes.filter(c => c.estudio_id === e.id)
      return { ...e, clientes: cc, totalFacturado: cc.reduce((s, c) => s + c.total_compras, 0) }
    })
    .filter(e => e.clientes.length > 0)
    .sort((a, b) => b.totalFacturado - a.totalFacturado)

  const sinEstudio = clientes.filter(c => !c.estudio_id)
  const totalFacturado = clientes.reduce((s, c) => s + c.total_compras, 0)

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cartera de clientes y sus compras"
        icon={Users}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => exportarExcel(
                clientesFiltrados.map(c => ({
                  Nombre: c.nombre,
                  Email: c.email || '',
                  Teléfono: c.telefono || '',
                  Estudio: c.estudios?.nombre || '',
                  'N° Ventas': c.ventas.length,
                  'Total ARS': c.total_compras,
                })),
                'clientes'
              )}
              className="flex items-center gap-2 border border-border hover:bg-card-hover text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> Exportar
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Agregar cliente
            </button>
          </div>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard title="Total clientes" value={String(clientes.length)} icon={Users} color="blue" loading={loading} />
        <MetricCard title="Estudios derivadores" value={String(estudiosConClientes.length)} icon={Users} color="purple" loading={loading} />
        <MetricCard title="Facturación total" value={formatCurrency(totalFacturado)} icon={Users} color="green" loading={loading} />
      </div>

      {/* Tabs + filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          <button
            onClick={() => setVista('clientes')}
            className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${vista === 'clientes' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}
          >
            <Users className="w-4 h-4" /> Por cliente
          </button>
          <button
            onClick={() => setVista('estudios')}
            className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 border-l border-border ${vista === 'estudios' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}
          >
            <Building2 className="w-4 h-4" /> Por estudio
          </button>
        </div>

        {vista === 'clientes' && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setExpandedId(null) }}
                className="pl-8 py-2 text-sm w-52 border border-border rounded-lg bg-card focus:outline-none focus:border-accent"
              />
            </div>
            <select
              value={filtroEstudio}
              onChange={e => { setFiltroEstudio(e.target.value); setExpandedId(null) }}
              className="py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:border-accent"
            >
              <option value="">Todos los estudios</option>
              {estudios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            {(busqueda || filtroEstudio) && (
              <button onClick={() => { setBusqueda(''); setFiltroEstudio('') }}
                className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors">
                <X className="w-3.5 h-3.5" /> Limpiar
              </button>
            )}
            <span className="text-xs text-text-muted ml-auto">{clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}</span>
          </>
        )}
      </div>

      {/* ── VISTA CLIENTES ── */}
      {vista === 'clientes' && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-text-muted">Cargando...</div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="py-12 text-center text-text-muted">Sin resultados</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover">
                  <th className="w-10 px-4 py-3"></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase hidden sm:table-cell">Estudio</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase hidden md:table-cell">Contacto</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Ventas</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Total ARS</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <Fragment key={c.id}>
                    <tr
                      className="border-b border-border/50 hover:bg-card-hover transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    >
                      <td className="px-4 py-3 text-text-muted">
                        {expandedId === c.id
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary">{c.nombre}</td>
                      <td className="px-4 py-3 text-xs hidden sm:table-cell">
                        {c.estudios?.nombre
                          ? <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full">{c.estudios.nombre}</span>
                          : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted hidden md:table-cell">
                        {c.email && <p>{c.email}</p>}
                        {c.telefono && <p>{c.telefono}</p>}
                        {!c.email && !c.telefono && '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary">{c.ventas.length}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-400">{formatCurrency(c.total_compras)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <RowMenu actions={[
                          { label: 'Editar', onClick: () => openEdit(c) },
                          { label: 'Eliminar', onClick: () => setDeleteTarget(c), variant: 'danger' },
                        ]} />
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr className="border-b border-border bg-card-hover/40">
                        <td colSpan={7} className="px-8 py-4">
                          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Historial de compras</p>
                          <VentasTable ventas={c.ventas} total={c.total_compras} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── VISTA ESTUDIOS ── */}
      {vista === 'estudios' && (
        <div className="space-y-3">
          {estudiosConClientes.map(e => (
            <div key={e.id} className="bg-card rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setExpandedEstudio(expandedEstudio === e.id ? null : e.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-card-hover transition-colors text-left"
              >
                {expandedEstudio === e.id
                  ? <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
                <Building2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-text-primary">{e.nombre}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {e.clientes.length} cliente{e.clientes.length !== 1 ? 's' : ''} ·{' '}
                    {e.clientes.reduce((s, c) => s + c.ventas.length, 0)} venta{e.clientes.reduce((s, c) => s + c.ventas.length, 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <p className="text-base font-bold text-green-400 flex-shrink-0">{formatCurrency(e.totalFacturado)}</p>
              </button>
              {expandedEstudio === e.id && (
                <EstudioClientesRows
                  clientes={e.clientes}
                  expandedId={expandedClienteEnEstudio}
                  setExpandedId={setExpandedClienteEnEstudio}
                />
              )}
            </div>
          ))}

          {sinEstudio.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setExpandedEstudio(expandedEstudio === '__sin__' ? null : '__sin__')}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-card-hover transition-colors text-left"
              >
                {expandedEstudio === '__sin__'
                  ? <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
                <div className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-text-secondary">Sin estudio</p>
                  <p className="text-xs text-text-muted mt-0.5">{sinEstudio.length} cliente{sinEstudio.length !== 1 ? 's' : ''}</p>
                </div>
                <p className="text-base font-bold text-green-400 flex-shrink-0">
                  {formatCurrency(sinEstudio.reduce((s, c) => s + c.total_compras, 0))}
                </p>
              </button>
              {expandedEstudio === '__sin__' && (
                <EstudioClientesRows
                  clientes={sinEstudio}
                  expandedId={expandedClienteEnEstudio}
                  setExpandedId={setExpandedClienteEnEstudio}
                />
              )}
            </div>
          )}

          {estudiosConClientes.length === 0 && sinEstudio.length === 0 && (
            <div className="bg-card rounded-xl border border-border p-12 text-center text-text-muted">
              No hay datos registrados
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar este cliente?"
        description={deleteTarget && (
          <>Se eliminará <strong>{deleteTarget.nombre}</strong> y todos sus datos asociados. Esta acción no se puede deshacer.</>
        )}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditTarget(null); setForm({ nombre: '', email: '', telefono: '', estudio_id: '' }) }} title={editTarget ? 'Editar cliente' : 'Nuevo cliente'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre</label>
            <input type="text" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre completo" required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="cliente@email.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Teléfono</label>
            <input type="text" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="+54 11 0000-0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Estudio derivador</label>
            <select value={form.estudio_id} onChange={e => setForm({ ...form, estudio_id: e.target.value })}>
              <option value="">Sin estudio</option>
              {estudios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
