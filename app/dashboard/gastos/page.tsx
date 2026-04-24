'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate, getCurrentMonthRange, getMonthName } from '@/lib/utils'
import { Receipt, Plus, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
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

interface VentaRaw {
  fecha: string
  monto_ars: number
  subtotal: number
  canal: string
}

interface VentaMes {
  mes: string   // YYYY-MM
  facturacion: number
  facturacion_meta: number
  facturacion_ads: number  // solo meta (por ahora)
}

const TIPOS = [
  { key: 'fijo',       label: 'Fijos',       color: '#3b82f6' },
  { key: 'variable',   label: 'Variables',   color: '#f59e0b' },
  { key: 'sueldo',     label: 'Sueldos',     color: '#22c55e' },
  { key: 'publicidad', label: 'Publicidad',  color: '#a855f7' },
] as const

type TipoKey = typeof TIPOS[number]['key']

// Categorías que son "inversión en pauta" (sin agencia)
const CATS_PAUTA = ['Meta Ads', 'Influencers']
const CATS_AGENCIA = ['Agencia']

const CATEGORIAS_POR_TIPO: Record<TipoKey, string[]> = {
  fijo:       ['Alquiler', 'Servicios', 'Impuestos', 'Mantenimiento', 'Seguro', 'Otro'],
  variable:   ['Logística', 'Insumos', 'Envíos', 'Compras', 'Otro'],
  sueldo:     ['Empleado', 'Monotributo', 'Cargas sociales', 'Otro'],
  publicidad: ['Meta Ads', 'Influencers', 'Agencia', 'Diseño', 'Otro'],
}

function getPadMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return getPadMonth(d)
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${getMonthName(m)} ${y}`
}

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [ventasPorMes, setVentasPorMes] = useState<VentaMes[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TipoKey | 'todos'>('todos')
  const [mesPub, setMesPub] = useState(getPadMonth(new Date()))
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
    const [gastosRes, ventasRes] = await Promise.all([
      supabase.from('gastos').select('*').order('fecha', { ascending: false }),
      supabase.from('ventas').select('fecha, monto_ars, subtotal, canal'),
    ])
    setGastos((gastosRes.data || []) as Gasto[])

    // Aggregate ventas by YYYY-MM with canal breakdown
    const map: Record<string, { facturacion: number; facturacion_meta: number }> = {}
    for (const v of (ventasRes.data || []) as VentaRaw[]) {
      const key = v.fecha.slice(0, 7)
      const monto = Number(v.monto_ars || v.subtotal || 0)
      if (!map[key]) map[key] = { facturacion: 0, facturacion_meta: 0 }
      map[key].facturacion += monto
      if (v.canal === 'meta') map[key].facturacion_meta += monto
    }
    setVentasPorMes(Object.entries(map).map(([mes, v]) => ({
      mes,
      facturacion: v.facturacion,
      facturacion_meta: v.facturacion_meta,
      facturacion_ads: v.facturacion_meta,
    })))
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('gastos').insert({
      fecha: form.fecha,
      tipo: form.tipo,
      categoria: form.categoria,
      descripcion: form.descripcion || null,
      monto: Number(form.monto),
    })
    if (error) { toast.error('Error al guardar el gasto'); setSaving(false); return }
    await fetchData()
    setModalOpen(false)
    setForm({ fecha: new Date().toISOString().split('T')[0], tipo: 'fijo', categoria: CATEGORIAS_POR_TIPO.fijo[0], descripcion: '', monto: '' })
    setSaving(false)
    toast.success('Gasto guardado correctamente')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    const supabase = createClient()
    await supabase.from('gastos').delete().eq('id', id)
    await fetchData()
    toast.success('Gasto eliminado')
  }

  // ── Metrics globales ──
  const { start, end } = getCurrentMonthRange()
  const gastosMes = gastos.filter(g => g.fecha >= start && g.fecha <= end)
  const totalMes = gastosMes.reduce((s, g) => s + Number(g.monto), 0)
  const mesPorTipo = (tipo: TipoKey) =>
    gastosMes.filter(g => g.tipo === tipo).reduce((s, g) => s + Number(g.monto), 0)

  // ── Monthly stacked chart ──
  const monthlyMap: Record<string, Record<TipoKey, number>> = {}
  gastos.forEach(g => {
    const month = parseInt(g.fecha.slice(5, 7))
    const year = g.fecha.slice(0, 4)
    const key = `${getMonthName(month)} ${year}`
    if (!monthlyMap[key]) monthlyMap[key] = { fijo: 0, variable: 0, sueldo: 0, publicidad: 0 }
    monthlyMap[key][g.tipo as TipoKey] = (monthlyMap[key][g.tipo as TipoKey] || 0) + Number(g.monto)
  })
  const barData = Object.entries(monthlyMap).map(([mes, vals]) => ({ mes, ...vals }))

  // ── ROAS section ──
  const pubMesStart = `${mesPub}-01`
  const pubMesEnd = `${mesPub}-31`
  const gastosPubMes = gastos.filter(g => g.tipo === 'publicidad' && g.fecha >= pubMesStart && g.fecha <= pubMesEnd)
  const invPauta = gastosPubMes.filter(g => CATS_PAUTA.includes(g.categoria)).reduce((s, g) => s + Number(g.monto), 0)
  const invAgencia = gastosPubMes.filter(g => CATS_AGENCIA.includes(g.categoria)).reduce((s, g) => s + Number(g.monto), 0)
  const invOtros = gastosPubMes.filter(g => !CATS_PAUTA.includes(g.categoria) && !CATS_AGENCIA.includes(g.categoria)).reduce((s, g) => s + Number(g.monto), 0)
  const totalPub = invPauta + invAgencia + invOtros

  const mesPubData = ventasPorMes.find(v => v.mes === mesPub)
  const facturacionMesPub = mesPubData?.facturacion || 0
  const facturacionMeta = mesPubData?.facturacion_meta || 0
  const facturacionAds = mesPubData?.facturacion_ads || 0

  // Pauta Meta
  const invMeta = gastosPubMes.filter(g => g.categoria === 'Meta Ads').reduce((s, g) => s + Number(g.monto), 0)

  // ROAS
  const roasMeta = invMeta > 0 ? facturacionMeta / invMeta : null
  const roas = invPauta > 0 ? facturacionAds / invPauta : null
  const roasReal = totalPub > 0 ? facturacionAds / totalPub : null
  const pctPubFact = facturacionAds > 0 ? (totalPub / facturacionAds) * 100 : null

  // ROAS history chart (all months with pub data)
  const allMonthsPub = Array.from(new Set(gastos.filter(g => g.tipo === 'publicidad').map(g => g.fecha.slice(0, 7)))).sort()
  const roasHistory = allMonthsPub.map(mes => {
    const s = `${mes}-01`, e2 = `${mes}-31`
    const pub = gastos.filter(g => g.tipo === 'publicidad' && g.fecha >= s && g.fecha <= e2)
    const pauta = pub.filter(g => CATS_PAUTA.includes(g.categoria)).reduce((a, g) => a + Number(g.monto), 0)
    const agencia = pub.filter(g => CATS_AGENCIA.includes(g.categoria)).reduce((a, g) => a + Number(g.monto), 0)
    const otros = pub.filter(g => !CATS_PAUTA.includes(g.categoria) && !CATS_AGENCIA.includes(g.categoria)).reduce((a, g) => a + Number(g.monto), 0)
    const tot = pauta + agencia + otros
    const mesData = ventasPorMes.find(v => v.mes === mes)
    const fact = mesData?.facturacion_ads || 0
    return {
      mes: monthLabel(mes),
      facturacion: fact,
      pauta,
      agencia,
      otros,
      roas: pauta > 0 ? Math.round((fact / pauta) * 100) / 100 : 0,
      roasReal: tot > 0 ? Math.round((fact / tot) * 100) / 100 : 0,
    }
  })

  // ── Filtered table ──
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

  function roasBadge(val: number | null) {
    if (val === null) return <span className="text-text-muted">—</span>
    const color = val >= 3 ? 'text-green-400' : val >= 1.5 ? 'text-yellow-400' : 'text-red-400'
    return <span className={`text-2xl font-bold ${color}`}>{val.toFixed(2)}x</span>
  }

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
      <div className="flex gap-2 mb-6 flex-wrap">
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

      {/* ── ROAS Panel (solo cuando tab === publicidad) ── */}
      {tab === 'publicidad' && (
        <div className="mb-8 space-y-6">
          {/* Selector de mes */}
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-text-primary">Análisis ROAS</h2>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setMesPub(m => addMonths(m, -1))}
                className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors">
                <ChevronLeft className="w-4 h-4 text-text-secondary" />
              </button>
              <span className="text-sm font-medium text-text-primary min-w-[120px] text-center">
                {monthLabel(mesPub)}
              </span>
              <button onClick={() => setMesPub(m => addMonths(m, 1))}
                className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors">
                <ChevronRight className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
          </div>

          {/* Métricas ROAS del mes seleccionado */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs text-text-secondary mb-1">Facturación por Meta</p>
              <p className="text-xl font-bold text-text-primary">{formatCurrency(facturacionAds)}</p>
              <p className="text-xs text-text-muted mt-0.5">Ventas etiquetadas Meta Ads</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs text-text-secondary mb-1">Inversión en pauta</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(invPauta)}</p>
              <p className="text-xs text-text-muted mt-0.5">Meta Ads + Influencers</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs text-text-secondary mb-1">Agencia publicitaria</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(invAgencia)}</p>
              <p className="text-xs text-text-muted mt-0.5">Honorarios</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs text-text-secondary mb-1">% Pub. / Fact. Ads</p>
              <p className="text-xl font-bold text-yellow-400">
                {pctPubFact !== null ? `${pctPubFact.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">Total pub: {formatCurrency(totalPub)}</p>
            </div>
          </div>

          {/* ROAS cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl border border-blue-500/30 p-5">
              <p className="text-xs text-blue-400 mb-2 font-medium">ROAS Meta Ads</p>
              {roasBadge(roasMeta)}
              <p className="text-xs text-text-muted mt-1">{formatCurrency(facturacionMeta)} / {formatCurrency(invMeta)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs text-text-secondary mb-2 font-medium">ROAS Pauta Total</p>
              {roasBadge(roas)}
              <p className="text-xs text-text-muted mt-1">
                {roas !== null ? (roas >= 3 ? '✓ Excelente' : roas >= 1.5 ? '⚠ Aceptable' : '✗ Bajo') : 'Sin datos'}
              </p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs text-text-secondary mb-2 font-medium">ROAS Real (+ Agencia)</p>
              {roasBadge(roasReal)}
              {invAgencia > 0 && roasReal !== null && roas !== null && (
                <p className="text-xs text-yellow-400 mt-1">La agencia baja {(roas - roasReal).toFixed(2)}x</p>
              )}
            </div>
          </div>

          {/* Gráfico histórico ROAS */}
          {roasHistory.length > 1 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-base font-semibold text-text-primary mb-6">Evolución histórica</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={roasHistory} margin={{ top: 0, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    formatter={(value: number, name: string) => {
                      if (name === 'facturacion') return [formatCurrency(value), 'Facturación']
                      if (name === 'pauta') return [formatCurrency(value), 'Pauta']
                      if (name === 'agencia') return [formatCurrency(value), 'Agencia']
                      if (name === 'roas') return [`${value}x`, 'ROAS']
                      if (name === 'roasReal') return [`${value}x`, 'ROAS Real']
                      return [value, name]
                    }}
                  />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }}
                    formatter={(v: string) => ({ facturacion: 'Facturación', pauta: 'Pauta', agencia: 'Agencia', roas: 'ROAS', roasReal: 'ROAS Real' } as Record<string,string>)[v] || v} />
                  <Bar yAxisId="left" dataKey="facturacion" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.7} />
                  <Bar yAxisId="left" dataKey="pauta" stackId="pub" fill="#a855f7" />
                  <Bar yAxisId="left" dataKey="agencia" stackId="pub" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
                  <Line yAxisId="right" type="monotone" dataKey="roasReal" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={{ fill: '#ef4444' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Table */}
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
