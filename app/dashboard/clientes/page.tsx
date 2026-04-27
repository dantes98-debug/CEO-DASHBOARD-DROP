'use client'

import { useEffect, useState, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Users, Plus, Download, Search, ChevronDown, ChevronRight, ChevronUp, Building2, X, BarChart2, HandCoins, Trash2, Pencil } from 'lucide-react'
import { exportarExcel } from '@/lib/exportar'
import { toast } from 'sonner'
import RowMenu from '@/components/RowMenu'
import ConfirmDialog from '@/components/ConfirmDialog'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'

interface Estudio {
  id: string
  nombre: string
  comision_pct: number
}

interface Comision {
  id: string
  estudio_id: string | null
  venta_id: string | null
  monto: number
  pagada: boolean
  fecha: string
}

interface EstudioGrupo {
  id: string
  nombre: string
  entries: { cliente: Cliente; ventas: VentaDetalle[]; total: number }[]
  totalFacturado: number
}

interface VentaDetalle {
  id: string
  fecha: string
  numero_factura: string | null
  tipo: string
  monto_ars: number
  razon_social: string | null
  estudio_id: string | null
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

function EstudioClientesRows({ entries, expandedId, setExpandedId }: {
  entries: { cliente: Cliente; ventas: VentaDetalle[]; total: number }[]
  expandedId: string | null
  setExpandedId: (id: string | null) => void
}) {
  return (
    <div className="border-t border-border divide-y divide-border/40">
      {entries.map(({ cliente: c, ventas, total }) => (
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
            <span className="text-xs text-text-muted ml-2">{ventas.length} venta{ventas.length !== 1 ? 's' : ''}</span>
            <span className="text-sm font-semibold text-green-400 ml-4 flex-shrink-0">{formatCurrency(total)}</span>
          </button>
          {expandedId === c.id && (
            <div className="px-10 py-4 bg-card-hover/40">
              <VentasTable ventas={ventas} total={total} />
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

  const [vista, setVista] = useState<'clientes' | 'estudios' | 'comisiones'>('clientes')
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstudio, setFiltroEstudio] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedEstudio, setExpandedEstudio] = useState<string | null>(null)
  const [expandedClienteEnEstudio, setExpandedClienteEnEstudio] = useState<string | null>(null)
  const [estudiosGrupos, setEstudiosGrupos] = useState<EstudioGrupo[]>([])
  const [sinEstudio, setSinEstudio] = useState<{ cliente: Cliente; ventas: VentaDetalle[]; total: number }[]>([])
  const [chartOpen, setChartOpen] = useState(false)
  const [ventasMensuales, setVentasMensuales] = useState<{ mes: string; total: number }[]>([])
  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [expandedComisionEstudio, setExpandedComisionEstudio] = useState<string | null>(null)
  const [registrarEstudio, setRegistrarEstudio] = useState<Estudio | null>(null)
  const [comisionForm, setComisionForm] = useState({ monto: '', fecha: new Date().toISOString().split('T')[0] })
  const [savingComision, setSavingComision] = useState(false)
  const [editPctEstudio, setEditPctEstudio] = useState<Estudio | null>(null)
  const [editPct, setEditPct] = useState('')
  const [savingPct, setSavingPct] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [clientesRes, estudiosRes, ventasRes, comisionesRes] = await Promise.all([
      supabase.from('clientes').select('*, estudios(nombre)').order('nombre'),
      supabase.from('estudios').select('id, nombre, comision_pct').order('nombre'),
      supabase.from('ventas')
        .select('id, fecha, monto, moneda, tipo_cambio, monto_ars, numero_factura, razon_social, tipo, items, cliente_id, estudio_id')
        .order('fecha', { ascending: false }),
      supabase.from('comisiones').select('*').order('fecha', { ascending: false }),
    ])

    const ventasPorCliente: Record<string, VentaDetalle[]> = {}
    const totalPorCliente: Record<string, number> = {}
    const byEstudio: Record<string, Record<string, VentaDetalle[]>> = {}
    const clientesConEstudio = new Set<string>()

    for (const v of (ventasRes.data || [])) {
      if (!v.cliente_id) continue
      let montoArs = v.moneda === 'usd'
        ? Number(v.monto) * Number(v.tipo_cambio || 1000)
        : Number(v.monto)
      if (montoArs === 0 && Array.isArray(v.items) && v.items.length > 0) {
        montoArs = (v.items as { precio_unitario: number; cantidad: number }[])
          .reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
      }
      const vd = { ...v, monto_ars: montoArs } as VentaDetalle
      if (!ventasPorCliente[v.cliente_id]) ventasPorCliente[v.cliente_id] = []
      ventasPorCliente[v.cliente_id].push(vd)
      totalPorCliente[v.cliente_id] = (totalPorCliente[v.cliente_id] || 0) + montoArs

      if (v.estudio_id) {
        clientesConEstudio.add(v.cliente_id)
        if (!byEstudio[v.estudio_id]) byEstudio[v.estudio_id] = {}
        if (!byEstudio[v.estudio_id][v.cliente_id]) byEstudio[v.estudio_id][v.cliente_id] = []
        byEstudio[v.estudio_id][v.cliente_id].push(vd)
      }
    }

    const clientesConVentas: Cliente[] = (clientesRes.data || []).map(c => ({
      ...c,
      ventas: ventasPorCliente[c.id] || [],
      total_compras: totalPorCliente[c.id] || 0,
    }))

    const clienteById = Object.fromEntries(clientesConVentas.map(c => [c.id, c]))

    const grupos: EstudioGrupo[] = (estudiosRes.data || [])
      .map(e => {
        const byCliente = byEstudio[e.id] || {}
        const entries = Object.entries(byCliente).flatMap(([clienteId, vs]) => {
          const cliente = clienteById[clienteId]
          if (!cliente) return []
          const total = vs.reduce((s, v) => s + v.monto_ars, 0)
          return [{ cliente, ventas: vs, total }]
        })
        const totalFacturado = entries.reduce((s, en) => s + en.total, 0)
        return { id: e.id, nombre: e.nombre, entries, totalFacturado }
      })
      .filter(g => g.entries.length > 0)
      .sort((a, b) => b.totalFacturado - a.totalFacturado)

    const sinEstudioEntries = clientesConVentas
      .filter(c => !clientesConEstudio.has(c.id))
      .map(c => ({ cliente: c, ventas: c.ventas, total: c.total_compras }))

    const mensualMap: Record<string, number> = {}
    for (const v of (ventasRes.data || [])) {
      if (!v.fecha) continue
      const mes = v.fecha.slice(0, 7)
      let m = v.moneda === 'usd' ? Number(v.monto) * Number(v.tipo_cambio || 1000) : Number(v.monto)
      if (m === 0 && Array.isArray(v.items) && v.items.length > 0)
        m = (v.items as { precio_unitario: number; cantidad: number }[]).reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
      mensualMap[mes] = (mensualMap[mes] || 0) + m
    }
    const mesesData = Object.entries(mensualMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([mes, total]) => ({ mes: `${mes.slice(5, 7)}/${mes.slice(2, 4)}`, total }))

    setClientes(clientesConVentas)
    setEstudios(estudiosRes.data || [])
    setEstudiosGrupos(grupos)
    setSinEstudio(sinEstudioEntries)
    setVentasMensuales(mesesData)
    setComisiones(comisionesRes.data || [])
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

  const handleSavePct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editPctEstudio) return
    setSavingPct(true)
    const supabase = createClient()
    await supabase.from('estudios').update({ comision_pct: Number(editPct) }).eq('id', editPctEstudio.id)
    await fetchData()
    setEditPctEstudio(null)
    setSavingPct(false)
  }

  const handleTogglePagadaComision = async (id: string, pagada: boolean) => {
    const supabase = createClient()
    await supabase.from('comisiones').update({ pagada: !pagada }).eq('id', id)
    await fetchData()
  }

  const handleDeleteComision = async (id: string) => {
    if (!confirm('¿Eliminar esta comisión?')) return
    const supabase = createClient()
    await supabase.from('comisiones').delete().eq('id', id)
    await fetchData()
  }

  const handleSubmitComision = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!registrarEstudio) return
    setSavingComision(true)
    const supabase = createClient()
    await supabase.from('comisiones').insert({
      estudio_id: registrarEstudio.id,
      monto: Number(comisionForm.monto),
      fecha: comisionForm.fecha,
      pagada: false,
    })
    await fetchData()
    setRegistrarEstudio(null)
    setComisionForm({ monto: '', fecha: new Date().toISOString().split('T')[0] })
    setSavingComision(false)
  }

  const clientesFiltrados = clientes.filter(c => {
    const matchBusqueda = !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
    const matchEstudio = !filtroEstudio || c.estudio_id === filtroEstudio
    return matchBusqueda && matchEstudio
  })

  const totalFacturado = clientes.reduce((s, c) => s + c.total_compras, 0)

  const comisionesPorEstudio = estudios
    .map(e => {
      const registros = comisiones.filter(c => c.estudio_id === e.id)
      const registrado = registros.reduce((s, c) => s + Number(c.monto), 0)
      const pagado = registros.filter(c => c.pagada).reduce((s, c) => s + Number(c.monto), 0)
      const pendiente = registrado - pagado
      const grupo = estudiosGrupos.find(g => g.id === e.id)
      const facturado = grupo?.totalFacturado || 0
      const calculada = facturado * (e.comision_pct || 0) / 100
      return { estudio: e, registros, registrado, pagado, pendiente, totalFacturado: facturado, calculada }
    })
    .filter(x => (x.estudio.comision_pct > 0 && x.totalFacturado > 0) || x.registros.length > 0)
    .sort((a, b) => b.totalFacturado - a.totalFacturado)

  const totalCalculada = comisionesPorEstudio.reduce((s, x) => s + x.calculada, 0)
  const totalRegistrado = comisionesPorEstudio.reduce((s, x) => s + x.registrado, 0)
  const totalPendiente = comisionesPorEstudio.reduce((s, x) => s + x.pendiente, 0)

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
        <MetricCard title="Estudios derivadores" value={String(estudiosGrupos.length)} icon={Users} color="purple" loading={loading} />
        <MetricCard title="Facturación total" value={formatCurrency(totalFacturado)} icon={Users} color="green" loading={loading} />
      </div>

      {/* Gráficos expandibles */}
      <div className="bg-card rounded-xl border border-border overflow-hidden mb-5">
        <button
          onClick={() => setChartOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-card-hover transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <BarChart2 className="w-4 h-4 text-accent" /> Análisis visual
          </span>
          {chartOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
        </button>
        {chartOpen && (
          <div className="border-t border-border px-5 pb-6 space-y-6">
            {/* Top clientes */}
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mt-5 mb-3">Top clientes por facturación</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  layout="vertical"
                  data={[...clientes].sort((a, b) => b.total_compras - a.total_compras).slice(0, 10).map(c => ({ nombre: c.nombre, total: c.total_compras }))}
                  margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="nombre" tick={{ fill: '#475569', fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Facturado']} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                  <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Por estudio + Evolución */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Por estudio derivador</p>
                {estudiosGrupos.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-10">Sin datos</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={estudiosGrupos.map(e => ({ nombre: e.nombre, total: e.totalFacturado }))} margin={{ top: 0, right: 0, left: -20, bottom: 28 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="nombre" tick={{ fill: '#475569', fontSize: 10 }} angle={-20} textAnchor="end" interval={0} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), 'Facturado']} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                      <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Evolución mensual</p>
                {ventasMensuales.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-10">Sin datos</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={ventasMensuales} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="mes" tick={{ fill: '#475569', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => [formatCurrency(v), 'Facturado']} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                      <Line type="monotone" dataKey="total" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
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
          <button
            onClick={() => setVista('comisiones')}
            className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 border-l border-border ${vista === 'comisiones' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}
          >
            <HandCoins className="w-4 h-4" /> Comisiones
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
          {estudiosGrupos.map(e => (
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
                    {e.entries.length} cliente{e.entries.length !== 1 ? 's' : ''} ·{' '}
                    {e.entries.reduce((s, entry) => s + entry.ventas.length, 0)} venta{e.entries.reduce((s, entry) => s + entry.ventas.length, 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <p className="text-base font-bold text-green-400 flex-shrink-0">{formatCurrency(e.totalFacturado)}</p>
              </button>
              {expandedEstudio === e.id && (
                <EstudioClientesRows
                  entries={e.entries}
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
                  {formatCurrency(sinEstudio.reduce((s, e) => s + e.total, 0))}
                </p>
              </button>
              {expandedEstudio === '__sin__' && (
                <EstudioClientesRows
                  entries={sinEstudio}
                  expandedId={expandedClienteEnEstudio}
                  setExpandedId={setExpandedClienteEnEstudio}
                />
              )}
            </div>
          )}

          {estudiosGrupos.length === 0 && sinEstudio.length === 0 && (
            <div className="bg-card rounded-xl border border-border p-12 text-center text-text-muted">
              No hay datos registrados
            </div>
          )}
        </div>
      )}

      {/* ── VISTA COMISIONES ── */}
      {vista === 'comisiones' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-text-muted mb-1">Comisión calculada</p>
              <p className="text-xl font-bold text-yellow-400">{formatCurrency(totalCalculada)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-text-muted mb-1">Pagado</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(totalRegistrado - totalPendiente)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-text-muted mb-1">Pendiente</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(totalPendiente)}</p>
            </div>
          </div>

          {comisionesPorEstudio.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center text-text-muted">
              No hay estudios con facturación registrada
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card-hover">
                    <th className="w-10 px-4 py-3"></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Estudio</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase">%</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Facturado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Calculada</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase hidden md:table-cell">Registrado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase hidden md:table-cell">Pagado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Pendiente</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {comisionesPorEstudio.map(({ estudio: est, registros, registrado, pagado, pendiente, totalFacturado: facturado, calculada }) => (
                    <Fragment key={est.id}>
                      <tr
                        className="border-b border-border/50 hover:bg-card-hover transition-colors cursor-pointer"
                        onClick={() => setExpandedComisionEstudio(expandedComisionEstudio === est.id ? null : est.id)}
                      >
                        <td className="px-4 py-3 text-text-muted">
                          {expandedComisionEstudio === est.id
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 font-medium text-text-primary">{est.nombre}</td>
                        <td className="px-4 py-3 text-center" onClick={ev => ev.stopPropagation()}>
                          <button
                            onClick={() => { setEditPctEstudio(est); setEditPct(String(est.comision_pct)) }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition-colors group"
                          >
                            {est.comision_pct}%
                            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right text-text-secondary">{formatCurrency(facturado)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-yellow-400">{formatCurrency(calculada)}</td>
                        <td className="px-4 py-3 text-right text-text-primary hidden md:table-cell">{formatCurrency(registrado)}</td>
                        <td className="px-4 py-3 text-right text-green-400 hidden md:table-cell">{formatCurrency(pagado)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={pendiente > 0 ? 'text-red-400 font-semibold' : 'text-text-muted'}>
                            {formatCurrency(pendiente)}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                          <button
                            onClick={() => {
                              const suggested = calculada - registrado
                              setRegistrarEstudio(est)
                              setComisionForm({
                                monto: suggested > 0 ? suggested.toFixed(2) : '',
                                fecha: new Date().toISOString().split('T')[0],
                              })
                            }}
                            className="text-xs text-accent hover:text-accent-hover font-medium whitespace-nowrap"
                          >
                            + Registrar
                          </button>
                        </td>
                      </tr>
                      {expandedComisionEstudio === est.id && (
                        <tr className="border-b border-border bg-card-hover/40">
                          <td colSpan={9} className="px-8 py-4">
                            {registros.length === 0 ? (
                              <p className="text-xs text-text-muted text-center py-2">
                                Sin comisiones registradas. Usá &quot;+ Registrar&quot; para agregar.
                              </p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border/50">
                                    <th className="text-left py-1.5 text-text-muted font-medium">Fecha</th>
                                    <th className="text-right py-1.5 text-text-muted font-medium">Monto</th>
                                    <th className="text-center py-1.5 text-text-muted font-medium">Estado</th>
                                    <th className="py-1.5"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {registros.map(r => (
                                    <tr key={r.id} className="border-b border-border/20">
                                      <td className="py-2 text-text-secondary">{formatDate(r.fecha)}</td>
                                      <td className="py-2 text-right font-semibold text-yellow-400">{formatCurrency(Number(r.monto))}</td>
                                      <td className="py-2 text-center">
                                        <button
                                          onClick={() => handleTogglePagadaComision(r.id, r.pagada)}
                                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                                            r.pagada
                                              ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                              : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                                          }`}
                                        >
                                          {r.pagada ? '✓ Pagada' : 'Pendiente'}
                                        </button>
                                      </td>
                                      <td className="py-2 text-right">
                                        <button
                                          onClick={() => handleDeleteComision(r.id)}
                                          className="text-red-400 hover:text-red-300 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
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

      <Modal isOpen={!!editPctEstudio} onClose={() => setEditPctEstudio(null)} title={`Editar comisión — ${editPctEstudio?.nombre}`} size="sm">
        <form onSubmit={handleSavePct} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Comisión (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={editPct} onChange={e => setEditPct(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setEditPctEstudio(null)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={savingPct} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{savingPct ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!registrarEstudio} onClose={() => setRegistrarEstudio(null)} title={`Registrar comisión — ${registrarEstudio?.nombre}`} size="sm">
        <form onSubmit={handleSubmitComision} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
            <input type="date" value={comisionForm.fecha} onChange={e => setComisionForm({ ...comisionForm, fecha: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto</label>
            <input type="number" min="0" step="0.01" value={comisionForm.monto} onChange={e => setComisionForm({ ...comisionForm, monto: e.target.value })} placeholder="0.00" required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setRegistrarEstudio(null)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={savingComision} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{savingComision ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

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
