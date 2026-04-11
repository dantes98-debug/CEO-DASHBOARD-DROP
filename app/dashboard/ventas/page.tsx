'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate, getCurrentMonthRange, getMonthName } from '@/lib/utils'
import { TrendingUp, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

type TipoVenta = 'blanco_a' | 'blanco_b' | 'negro'
type Moneda = 'ars' | 'usd'
type FiltroTipo = 'todos' | TipoVenta

const TIPO_LABEL: Record<TipoVenta, string> = { blanco_a: 'Factura A', blanco_b: 'Factura B', negro: 'Negro' }
const TIPO_COLOR: Record<TipoVenta, string> = { blanco_a: 'text-blue-400', blanco_b: 'text-purple-400', negro: 'text-yellow-400' }
const IVA_DEFAULT: Record<TipoVenta, number> = { blanco_a: 21, blanco_b: 21, negro: 0 }

interface Venta {
  id: string
  fecha: string
  monto: number
  moneda: Moneda
  tipo_cambio: number
  monto_ars: number
  tipo: TipoVenta
  costo: number
  iva_pct: number
  descripcion: string | null
  cliente_id: string | null
  clientes?: { nombre: string } | null
  created_at: string
  // calculated
  iva?: number
  ganancia?: number
}

interface Cliente { id: string; nombre: string }

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tipoCambioDefault, setTipoCambioDefault] = useState(1000)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filtro, setFiltro] = useState<FiltroTipo>('todos')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    cliente_id: '',
    monto: '',
    moneda: 'ars' as Moneda,
    tipo_cambio: '',
    tipo: 'blanco_a' as TipoVenta,
    costo: '',
    iva_pct: '21',
    descripcion: '',
  })

  const hoy = new Date()
  const anioActual = hoy.getFullYear()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [ventasRes, clientesRes, configRes] = await Promise.all([
      supabase.from('ventas').select('*, clientes(nombre)').order('fecha', { ascending: false }),
      supabase.from('clientes').select('id, nombre').order('nombre'),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
    ])
    const tc = Number(configRes.data?.valor || 1000)
    setTipoCambioDefault(tc)

    const withCalc = (ventasRes.data || []).map((v) => {
      const montoArs = v.moneda === 'usd' ? Number(v.monto) * Number(v.tipo_cambio || tc) : Number(v.monto)
      const ivaMonto = (montoArs / (1 + Number(v.iva_pct || 0) / 100)) * (Number(v.iva_pct || 0) / 100)
      const ganancia = montoArs - Number(v.costo || 0) - ivaMonto
      return { ...v, monto_ars: montoArs, iva: ivaMonto, ganancia }
    })

    setVentas(withCalc)
    setClientes(clientesRes.data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const tc = form.moneda === 'usd' ? Number(form.tipo_cambio) || tipoCambioDefault : 1
    const montoArs = form.moneda === 'usd' ? Number(form.monto) * tc : Number(form.monto)
    await supabase.from('ventas').insert({
      fecha: form.fecha,
      cliente_id: form.cliente_id || null,
      monto: Number(form.monto),
      moneda: form.moneda,
      tipo_cambio: tc,
      monto_ars: montoArs,
      tipo: form.tipo,
      costo: Number(form.costo) || 0,
      iva_pct: Number(form.iva_pct) || 0,
      descripcion: form.descripcion || null,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ fecha: new Date().toISOString().split('T')[0], cliente_id: '', monto: '', moneda: 'ars', tipo_cambio: '', tipo: 'blanco_a', costo: '', iva_pct: '21', descripcion: '' })
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

  // Cards
  const ventasMesTotal = ventas.filter(v => v.fecha >= start && v.fecha <= end).reduce((s, v) => s + v.monto_ars, 0)
  const ventasAnioTotal = ventas.filter(v => v.fecha.startsWith(String(anioActual))).reduce((s, v) => s + v.monto_ars, 0)
  const gananciasMes = ventas.filter(v => v.fecha >= start && v.fecha <= end).reduce((s, v) => s + (v.ganancia || 0), 0)
  const costosMes = ventas.filter(v => v.fecha >= start && v.fecha <= end).reduce((s, v) => s + Number(v.costo || 0), 0)

  // Chart
  const monthlyMap: Record<string, { blanco_a: number; blanco_b: number; negro: number }> = {}
  ventas.forEach((v) => {
    if (!v.fecha.startsWith(String(anioActual))) return
    const month = parseInt(v.fecha.slice(5, 7))
    const key = getMonthName(month)
    if (!monthlyMap[key]) monthlyMap[key] = { blanco_a: 0, blanco_b: 0, negro: 0 }
    monthlyMap[key][v.tipo || 'blanco_a'] += v.monto_ars
  })
  const chartData = Object.entries(monthlyMap).map(([mes, vals]) => ({ mes, ...vals }))

  // Preview en form
  const formMontoArs = form.moneda === 'usd'
    ? Number(form.monto) * (Number(form.tipo_cambio) || tipoCambioDefault)
    : Number(form.monto)
  const formIva = formMontoArs > 0
    ? (formMontoArs / (1 + Number(form.iva_pct) / 100)) * (Number(form.iva_pct) / 100)
    : 0
  const formGanancia = formMontoArs - Number(form.costo || 0) - formIva

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
      render: (_: unknown, row: Venta) => row.clientes?.nombre || <span className="text-muted text-xs">—</span>,
    },
    {
      key: 'monto',
      label: 'Monto original',
      render: (v: unknown, row: Venta) => (
        <span className="font-medium">
          {row.moneda === 'usd'
            ? `USD ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
            : formatCurrency(Number(v))}
        </span>
      ),
    },
    {
      key: 'monto_ars',
      label: 'Total ARS',
      render: (v: unknown) => <span className="font-semibold text-green-400">{formatCurrency(Number(v))}</span>,
    },
    {
      key: 'id',
      label: '',
      render: (_: unknown, row: Venta) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === row.id ? null : row.id) }}
            className="text-xs text-text-muted hover:text-accent transition-colors flex items-center gap-1"
          >
            {expandedId === row.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Detalle
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
            Eliminar
          </button>
        </div>
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
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Agregar venta
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Ventas del mes" value={formatCurrency(ventasMesTotal)} icon={TrendingUp} color="blue" loading={loading} />
        <MetricCard title={`Acumulado ${anioActual}`} value={formatCurrency(ventasAnioTotal)} icon={TrendingUp} color="green" loading={loading} />
        <MetricCard title="Costos del mes" value={formatCurrency(costosMes)} icon={TrendingUp} color="purple" loading={loading} />
        <MetricCard title="Ganancia del mes" value={formatCurrency(gananciasMes)} icon={TrendingUp} color="yellow" loading={loading} />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {(['todos', 'blanco_a', 'blanco_b', 'negro'] as FiltroTipo[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtro === f ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}
          >
            {f === 'todos' ? 'Todos' : TIPO_LABEL[f as TipoVenta]}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-1">Ventas {anioActual} por mes y tipo</h3>
          <p className="text-xs text-text-muted mb-5">Montos en ARS</p>
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
              <Bar dataKey="blanco_a" stackId="a" fill="#3b82f6" />
              <Bar dataKey="blanco_b" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="negro" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table with expandable detail */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-text-muted">Cargando...</div>
        ) : ventasFiltradas.length === 0 ? (
          <div className="p-8 text-center text-text-muted">No hay ventas registradas</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th key={col.key} className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map((row) => (
                <>
                  <tr key={row.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-text-primary">
                        {col.render ? (col.render as (v: unknown, r: Venta) => React.ReactNode)(row[col.key as keyof Venta], row) : String(row[col.key as keyof Venta] ?? '')}
                      </td>
                    ))}
                  </tr>
                  {expandedId === row.id && (
                    <tr key={`${row.id}-detail`} className="bg-card-hover border-b border-border/50">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-card rounded-lg p-3">
                            <p className="text-xs text-text-muted mb-1">Total ARS</p>
                            <p className="text-sm font-semibold text-green-400">{formatCurrency(row.monto_ars)}</p>
                            {row.moneda === 'usd' && <p className="text-xs text-text-muted mt-0.5">TC: ${Number(row.tipo_cambio).toLocaleString('es-AR')}</p>}
                          </div>
                          <div className="bg-card rounded-lg p-3">
                            <p className="text-xs text-text-muted mb-1">Costo</p>
                            <p className="text-sm font-semibold text-red-400">{formatCurrency(Number(row.costo || 0))}</p>
                          </div>
                          <div className="bg-card rounded-lg p-3">
                            <p className="text-xs text-text-muted mb-1">IVA ({row.iva_pct || 0}%)</p>
                            <p className="text-sm font-semibold text-yellow-400">{formatCurrency(row.iva || 0)}</p>
                          </div>
                          <div className="bg-card rounded-lg p-3">
                            <p className="text-xs text-text-muted mb-1">Ganancia neta</p>
                            <p className={`text-sm font-semibold ${(row.ganancia || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(row.ganancia || 0)}</p>
                          </div>
                        </div>
                        {row.descripcion && <p className="text-xs text-text-muted mt-2">{row.descripcion}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
              <select value={form.tipo} onChange={(e) => {
                const t = e.target.value as TipoVenta
                setForm({ ...form, tipo: t, iva_pct: String(IVA_DEFAULT[t]) })
              }}>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Moneda</label>
              <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value as Moneda })}>
                <option value="ars">Pesos (ARS)</option>
                <option value="usd">Dólares (USD)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto</label>
              <input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0.00" required />
            </div>
          </div>

          {form.moneda === 'usd' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo de cambio</label>
              <input type="number" min="0" step="1" value={form.tipo_cambio} onChange={(e) => setForm({ ...form, tipo_cambio: e.target.value })} placeholder={String(tipoCambioDefault)} />
              {form.monto && (
                <p className="text-xs text-text-muted mt-1">
                  = {formatCurrency(Number(form.monto) * (Number(form.tipo_cambio) || tipoCambioDefault))} ARS
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Costo (ARS)</label>
              <input type="number" min="0" step="0.01" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">IVA %</label>
              <input type="number" min="0" max="100" step="0.1" value={form.iva_pct} onChange={(e) => setForm({ ...form, iva_pct: e.target.value })} placeholder="21" />
            </div>
          </div>

          {/* Preview */}
          {formMontoArs > 0 && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-card-hover rounded-lg">
              <div className="text-center">
                <p className="text-xs text-text-muted">Costo</p>
                <p className="text-sm font-semibold text-red-400">{formatCurrency(Number(form.costo || 0))}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-text-muted">IVA</p>
                <p className="text-sm font-semibold text-yellow-400">{formatCurrency(formIva)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-text-muted">Ganancia</p>
                <p className={`text-sm font-semibold ${formGanancia >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(formGanancia)}</p>
              </div>
            </div>
          )}

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
