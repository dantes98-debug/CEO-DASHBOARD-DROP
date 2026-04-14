'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'
import { LineChart as LineChartIcon, Plus, TrendingUp, TrendingDown, Megaphone, Target, DollarSign, BarChart2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, Legend, PieChart, Pie,
} from 'recharts'

interface Inversion {
  id: string
  nombre: string
  monto_inicial: number
  valor_actual: number
  fecha_inicio: string
  tipo: string | null
  notas: string | null
  rendimiento?: number
  created_at: string
}

interface GastoRaw {
  monto: number
  fecha: string
  categoria: string
  tipo: string | null
}

interface VentaRaw {
  monto_ars: number
  costo: number
  iva_monto: number
  fecha: string
  canal: string | null
}

const CATS_PAUTA = ['Meta Ads', 'Influencers']
const CATS_AGENCIA = ['Agencia', 'Diseño']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const COLORS_CAT = ['#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#64748b']

type Tab = 'inversiones' | 'marketing'

export default function InversionesPage() {
  const [tab, setTab] = useState<Tab>('inversiones')
  const [inversiones, setInversiones] = useState<Inversion[]>([])
  const [gastos, setGastos] = useState<GastoRaw[]>([])
  const [ventas, setVentas] = useState<VentaRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [form, setForm] = useState({
    nombre: '',
    monto_inicial: '',
    valor_actual: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    tipo: '',
    notas: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [invRes, gastosRes, ventasRes] = await Promise.all([
      supabase.from('inversiones').select('*').order('fecha_inicio', { ascending: false }),
      supabase.from('gastos').select('monto, fecha, categoria, tipo').eq('tipo', 'publicidad'),
      supabase.from('ventas').select('monto_ars, costo, iva_monto, fecha, canal'),
    ])
    const withRendimiento = (invRes.data || []).map((inv) => ({
      ...inv,
      rendimiento: ((Number(inv.valor_actual) - Number(inv.monto_inicial)) / Number(inv.monto_inicial)) * 100,
    }))
    setInversiones(withRendimiento)
    setGastos(gastosRes.data || [])
    setVentas(ventasRes.data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('inversiones').insert({
      nombre: form.nombre,
      monto_inicial: Number(form.monto_inicial),
      valor_actual: Number(form.valor_actual || form.monto_inicial),
      fecha_inicio: form.fecha_inicio,
      tipo: form.tipo || null,
      notas: form.notas || null,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ nombre: '', monto_inicial: '', valor_actual: '', fecha_inicio: new Date().toISOString().split('T')[0], tipo: '', notas: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta inversión?')) return
    const supabase = createClient()
    await supabase.from('inversiones').delete().eq('id', id)
    await fetchData()
  }

  // ── Inversiones metrics ──────────────────────────────────────
  const totalInvertido = inversiones.reduce((sum, i) => sum + Number(i.monto_inicial), 0)
  const valorActualTotal = inversiones.reduce((sum, i) => sum + Number(i.valor_actual), 0)
  const rendimientoTotal = totalInvertido > 0 ? ((valorActualTotal - totalInvertido) / totalInvertido) * 100 : 0

  const chartData = inversiones.map((inv) => ({
    nombre: inv.nombre.length > 14 ? inv.nombre.slice(0, 14) + '...' : inv.nombre,
    rendimiento: inv.rendimiento || 0,
  }))

  // ── Marketing metrics ────────────────────────────────────────
  const gastosYear = gastos.filter((g) => g.fecha.startsWith(String(year)))
  const ventasYear = ventas.filter((v) => v.fecha.startsWith(String(year)))
  const ventasMeta = ventasYear.filter((v) => v.canal === 'meta')

  const totalInvMkt = gastosYear.reduce((s, g) => s + Number(g.monto), 0)
  const totalPauta = gastosYear.filter((g) => CATS_PAUTA.includes(g.categoria)).reduce((s, g) => s + Number(g.monto), 0)
  const totalAgencia = gastosYear.filter((g) => CATS_AGENCIA.includes(g.categoria)).reduce((s, g) => s + Number(g.monto), 0)
  const facturacionMeta = ventasMeta.reduce((s, v) => s + Number(v.monto_ars), 0)
  const costoMeta = ventasMeta.reduce((s, v) => s + Number(v.costo) + Number(v.iva_monto), 0)
  const gananciaMetaNeta = facturacionMeta - costoMeta - totalInvMkt
  const roas = totalPauta > 0 ? facturacionMeta / totalPauta : 0
  const roasReal = (totalPauta + totalAgencia) > 0 ? facturacionMeta / (totalPauta + totalAgencia) : 0
  const roiMkt = totalInvMkt > 0 ? (gananciaMetaNeta / totalInvMkt) * 100 : 0
  const pctSobreFact = facturacionMeta > 0 ? (totalInvMkt / facturacionMeta) * 100 : 0

  // Monthly breakdown
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    const prefix = `${year}-${m}`
    const inv = gastosYear.filter((g) => g.fecha.startsWith(prefix)).reduce((s, g) => s + Number(g.monto), 0)
    const pauta = gastosYear.filter((g) => g.fecha.startsWith(prefix) && CATS_PAUTA.includes(g.categoria)).reduce((s, g) => s + Number(g.monto), 0)
    const agencia = gastosYear.filter((g) => g.fecha.startsWith(prefix) && CATS_AGENCIA.includes(g.categoria)).reduce((s, g) => s + Number(g.monto), 0)
    const fact = ventasMeta.filter((v) => v.fecha.startsWith(prefix)).reduce((s, v) => s + Number(v.monto_ars), 0)
    const roasMes = pauta > 0 ? fact / pauta : 0
    return { mes: MESES[i], pauta, agencia, facturacion: fact, roas: roasMes, total: inv }
  }).filter((d) => d.total > 0 || d.facturacion > 0)

  // Category breakdown
  const allCats = Array.from(new Set(gastosYear.map((g) => g.categoria)))
  const catBreakdown = allCats.map((cat) => {
    const spend = gastosYear.filter((g) => g.categoria === cat).reduce((s, g) => s + Number(g.monto), 0)
    return { categoria: cat, spend }
  }).sort((a, b) => b.spend - a.spend)

  const pieData = catBreakdown.map((c) => ({ name: c.categoria, value: c.spend }))

  // Available years
  const allYears = Array.from(new Set([
    ...gastos.map((g) => parseInt(g.fecha.slice(0, 4))),
    ...ventas.map((v) => parseInt(v.fecha.slice(0, 4))),
  ])).sort((a, b) => b - a)
  if (!allYears.includes(new Date().getFullYear())) allYears.unshift(new Date().getFullYear())

  const columns = [
    { key: 'nombre', label: 'Nombre' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'fecha_inicio',
      label: 'Inicio',
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: 'monto_inicial',
      label: 'Invertido',
      render: (v: unknown) => formatCurrency(Number(v)),
    },
    {
      key: 'valor_actual',
      label: 'Valor actual',
      render: (v: unknown) => (
        <span className="font-semibold text-green-400">{formatCurrency(Number(v))}</span>
      ),
    },
    {
      key: 'rendimiento',
      label: 'Rendimiento',
      render: (v: unknown) => {
        const val = Number(v)
        return (
          <span className={`flex items-center gap-1 font-semibold text-sm ${val >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {val >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {val >= 0 ? '+' : ''}{formatPercent(val)}
          </span>
        )
      },
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Inversion) => (
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  const roasBadge = (val: number) => {
    const color = val >= 3 ? 'text-green-400 bg-green-400/10' : val >= 1.5 ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'
    return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{val > 0 ? `${val.toFixed(2)}x` : '—'}</span>
  }

  return (
    <div>
      <PageHeader
        title="Inversiones"
        description="Portfolio de inversiones y retorno de marketing"
        icon={LineChartIcon}
        action={
          tab === 'inversiones' ? (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva inversión
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-background border border-border rounded-xl p-1 mb-8 w-fit">
        {([['inversiones', LineChartIcon, 'Inversiones'], ['marketing', Megaphone, 'Marketing']] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── INVERSIONES TAB ── */}
      {tab === 'inversiones' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <MetricCard title="Total invertido" value={formatCurrency(totalInvertido)} icon={LineChartIcon} color="blue" loading={loading} />
            <MetricCard title="Valor actual" value={formatCurrency(valorActualTotal)} icon={LineChartIcon} color="green" loading={loading} />
            <MetricCard
              title="Rendimiento total"
              value={(rendimientoTotal >= 0 ? '+' : '') + formatPercent(rendimientoTotal)}
              icon={rendimientoTotal >= 0 ? TrendingUp : TrendingDown}
              color={rendimientoTotal >= 0 ? 'green' : 'red'}
              loading={loading}
            />
          </div>

          {chartData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6 mb-8">
              <h3 className="text-base font-semibold text-text-primary mb-6">Rendimiento por inversión</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="nombre" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Rendimiento']}
                  />
                  <Bar dataKey="rendimiento" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.rendimiento >= 0 ? '#22c55e' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTable
            columns={columns as never}
            data={inversiones as never}
            loading={loading}
            emptyMessage="No hay inversiones registradas"
          />
        </>
      )}

      {/* ── MARKETING TAB ── */}
      {tab === 'marketing' && (
        <>
          {/* Year selector */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-muted">Año:</span>
            <div className="flex gap-1">
              {allYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${year === y ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard title="Inversión total" value={formatCurrency(totalInvMkt)} icon={DollarSign} color="blue" loading={loading} />
            <MetricCard title="Facturación Meta" value={formatCurrency(facturacionMeta)} icon={TrendingUp} color="green" loading={loading} />
            <MetricCard
              title="ROAS (Pauta)"
              value={roas > 0 ? `${roas.toFixed(2)}x` : '—'}
              icon={Target}
              color={roas >= 3 ? 'green' : roas >= 1.5 ? 'yellow' : 'red'}
              loading={loading}
            />
            <MetricCard
              title="ROI neto"
              value={roiMkt !== 0 ? (roiMkt >= 0 ? '+' : '') + formatPercent(roiMkt) : '—'}
              icon={roiMkt >= 0 ? TrendingUp : TrendingDown}
              color={roiMkt >= 0 ? 'green' : 'red'}
              loading={loading}
            />
          </div>

          {/* Secondary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Pauta pura', value: formatCurrency(totalPauta), sub: 'Meta Ads + Influencers' },
              { label: 'Agencia/Diseño', value: formatCurrency(totalAgencia), sub: 'Fees de gestión' },
              { label: 'ROAS Real', value: roasReal > 0 ? `${roasReal.toFixed(2)}x` : '—', sub: 'Sobre pauta + agencia', badge: roasReal },
              { label: '% mkt / facturación', value: pctSobreFact > 0 ? formatPercent(pctSobreFact) : '—', sub: 'Del canal Meta' },
            ].map((card) => (
              <div key={card.label} className="bg-card rounded-xl border border-border p-4">
                <p className="text-xs text-muted mb-1">{card.label}</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-text-primary">{card.value}</p>
                  {card.badge !== undefined && roasBadge(card.badge)}
                </div>
                <p className="text-xs text-muted mt-0.5">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          {monthlyData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Monthly spend vs revenue */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-base font-semibold text-text-primary mb-6">Inversión vs Facturación Meta — por mes</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={monthlyData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}x`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = { pauta: 'Pauta', agencia: 'Agencia', facturacion: 'Facturación Meta', roas: 'ROAS' }
                        return [name === 'roas' ? `${value.toFixed(2)}x` : formatCurrency(value), labels[name] || name]
                      }}
                    />
                    <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '11px' }} formatter={(v: string) => ({ pauta: 'Pauta', agencia: 'Agencia/Diseño', facturacion: 'Facturación Meta', roas: 'ROAS' }[v] || v)} />
                    <Bar yAxisId="left" dataKey="pauta" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                    <Bar yAxisId="left" dataKey="agencia" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="left" type="monotone" dataKey="facturacion" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Category pie */}
              {pieData.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-base font-semibold text-text-primary mb-6">Distribución por categoría</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS_CAT[i % COLORS_CAT.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        formatter={(value: number) => [formatCurrency(value), 'Inversión']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Category table */}
          {catBreakdown.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6 mb-8">
              <h3 className="text-base font-semibold text-text-primary mb-4">Detalle por categoría</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-muted font-medium">Categoría</th>
                      <th className="text-right py-3 px-2 text-muted font-medium">Invertido</th>
                      <th className="text-right py-3 px-2 text-muted font-medium">% del total</th>
                      <th className="text-right py-3 px-2 text-muted font-medium">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catBreakdown.map((cat, i) => (
                      <tr key={cat.categoria} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                        <td className="py-3 px-2 font-medium text-text-primary flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS_CAT[i % COLORS_CAT.length] }} />
                          {cat.categoria}
                        </td>
                        <td className="py-3 px-2 text-right font-semibold">{formatCurrency(cat.spend)}</td>
                        <td className="py-3 px-2 text-right text-muted">{totalInvMkt > 0 ? formatPercent((cat.spend / totalInvMkt) * 100) : '—'}</td>
                        <td className="py-3 px-2 text-right">
                          {CATS_PAUTA.includes(cat.categoria) ? (
                            <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full">Pauta</span>
                          ) : CATS_AGENCIA.includes(cat.categoria) ? (
                            <span className="text-xs bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">Agencia</span>
                          ) : (
                            <span className="text-xs bg-card-hover text-muted px-2 py-0.5 rounded-full">Otro</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border">
                      <td className="py-3 px-2 font-bold text-text-primary">Total</td>
                      <td className="py-3 px-2 text-right font-bold text-text-primary">{formatCurrency(totalInvMkt)}</td>
                      <td className="py-3 px-2 text-right text-muted">100%</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totalInvMkt === 0 && !loading && (
            <div className="bg-card rounded-xl border border-border p-12 text-center">
              <BarChart2 className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-text-secondary font-medium mb-1">Sin datos de marketing para {year}</p>
              <p className="text-sm text-muted">Cargá gastos de tipo Publicidad en la sección Gastos para ver métricas aquí.</p>
            </div>
          )}
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva inversión">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre</label>
            <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Plazo fijo BNA, Crypto, Inmueble" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
            <input type="text" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Ej: Renta fija, Variable, Inmueble" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de inicio</label>
            <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto invertido</label>
              <input type="number" min="0" step="0.01" value={form.monto_inicial} onChange={(e) => setForm({ ...form, monto_inicial: e.target.value })} placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Valor actual</label>
              <input type="number" min="0" step="0.01" value={form.valor_actual} onChange={(e) => setForm({ ...form, valor_actual: e.target.value })} placeholder={form.monto_inicial || '0.00'} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas</label>
            <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas adicionales..." rows={2} />
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
