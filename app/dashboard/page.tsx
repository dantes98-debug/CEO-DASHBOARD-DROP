'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency, getMonthName } from '@/lib/utils'
import { TrendingUp, Receipt, ChevronLeft, ChevronRight, Plus, X, ExternalLink, RefreshCw, Wifi, StickyNote, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import MonthPicker from '@/components/MonthPicker'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface VentaRaw { fecha: string; monto: number; moneda: string; tipo_cambio: number; monto_ars: number; costo: number; iva_monto: number; subtotal: number; items: { precio_unitario: number; cantidad: number }[] | null }
interface GastoRaw  { fecha: string; monto: number; tipo: string }
interface KpiObjetivo { tipo: string; anio: number; mes: number; objetivo: number; actual: number }

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

const KPI_META: Record<string, { label: string; esMonto: boolean }> = {
  ventas:   { label: 'Ventas del mes',     esMonto: true  },
  estudios: { label: 'Contacto estudios',  esMonto: false },
  whatsapp: { label: 'Contactos WhatsApp', esMonto: false },
  showroom: { label: 'Visitas showroom',   esMonto: false },
}

function SemaforoKPI({ objetivos, ventasActual, showroomActual }: {
  objetivos: KpiObjetivo[]
  ventasActual: number
  showroomActual: number
}) {
  const tipos = ['ventas', 'estudios', 'whatsapp', 'showroom'] as const
  const cards = tipos.map(tipo => {
    const obj = objetivos.find(o => o.tipo === tipo)
    if (!obj || obj.objetivo === 0) return null
    const actual = tipo === 'ventas' ? ventasActual : tipo === 'showroom' ? showroomActual : obj.actual
    const pct = Math.min((actual / obj.objetivo) * 100, 100)
    const estado = pct >= 75 ? 'green' : pct >= 40 ? 'yellow' : 'red'
    const C = {
      green:  { dot: 'bg-green-400',  bar: 'bg-green-400',  text: 'text-green-400',  border: 'border-green-500/20',  bg: 'bg-green-500/5'  },
      yellow: { dot: 'bg-yellow-400', bar: 'bg-yellow-400', text: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-500/5' },
      red:    { dot: 'bg-red-400',    bar: 'bg-red-400',    text: 'text-red-400',    border: 'border-red-500/20',    bg: 'bg-red-500/5'    },
    }[estado]
    const cfg = KPI_META[tipo]
    return (
      <div key={tipo} className={`rounded-xl border p-4 ${C.border} ${C.bg}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted font-medium">{cfg.label}</span>
          <span className={`w-2.5 h-2.5 rounded-full ${C.dot}`} />
        </div>
        <p className={`text-lg font-bold ${C.text}`}>
          {cfg.esMonto ? formatCurrency(actual) : actual}
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          de {cfg.esMonto ? formatCurrency(obj.objetivo) : obj.objetivo}
        </p>
        <div className="mt-2 h-1.5 bg-card rounded-full overflow-hidden">
          <div className={`h-full ${C.bar} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <p className={`text-xs font-semibold mt-1 ${C.text}`}>{pct.toFixed(0)}%</p>
      </div>
    )
  }).filter(Boolean)

  if (cards.length === 0) return null
  return <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{cards}</div>
}

export default function DashboardPage() {
  const [ventas, setVentas] = useState<VentaRaw[]>([])
  const [gastos, setGastos] = useState<GastoRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [objetivos, setObjetivos] = useState<KpiObjetivo[]>([])
  const [reunionesKpi, setReunionesKpi] = useState<{ fecha: string }[]>([])
  const [tc, setTc] = useState(1000)
  const [tcInput, setTcInput] = useState('')
  const [tcSaving, setTcSaving] = useState(false)
  const [tcFetching, setTcFetching] = useState(false)
  const [tcOnline, setTcOnline] = useState<{ oficial: number; blue: number } | null>(null)
  const [nota, setNota] = useState('')
  const [notaSaving, setNotaSaving] = useState(false)
  const [tcImpactoInput, setTcImpactoInput] = useState('')

  const hoy = new Date()
  const [mesFiltro, setMesFiltro] = useState(getPadMonth(hoy))
  const anioFiltro = hoy.getFullYear()

  // Comparación de meses
  const [compMeses, setCompMeses] = useState<string[]>([])
  const [compInput, setCompInput] = useState(getPadMonth(hoy))

  useEffect(() => {
    const supabase = createClient()
    const mesHoy = hoy.getMonth() + 1
    const anioHoy = hoy.getFullYear()
    const notaClave = `nota_${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
    Promise.all([
      supabase.from('ventas').select('fecha, monto, moneda, tipo_cambio, monto_ars, costo, iva_monto, subtotal, items'),
      supabase.from('gastos').select('fecha, monto, tipo'),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
      supabase.from('kpi_objetivos').select('tipo, anio, mes, objetivo, actual').eq('anio', anioHoy).eq('mes', mesHoy),
      supabase.from('reuniones').select('fecha').eq('cancelada', false),
      supabase.from('config').select('valor').eq('clave', notaClave).single(),
    ]).then(([v, g, tcRes, objRes, reunRes, notaRes]) => {
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
      setObjetivos(objRes.data || [])
      setReunionesKpi(reunRes.data || [])
      setNota(notaRes.data?.valor || '')
      setLoading(false)
    })
  }, [])

  const fetchTcOnline = async () => {
    setTcFetching(true)
    setTcOnline(null)
    try {
      const res = await fetch('https://api.bluelytics.com.ar/v2/latest')
      const data = await res.json()
      setTcOnline({
        oficial: Math.round(data.oficial?.value_sell ?? 0),
        blue: Math.round(data.blue?.value_sell ?? 0),
      })
    } catch {
      toast.error('No se pudo obtener el TC online')
    }
    setTcFetching(false)
  }

  const applyTcOnline = async (val: number) => {
    setTcInput(String(val))
    setTc(val)
    setTcOnline(null)
    const supabase = createClient()
    await supabase.from('config').upsert({ clave: 'tipo_cambio', valor: String(val) }, { onConflict: 'clave' })
  }

  const handleNotaBlur = async () => {
    const clave = `nota_${mesFiltro}`
    setNotaSaving(true)
    const supabase = createClient()
    await supabase.from('config').upsert({ clave, valor: nota }, { onConflict: 'clave' })
    setNotaSaving(false)
  }

  const handleTcBlur = async () => {
    const newTc = parseN(tcInput)
    if (newTc <= 0 || newTc === tc) return
    setTcSaving(true)
    const supabase = createClient()
    await supabase.from('config').upsert({ clave: 'tipo_cambio', valor: String(newTc) }, { onConflict: 'clave' })
    setTc(newTc)
    setTcSaving(false)
  }

  useEffect(() => {
    if (loading) return
    const supabase = createClient()
    supabase.from('config').select('valor').eq('clave', `nota_${mesFiltro}`).single()
      .then(({ data }) => setNota(data?.valor || ''))
  }, [mesFiltro])

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

  const isCurrentMonth = mesFiltro === getPadMonth(hoy)
  const diaActual = hoy.getDate()
  const diasDelMes = new Date(y, m, 0).getDate()
  const ritmoDiario = isCurrentMonth && diaActual > 0 ? mesActual.facturacion / diaActual : 0
  const proyeccionMes = Math.round(ritmoDiario * diasDelMes)

  const mesKeyHoy = `${hoy.getFullYear()}-${hoy.getMonth() + 1}`
  const showroomActual = reunionesKpi.filter(r => {
    const d = new Date(r.fecha + 'T12:00:00')
    return `${d.getFullYear()}-${d.getMonth() + 1}` === mesKeyHoy
  }).length
  const objVentas = objetivos.find(o => o.tipo === 'ventas')

  const tcImpacto = Number(tcImpactoInput) || 0
  const ventasMesAlt = tcImpacto > 0
    ? ventas
        .filter(v => {
          const s = `${mesFiltro}-01`
          const e2 = `${mesFiltro}-31`
          return v.fecha >= s && v.fecha <= e2
        })
        .reduce((s, v) => {
          const montoAlt = v.moneda === 'usd' ? Number(v.monto) * tcImpacto : Number(v.monto_ars)
          const costoAlt = Number(v.costo || 0)
          return s + montoAlt - costoAlt - Number(v.iva_monto || 0)
        }, 0)
    : null

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
          <div className="relative">
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
              <button
                onClick={fetchTcOnline}
                disabled={tcFetching}
                title="Obtener TC online (Bluelytics)"
                className="ml-1 p-0.5 rounded text-text-muted hover:text-accent transition-colors disabled:opacity-40"
              >
                <Wifi className={`w-3.5 h-3.5 ${tcFetching ? 'animate-pulse' : ''}`} />
              </button>
            </div>
            {tcOnline && (
              <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden min-w-48">
                <p className="text-[10px] text-text-muted px-3 pt-2 pb-1 font-medium uppercase tracking-wide">Seleccioná el TC</p>
                {[
                  { label: 'Oficial', value: tcOnline.oficial },
                  { label: 'Blue', value: tcOnline.blue },
                ].map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => applyTcOnline(value)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-card-hover transition-colors text-sm border-t border-border/50"
                  >
                    <span className="text-text-secondary font-medium">{label}</span>
                    <span className="text-text-primary font-bold">${value.toLocaleString('es-AR')}</span>
                  </button>
                ))}
                <button onClick={() => setTcOnline(null)} className="w-full text-xs text-text-muted hover:text-text-primary px-3 py-2 border-t border-border/50 text-center transition-colors">
                  Cerrar
                </button>
              </div>
            )}
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

      {/* ── SEMÁFORO KPIs ── */}
      {objetivos.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">KPIs — {MESES[hoy.getMonth()]} {hoy.getFullYear()}</h2>
            <a href="/dashboard/objetivos" className="text-xs text-accent hover:underline">Editar objetivos →</a>
          </div>
          <SemaforoKPI objetivos={objetivos} ventasActual={mesActual.facturacion} showroomActual={showroomActual} />

          {isCurrentMonth && proyeccionMes > 0 && (
            <div className="mt-3 bg-card rounded-xl border border-border px-4 py-3 flex items-center gap-3 flex-wrap">
              <TrendingUp className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-text-primary">
                  Proyección mes: {formatCurrency(proyeccionMes)}
                </span>
                <span className="text-xs text-text-muted ml-2">
                  Día {diaActual} de {diasDelMes} · Ritmo: {formatCurrency(Math.round(ritmoDiario))}/día
                </span>
              </div>
              {objVentas && objVentas.objetivo > 0 && (
                <span className={`text-xs font-medium flex-shrink-0 ${proyeccionMes >= objVentas.objetivo ? 'text-green-400' : 'text-yellow-400'}`}>
                  {proyeccionMes >= objVentas.objetivo
                    ? `✓ En camino al objetivo de ${formatCurrency(objVentas.objetivo)}`
                    : `Falta ${formatCurrency(objVentas.objetivo - mesActual.facturacion)} para el objetivo`}
                </span>
              )}
            </div>
          )}
        </section>
      )}

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

        {/* Nota del período */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-1.5">
            <StickyNote className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted font-medium">Nota de {mesLabel}</span>
            {notaSaving && <span className="text-[10px] text-text-muted animate-pulse">guardando…</span>}
          </div>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            onBlur={handleNotaBlur}
            placeholder="Anotá observaciones, contexto o decisiones de este mes..."
            rows={2}
            className="w-full px-3 py-2 text-xs bg-card border border-border rounded-lg text-text-secondary placeholder:text-text-muted focus:border-accent focus:outline-none resize-none"
          />
        </div>

        {/* TC Impacto widget */}
        <div className="mt-4 bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">¿Y si el TC fuese…?</span>
            <span className="text-xs text-text-muted">Simulá el impacto en la ganancia del mes</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-card-hover border border-border rounded-lg px-3 py-2">
              <span className="text-xs text-text-muted">TC hipotético:</span>
              <span className="text-xs text-text-muted">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={tcImpactoInput}
                onChange={e => setTcImpactoInput(e.target.value)}
                placeholder={String(tc)}
                className="w-20 text-xs bg-transparent border-none outline-none text-text-primary font-semibold p-0"
              />
            </div>
            {ventasMesAlt !== null && (
              <>
                <div className="text-xs text-text-muted">→</div>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-[10px] text-text-muted">Ganancia actual</p>
                    <p className={`text-sm font-bold ${mesActual.ganancia >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(mesActual.ganancia)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted">Con TC ${Number(tcImpactoInput).toLocaleString('es-AR')}</p>
                    <p className={`text-sm font-bold ${ventasMesAlt >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>{formatCurrency(ventasMesAlt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted">Diferencia</p>
                    <p className={`text-sm font-bold ${ventasMesAlt - mesActual.ganancia >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ventasMesAlt - mesActual.ganancia >= 0 ? '+' : ''}{formatCurrency(ventasMesAlt - mesActual.ganancia)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
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
