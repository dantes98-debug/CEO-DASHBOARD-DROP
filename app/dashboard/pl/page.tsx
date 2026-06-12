'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import Private from '@/components/Private'
import MonthPicker from '@/components/MonthPicker'
import { formatCurrency, MESES_CORTO } from '@/lib/utils'
import { FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Venta {
  fecha: string
  monto_ars: number
  iva_monto: number
  costo: number
}

interface Gasto {
  fecha: string
  tipo: 'fijo' | 'variable' | 'sueldo' | 'publicidad'
  monto: number
}

interface Comision {
  fecha: string
  monto: number
  pagada: boolean
}

function PLRow({
  label, value, pct, indent = 0, bold = false, highlight = false, separator = false, negative = false
}: {
  label: string; value: number; pct?: number; indent?: number
  bold?: boolean; highlight?: boolean; separator?: boolean; negative?: boolean
}) {
  if (separator) return <tr><td colSpan={4} className="py-0"><div className="border-t border-border my-1" /></td></tr>

  const color = highlight ? (value >= 0 ? 'text-green-400' : 'text-red-400') : 'text-text-primary'
  return (
    <tr className={`${bold ? 'font-semibold' : ''} hover:bg-card-hover/50 transition-colors`}>
      <td className="py-2 px-4 text-sm text-text-secondary" style={{ paddingLeft: `${16 + indent * 16}px` }}>
        {label}
      </td>
      <td className="py-2 px-4 text-sm text-right">
        <Private>
          <span className={`${color} ${bold ? 'font-bold' : ''}`}>
            {negative && value !== 0 ? '−' : ''}{formatCurrency(Math.abs(value))}
          </span>
        </Private>
      </td>
      <td className="py-2 px-4 text-sm text-right text-text-muted">
        {pct !== undefined ? `${pct.toFixed(1)}%` : ''}
      </td>
    </tr>
  )
}

export default function PLPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const hoy = new Date()
  const [ventas, setVentas]     = useState<Venta[]>([])
  const [gastos, setGastos]     = useState<Gasto[]>([])
  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [loading, setLoading]   = useState(true)
  const [vista, setVista]       = useState<'mes' | 'anio'>('mes')

  const [mesFiltro, setMesFiltro]   = useState(() => {
    const p = searchParams.get('mes')
    return p ? parseInt(p) : hoy.getMonth() + 1
  })
  const [anioFiltro, setAnioFiltro] = useState(() => {
    const p = searchParams.get('anio')
    return p ? parseInt(p) : hoy.getFullYear()
  })

  const mesValue = `${anioFiltro}-${String(mesFiltro).padStart(2, '0')}`

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const supabase = createClient()
      const [vRes, gRes, cRes] = await Promise.all([
        supabase.from('ventas').select('fecha, monto_ars, iva_monto, costo').neq('canal', 'ecommerce'),
        supabase.from('gastos').select('fecha, tipo, monto'),
        supabase.from('comisiones').select('fecha, monto, pagada').eq('pagada', true),
      ])
      setVentas((vRes.data || []) as Venta[])
      setGastos((gRes.data || []) as Gasto[])
      setComisiones((cRes.data || []) as Comision[])
      setLoading(false)
    }
    fetchAll()
  }, [])

  // ── Filtros de período ────────────────────────────────────────────────────
  const [pStart, pEnd] = useMemo(() => {
    if (vista === 'mes') {
      const s = `${anioFiltro}-${String(mesFiltro).padStart(2, '0')}-01`
      const e = new Date(anioFiltro, mesFiltro, 0).toISOString().split('T')[0]
      return [s, e]
    }
    return [`${anioFiltro}-01-01`, `${anioFiltro}-12-31`]
  }, [vista, anioFiltro, mesFiltro])

  const [pStartPrev, pEndPrev] = useMemo(() => {
    if (vista === 'mes') {
      const prevM = mesFiltro === 1 ? 12 : mesFiltro - 1
      const prevY = mesFiltro === 1 ? anioFiltro - 1 : anioFiltro
      const s = `${prevY}-${String(prevM).padStart(2, '0')}-01`
      const e = new Date(prevY, prevM, 0).toISOString().split('T')[0]
      return [s, e]
    }
    return [`${anioFiltro - 1}-01-01`, `${anioFiltro - 1}-12-31`]
  }, [vista, anioFiltro, mesFiltro])

  const calcPL = (vs: Venta[], gs: Gasto[], cs: Comision[], s: string, e: string) => {
    const vp = vs.filter(v => v.fecha >= s && v.fecha <= e)
    const gp = gs.filter(g => g.fecha >= s && g.fecha <= e)
    const cp = cs.filter(c => c.fecha >= s && c.fecha <= e)

    const facturacionBruta = vp.reduce((a, v) => a + v.monto_ars, 0)
    const ivaFacturado     = vp.reduce((a, v) => a + (v.iva_monto || 0), 0)
    const facturacionNeta  = facturacionBruta - ivaFacturado
    const costo            = vp.reduce((a, v) => a + (v.costo || 0), 0)
    const margenBruto      = facturacionNeta - costo

    const sueldos          = gp.filter(g => g.tipo === 'sueldo').reduce((a, g) => a + g.monto, 0)
    const fijos            = gp.filter(g => g.tipo === 'fijo').reduce((a, g) => a + g.monto, 0)
    const variables        = gp.filter(g => g.tipo === 'variable').reduce((a, g) => a + g.monto, 0)
    const publicidad       = gp.filter(g => g.tipo === 'publicidad').reduce((a, g) => a + g.monto, 0)
    const totalGastos      = sueldos + fijos + variables + publicidad
    const ebitda           = margenBruto - totalGastos
    const comisionesMonto  = cp.reduce((a, c) => a + c.monto, 0)
    const gananciaNeta     = ebitda - comisionesMonto

    return { facturacionBruta, ivaFacturado, facturacionNeta, costo, margenBruto, sueldos, fijos, variables, publicidad, totalGastos, ebitda, comisionesMonto, gananciaNeta }
  }

  const pl     = useMemo(() => calcPL(ventas, gastos, comisiones, pStart, pEnd),     [ventas, gastos, comisiones, pStart, pEnd])
  const plPrev = useMemo(() => calcPL(ventas, gastos, comisiones, pStartPrev, pEndPrev), [ventas, gastos, comisiones, pStartPrev, pEndPrev])

  const pct  = (val: number) => pl.facturacionBruta > 0 ? (val / pl.facturacionBruta) * 100 : 0
  const delta = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : 0

  // ── Gráfico 12 meses ─────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(anioFiltro, i, 1)
      const s = `${anioFiltro}-${String(i + 1).padStart(2, '0')}-01`
      const e = new Date(anioFiltro, i + 1, 0).toISOString().split('T')[0]
      const p = calcPL(ventas, gastos, comisiones, s, e)
      return {
        mes: MESES_CORTO[i],
        ganancia: Math.round(p.gananciaNeta),
        gastoTotal: Math.round(p.totalGastos + p.comisionesMonto + p.costo),
        facturacion: Math.round(p.facturacionNeta),
      }
    })
  }, [ventas, gastos, comisiones, anioFiltro])

  const periodoLabel = vista === 'mes' ? `${MESES_CORTO[mesFiltro - 1]} ${anioFiltro}` : String(anioFiltro)
  const prevLabel    = vista === 'mes'
    ? `${MESES_CORTO[(mesFiltro === 1 ? 12 : mesFiltro - 1) - 1]} ${mesFiltro === 1 ? anioFiltro - 1 : anioFiltro}`
    : String(anioFiltro - 1)

  return (
    <div>
      <PageHeader
        title="P&L"
        description="Estado de Resultados"
        icon={FileText}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              <button onClick={() => setVista('mes')} className={`px-3 py-1.5 transition-colors ${vista === 'mes' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}>Mes</button>
              <button onClick={() => setVista('anio')} className={`px-3 py-1.5 border-l border-border transition-colors ${vista === 'anio' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}>Año</button>
            </div>
            {vista === 'mes'
              ? <MonthPicker value={mesValue} onChange={v => { const [y, m] = v.split('-').map(Number); setAnioFiltro(y); setMesFiltro(m) }} />
              : (
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  {[anioFiltro - 1, anioFiltro].map((y, i) => (
                    <button key={y} onClick={() => setAnioFiltro(y)} className={`px-3 py-1.5 transition-colors ${anioFiltro === y ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'} ${i > 0 ? 'border-l border-border' : ''}`}>{y}</button>
                  ))}
                </div>
              )
            }
          </div>
        }
      />

      {/* KPIs top */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Facturación neta', curr: pl.facturacionNeta, prev: plPrev.facturacionNeta, color: 'blue' },
          { label: 'Margen bruto', curr: pl.margenBruto, prev: plPrev.margenBruto, color: 'cyan' },
          { label: 'EBITDA', curr: pl.ebitda, prev: plPrev.ebitda, color: 'yellow' },
          { label: 'Ganancia neta', curr: pl.gananciaNeta, prev: plPrev.gananciaNeta, color: pl.gananciaNeta >= 0 ? 'green' : 'red' },
        ].map(({ label, curr, prev }) => {
          const d = delta(curr, prev)
          return (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">{label}</p>
              <Private><p className="text-xl font-bold text-text-primary">{formatCurrency(curr)}</p></Private>
              {prev !== 0 && (
                <p className={`text-xs mt-1 flex items-center gap-0.5 ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {d >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {d >= 0 ? '+' : ''}{d.toFixed(1)}% vs {prevLabel}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Tabla P&L */}
      <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold text-text-secondary">Estado de Resultados — {periodoLabel}</p>
          <p className="text-xs text-text-muted">% sobre facturación bruta</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              <PLRow label="Facturación bruta"    value={pl.facturacionBruta}  pct={pct(pl.facturacionBruta)}  bold />
              <PLRow label="− IVA facturado"       value={pl.ivaFacturado}       pct={pct(pl.ivaFacturado)}       indent={1} negative />
              <PLRow label="= Facturación neta"   value={pl.facturacionNeta}   pct={pct(pl.facturacionNeta)}   bold highlight />
              <PLRow separator label="" value={0} />
              <PLRow label="− Costo mercadería"   value={pl.costo}             pct={pct(pl.costo)}             indent={1} negative />
              <PLRow label="= Margen bruto"       value={pl.margenBruto}       pct={pct(pl.margenBruto)}       bold highlight />
              <PLRow separator label="" value={0} />
              <PLRow label="− Sueldos"            value={pl.sueldos}           pct={pct(pl.sueldos)}           indent={1} negative />
              <PLRow label="− Gastos fijos"       value={pl.fijos}             pct={pct(pl.fijos)}             indent={1} negative />
              <PLRow label="− Gastos variables"   value={pl.variables}         pct={pct(pl.variables)}         indent={1} negative />
              <PLRow label="− Publicidad / Ads"   value={pl.publicidad}        pct={pct(pl.publicidad)}        indent={1} negative />
              <PLRow label="= EBITDA"             value={pl.ebitda}            pct={pct(pl.ebitda)}            bold highlight />
              <PLRow separator label="" value={0} />
              <PLRow label="− Comisiones estudios" value={pl.comisionesMonto}  pct={pct(pl.comisionesMonto)}   indent={1} negative />
              <PLRow label="= Ganancia neta"      value={pl.gananciaNeta}      pct={pct(pl.gananciaNeta)}      bold highlight />
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráfico barras apiladas 12 meses */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-text-secondary mb-4">Facturación vs Costos vs Ganancia — {anioFiltro}</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip
              formatter={(v: number, name: string) => [formatCurrency(v), name === 'facturacion' ? 'Fact. neta' : name === 'gastoTotal' ? 'Costos+Gastos' : 'Ganancia']}
              contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}
            />
            <Legend formatter={v => v === 'facturacion' ? 'Fact. neta' : v === 'gastoTotal' ? 'Costos+Gastos' : 'Ganancia'} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="facturacion" fill="var(--color-accent)" radius={[2, 2, 0, 0]} name="facturacion" />
            <Bar dataKey="gastoTotal"  fill="#f59e0b"              radius={[2, 2, 0, 0]} name="gastoTotal" />
            <Bar dataKey="ganancia"    fill="#22c55e"              radius={[2, 2, 0, 0]} name="ganancia" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla anual comparativa 12 meses */}
      {vista === 'anio' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text-secondary">Desglose mensual — {anioFiltro}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-4 text-text-muted font-medium">Línea</th>
                  {MESES_CORTO.map(m => <th key={m} className="text-right py-2 px-3 text-text-muted font-medium">{m}</th>)}
                  <th className="text-right py-2 px-4 text-text-muted font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(['facturacionNeta', 'margenBruto', 'ebitda', 'gananciaNeta'] as const).map(key => {
                  const labels: Record<string, string> = {
                    facturacionNeta: 'Fact. neta', margenBruto: 'Margen bruto',
                    ebitda: 'EBITDA', gananciaNeta: 'Ganancia neta',
                  }
                  const monthly = Array.from({ length: 12 }, (_, i) => {
                    const s = `${anioFiltro}-${String(i + 1).padStart(2, '0')}-01`
                    const e = new Date(anioFiltro, i + 1, 0).toISOString().split('T')[0]
                    return calcPL(ventas, gastos, comisiones, s, e)[key]
                  })
                  const total = monthly.reduce((a, v) => a + v, 0)
                  return (
                    <tr key={key} className="border-b border-border/50 hover:bg-card-hover">
                      <td className="py-2 px-4 font-medium text-text-secondary">{labels[key]}</td>
                      {monthly.map((v, i) => (
                        <td key={i} className={`py-2 px-3 text-right font-mono ${v < 0 ? 'text-red-400' : 'text-text-primary'}`}>
                          <Private>{v !== 0 ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : formatCurrency(v)) : '—'}</Private>
                        </td>
                      ))}
                      <td className={`py-2 px-4 text-right font-bold ${total < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        <Private>{formatCurrency(total)}</Private>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
