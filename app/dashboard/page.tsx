'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency, getMonthName } from '@/lib/utils'
import { TrendingUp, Receipt, ChevronLeft, ChevronRight, Plus, X, ExternalLink, RefreshCw } from 'lucide-react'
import MonthPicker from '@/components/MonthPicker'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface VentaRaw { fecha: string; monto: number; moneda: string; tipo_cambio: number; monto_ars: number; costo: number; iva_monto: number; subtotal: number; items: { precio_unitario: number; cantidad: number }[] | null }
interface GastoRaw  { fecha: string; monto: number; tipo: string }

interface MesData {
  label: string       // "Ene 2025"
  ym: string          // "2025-01"
  facturacion: number
  costos: number
  gastos: number
  iva: number
  ganancia: number
  margen: number      // ganancia / facturacion * 100
  gastos_fijos: number
  gastos_variables: number
  gastos_sueldos: number
  gastos_publicidad: number
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function calcMes(ventas: VentaRaw[], gastos: GastoRaw[], ym: string): MesData {
  const [y, m] = ym.split('-')
  const s = `${ym}-01`, e = `${ym}-31`
  const v = ventas.filter(x => x.fecha >= s && x.fecha <= e)
  const g = gastos.filter(x => x.fecha >= s && x.fecha <= e)

  const facturacion = v.reduce((a, x) => a + Number(x.monto_ars), 0)
  const costos      = v.reduce((a, x) => a + Number(x.costo || 0), 0)
  const iva         = v.reduce((a, x) => a + Number(x.iva_monto || 0), 0)
  const gastosTot   = g.reduce((a, x) => a + Number(x.monto), 0)
  const ganancia    = facturacion - costos - iva - gastosTot
  const margen      = facturacion > 0 ? ganancia / facturacion * 100 : 0

  const byTipo = (t: string) => g.filter(x => x.tipo === t).reduce((a, x) => a + Number(x.monto), 0)

  return {
    label: `${MESES[parseInt(m) - 1]} ${y}`,
    ym,
    facturacion, costos, gastos: gastosTot, iva, ganancia, margen,
    gastos_fijos: byTipo('fijo'),
    gastos_variables: byTipo('variable'),
    gastos_sueldos: byTipo('sueldo'),
    gastos_publicidad: byTipo('publicidad'),
  }
}

function calcAnio(ventas: VentaRaw[], gastos: GastoRaw[], year: number): MesData {
  const v = ventas.filter(x => x.fecha.startsWith(String(year)))
  const g = gastos.filter(x => x.fecha.startsWith(String(year)))
  const facturacion = v.reduce((a, x) => a + Number(x.monto_ars), 0)
  const costos      = v.reduce((a, x) => a + Number(x.costo || 0), 0)
  const iva         = v.reduce((a, x) => a + Number(x.iva_monto || 0), 0)
  const gastosTot   = g.reduce((a, x) => a + Number(x.monto), 0)
  const ganancia    = facturacion - costos - iva - gastosTot
  const margen      = facturacion > 0 ? ganancia / facturacion * 100 : 0
  const byTipo = (t: string) => g.filter(x => x.tipo === t).reduce((a, x) => a + Number(x.monto), 0)
  return {
    label: String(year), ym: String(year),
    facturacion, costos, gastos: gastosTot, iva, ganancia, margen,
    gastos_fijos: byTipo('fijo'), gastos_variables: byTipo('variable'),
    gastos_sueldos: byTipo('sueldo'), gastos_publicidad: byTipo('publicidad'),
  }
}

function MetricBox({ label, value, sub, color = 'default' }: { label: string; value: string; sub?: string; color?: 'green' | 'red' | 'blue' | 'yellow' | 'default' }) {
  const colors = { green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', yellow: 'text-yellow-400', default: 'text-text-primary' }
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-lg font-bold ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

const fmtK = (v: number) => v === 0 ? '$0' : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${Math.round(v).toLocaleString('es-AR')}`

function MesGrid({ d }: { d: MesData }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MetricBox label="Facturación" value={formatCurrency(d.facturacion)} color="blue"
        sub={d.costos > 0 ? `Costo prod: ${fmtK(d.costos)}` : undefined} />
      <MetricBox label="Gastos totales" value={formatCurrency(d.gastos)} color="red"
        sub={`Fij ${fmtK(d.gastos_fijos)} · Sue ${fmtK(d.gastos_sueldos)} · Var ${fmtK(d.gastos_variables)} · Pub ${fmtK(d.gastos_publicidad)}`} />
      <MetricBox label="Ganancia neta" value={formatCurrency(d.ganancia)} color={d.ganancia >= 0 ? 'green' : 'red'}
        sub={d.iva > 0 ? `IVA: ${fmtK(d.iva)}` : undefined} />
      <MetricBox label="Margen" value={`${d.margen.toFixed(1)}%`} color={d.margen >= 20 ? 'green' : d.margen >= 0 ? 'yellow' : 'red'}
        sub={`Fact ${fmtK(d.facturacion)} − Costos ${fmtK(d.costos + d.iva + d.gastos)}`} />
    </div>
  )
}

function getPadMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMesAnterior(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function getMismoMesAnioPasado(ym: string): string {
  const [y, mes] = ym.split('-')
  return `${Number(y) - 1}-${mes}`
}
function getEneroDelAnio(ym: string): string {
  return `${ym.split('-')[0]}-01`
}
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return getPadMonth(d)
}

function parseN(s: string | number): number {
  const str = String(s ?? '').trim()
  if (!str) return 0
  if (str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(str) || 0
}

export default function DashboardPage() {
  const [ventas, setVentas] = useState<VentaRaw[]>([])
  const [gastos, setGastos] = useState<GastoRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [tc, setTc] = useState(1000)
  const [tcInput, setTcInput] = useState('')
  const [tcSaving, setTcSaving] = useState(false)

  const hoy = new Date()
  const [mesFiltro, setMesFiltro] = useState(getPadMonth(hoy))
  const anioFiltro = hoy.getFullYear()

  // Comparación de meses
  const [compMeses, setCompMeses] = useState<string[]>([])
  const [compInput, setCompInput] = useState(getPadMonth(hoy))

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('ventas').select('fecha, monto, moneda, tipo_cambio, monto_ars, costo, iva_monto, subtotal, items'),
      supabase.from('gastos').select('fecha, monto, tipo'),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
    ]).then(([v, g, tcRes]) => {
      const ventasCalc = (v.data || []).map((row) => {
        let montoArs = row.moneda === 'usd'
          ? Number(row.monto) * Number(row.tipo_cambio || 1000)
          : Number(row.monto)
        if (montoArs === 0 && Array.isArray(row.items) && row.items.length > 0) {
          montoArs = row.items.reduce((s: number, item: { precio_unitario: number; cantidad: number }) => s + item.precio_unitario * item.cantidad, 0)
        }
        return { ...row, monto_ars: montoArs } as VentaRaw
      })
      setVentas(ventasCalc)
      setGastos((g.data || []) as GastoRaw[])
      const savedTc = Number(tcRes.data?.valor || 1000)
      setTc(savedTc)
      setTcInput(String(savedTc))
      setLoading(false)
    })
  }, [])

  const handleTcBlur = async () => {
    const newTc = parseN(tcInput)
    if (newTc <= 0 || newTc === tc) return
    setTcSaving(true)
    const supabase = createClient()
    await supabase.from('config').upsert({ clave: 'tipo_cambio', valor: String(newTc) }, { onConflict: 'clave' })
    setTc(newTc)
    setTcSaving(false)
  }

  const anual = calcAnio(ventas, gastos, anioFiltro)
  const mesActual = calcMes(ventas, gastos, mesFiltro)
  const mesAnterior = calcMes(ventas, gastos, addMonths(mesFiltro, -1))

  // Chart anual — barras por mes
  const chartAnual = Array.from({ length: 12 }, (_, i) => {
    const ym = `${anioFiltro}-${String(i + 1).padStart(2, '0')}`
    const d = calcMes(ventas, gastos, ym)
    return { mes: MESES[i], facturacion: d.facturacion, gastos: d.gastos, ganancia: d.ganancia }
  })

  // Delta vs mes anterior
  const delta = (curr: number, prev: number) => {
    if (prev === 0) return null
    const pct = (curr - prev) / Math.abs(prev) * 100
    return pct
  }
  const deltaFact = delta(mesActual.facturacion, mesAnterior.facturacion)
  const deltaGan  = delta(mesActual.ganancia, mesAnterior.ganancia)

  // Comparación meses
  const compData = compMeses.map(ym => calcMes(ventas, gastos, ym))
  const addComp = () => {
    if (!compMeses.includes(compInput) && compMeses.length < 4) {
      setCompMeses(prev => [...prev, compInput].sort())
    }
  }

  const [y, m] = mesFiltro.split('-').map(Number)
  const mesLabel = `${MESES[m - 1]} ${y}`

  if (loading) {
    return (
      <div className="p-8 text-center text-text-muted">Cargando...</div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Resumen general</h1>
          <p className="text-text-secondary mt-1">Panel ejecutivo</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* TC global — controla todo el dashboard */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <span className="text-xs text-text-muted whitespace-nowrap">TC USD→ARS:</span>
            <input
              type="text"
              inputMode="decimal"
              value={tcInput}
              onChange={e => setTcInput(e.target.value)}
              onBlur={handleTcBlur}
              onKeyDown={e => e.key === 'Enter' && (e.currentTarget.blur())}
              className="w-24 text-xs text-right bg-transparent border-none outline-none text-text-primary font-semibold p-0"
            />
            {tcSaving
              ? <RefreshCw className="w-3 h-3 text-muted animate-spin" />
              : <span className="text-[10px] text-green-400 font-medium">global</span>
            }
          </div>
          <a
            href="https://gmo.zomatik.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-border hover:bg-card-hover text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Sistema Motic
          </a>
        </div>
      </div>

      {/* ── SECCIÓN ANUAL ── */}
      <section>
        <h2 className="text-base font-semibold text-text-primary mb-4">Año {anioFiltro}</h2>
        <MesGrid d={anual} />

        {/* Desglose gastos anual */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <MetricBox label="Gastos fijos" value={formatCurrency(anual.gastos_fijos)} />
          <MetricBox label="Sueldos" value={formatCurrency(anual.gastos_sueldos)} />
          <MetricBox label="Variables" value={formatCurrency(anual.gastos_variables)} />
          <MetricBox label="Publicidad" value={formatCurrency(anual.gastos_publicidad)} />
        </div>

        {/* Gráfico anual */}
        <div className="bg-card rounded-xl border border-border p-6 mt-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Facturación · Gastos · Ganancia — {anioFiltro}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartAnual} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                formatter={(val: number, name: string) => [formatCurrency(val), name === 'facturacion' ? 'Facturación' : name === 'gastos' ? 'Gastos' : 'Ganancia']} />
              <Legend formatter={v => v === 'facturacion' ? 'Facturación' : v === 'gastos' ? 'Gastos' : 'Ganancia'} wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              <Bar dataKey="facturacion" fill="#3b82f6" radius={[4,4,0,0]} />
              <Bar dataKey="gastos" fill="#ef4444" radius={[4,4,0,0]} />
              <Bar dataKey="ganancia" fill="#22c55e" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── SECCIÓN MENSUAL ── */}
      <section>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-base font-semibold text-text-primary">Mes</h2>
          <button onClick={() => setMesFiltro(m => addMonths(m, -1))}
            className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors">
            <ChevronLeft className="w-4 h-4 text-text-secondary" />
          </button>
          <MonthPicker value={mesFiltro} onChange={setMesFiltro} />
          <button onClick={() => setMesFiltro(m => addMonths(m, 1))}
            className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors">
            <ChevronRight className="w-4 h-4 text-text-secondary" />
          </button>
          {mesFiltro !== getPadMonth(hoy) && (
            <button onClick={() => setMesFiltro(getPadMonth(hoy))} className="text-xs text-accent hover:underline">
              Ir al mes actual
            </button>
          )}
        </div>

        <MesGrid d={mesActual} />

        {/* Desglose gastos mes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <MetricBox label="Gastos fijos" value={formatCurrency(mesActual.gastos_fijos)} />
          <MetricBox label="Sueldos" value={formatCurrency(mesActual.gastos_sueldos)} />
          <MetricBox label="Variables" value={formatCurrency(mesActual.gastos_variables)} />
          <MetricBox label="Publicidad" value={formatCurrency(mesActual.gastos_publicidad)} />
        </div>

        {/* Delta vs mes anterior */}
        {mesAnterior.facturacion > 0 && (
          <div className="mt-3 flex gap-4 text-xs text-text-muted flex-wrap">
            <span>vs {mesAnterior.label}:{' '}
              {deltaFact !== null && (
                <span className={deltaFact >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                  {deltaFact >= 0 ? '▲' : '▼'} {Math.abs(deltaFact).toFixed(1)}% facturación
                </span>
              )}
              {deltaGan !== null && (
                <span className={`ml-3 ${deltaGan >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}`}>
                  {deltaGan >= 0 ? '▲' : '▼'} {Math.abs(deltaGan).toFixed(1)}% ganancia
                </span>
              )}
            </span>
          </div>
        )}
      </section>

      {/* ── COMPARACIÓN DE MESES ── */}
      <section>
        <h2 className="text-base font-semibold text-text-primary mb-4">Comparar meses</h2>

        {/* Chips rápidos */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {[
            { label: 'vs mes anterior', fn: getMesAnterior },
            { label: 'vs mismo mes año pasado', fn: getMismoMesAnioPasado },
            { label: 'vs inicio de año', fn: getEneroDelAnio },
          ].map(({ label, fn }) => {
            const ym = fn(mesFiltro)
            const active = compMeses.includes(ym)
            return (
              <button
                key={label}
                onClick={() => {
                  if (active) setCompMeses(prev => prev.filter(x => x !== ym))
                  else if (compMeses.length < 4) setCompMeses(prev => [...prev, ym].sort())
                }}
                className={`text-xs border rounded-full px-3 py-1 transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-secondary hover:bg-card-hover hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <input type="month" value={compInput} onChange={e => setCompInput(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-border bg-card text-text-primary focus:border-accent focus:outline-none" />
          <button onClick={addComp} disabled={compMeses.includes(compInput) || compMeses.length >= 4}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
          {compMeses.length > 0 && (
            <button onClick={() => setCompMeses([])} className="text-xs text-text-muted hover:text-red-400 transition-colors">
              Limpiar todo
            </button>
          )}
        </div>

        {/* Tags de meses seleccionados */}
        {compMeses.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {compMeses.map(ym => {
              const [cy, cm] = ym.split('-').map(Number)
              return (
                <span key={ym} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-medium">
                  {MESES[cm - 1]} {cy}
                  <button onClick={() => setCompMeses(prev => prev.filter(x => x !== ym))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        {compData.length > 0 ? (
          <>
            {/* Tabla comparativa */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card-hover">
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Métrica</th>
                    {compData.map(d => (
                      <th key={d.ym} className="text-right px-4 py-3 text-xs font-medium text-accent uppercase">{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Facturación', key: 'facturacion' as keyof MesData, fmt: formatCurrency },
                    { label: 'Costo productos', key: 'costos' as keyof MesData, fmt: formatCurrency },
                    { label: 'IVA', key: 'iva' as keyof MesData, fmt: formatCurrency },
                    { label: 'Gastos totales', key: 'gastos' as keyof MesData, fmt: formatCurrency },
                    { label: '— Fijos', key: 'gastos_fijos' as keyof MesData, fmt: formatCurrency },
                    { label: '— Sueldos', key: 'gastos_sueldos' as keyof MesData, fmt: formatCurrency },
                    { label: '— Variables', key: 'gastos_variables' as keyof MesData, fmt: formatCurrency },
                    { label: '— Publicidad', key: 'gastos_publicidad' as keyof MesData, fmt: formatCurrency },
                    { label: 'Ganancia neta', key: 'ganancia' as keyof MesData, fmt: formatCurrency },
                    { label: 'Margen %', key: 'margen' as keyof MesData, fmt: (v: number) => `${v.toFixed(1)}%` },
                  ].map(row => (
                    <tr key={row.key} className={`border-b border-border/50 ${row.label.startsWith('—') ? 'text-text-muted' : ''}`}>
                      <td className={`px-4 py-2.5 ${row.label.startsWith('—') ? 'pl-8 text-xs text-text-muted' : 'font-medium text-text-primary'}`}>
                        {row.label}
                      </td>
                      {compData.map(d => {
                        const val = d[row.key] as number
                        const isGanancia = row.key === 'ganancia'
                        const isMargen = row.key === 'margen'
                        const colorClass = (isGanancia || isMargen) ? (val >= 0 ? 'text-green-400' : 'text-red-400') : ''
                        // highlight max facturacion
                        const isMax = compData.length > 1 && row.key === 'facturacion' && val === Math.max(...compData.map(x => x[row.key] as number))
                        return (
                          <td key={d.ym} className={`px-4 py-2.5 text-right font-semibold ${colorClass} ${isMax ? 'text-blue-400' : ''}`}>
                            {row.fmt(val)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Gráfico comparativo */}
            {compData.length > 1 && (
              <div className="bg-card rounded-xl border border-border p-6 mt-4">
                <h3 className="text-sm font-semibold text-text-primary mb-4">Comparación visual</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name: 'Facturación', ...Object.fromEntries(compData.map(d => [d.label, d.facturacion])) },
                    { name: 'Gastos', ...Object.fromEntries(compData.map(d => [d.label, d.gastos])) },
                    { name: 'Ganancia', ...Object.fromEntries(compData.map(d => [d.label, d.ganancia])) },
                  ]} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(v: number) => [formatCurrency(v), '']} />
                    <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                    {compData.map((d, i) => (
                      <Bar key={d.ym} dataKey={d.label} fill={['#3b82f6','#22c55e','#f59e0b','#a855f7'][i]} radius={[4,4,0,0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-text-muted text-sm">
            Agregá meses para comparar — podés mezclar años distintos
          </div>
        )}
      </section>
    </div>
  )
}
