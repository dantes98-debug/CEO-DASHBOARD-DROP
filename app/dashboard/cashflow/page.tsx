'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import Private from '@/components/Private'
import { formatCurrency, formatDate } from '@/lib/utils'
import { GitBranch, TrendingUp, TrendingDown, AlertTriangle, Landmark } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface VentaPendiente {
  id: string
  fecha: string
  monto_ars: number
  numero_factura: string | null
  razon_social: string | null
}

interface CompraPendiente {
  id: string
  fecha: string
  monto_ars: number
  descripcion: string
}

interface Caja {
  nombre: string
  saldo_actual: number
}

interface Movimiento {
  fecha: string
  concepto: string
  tipo: 'entrada' | 'salida'
  monto: number
  saldo: number
}

interface SemanaData {
  semana: string
  saldo: number
  entradas: number
  salidas: number
}

export default function CashflowPage() {
  const [ventasPendientes, setVentasPendientes] = useState<VentaPendiente[]>([])
  const [comprasPendientes, setComprasPendientes] = useState<CompraPendiente[]>([])
  const [cajas, setCajas] = useState<Caja[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const supabase = createClient()
      const hoy = new Date()
      const en90 = new Date(hoy)
      en90.setDate(hoy.getDate() + 90)
      const en90Str = en90.toISOString().split('T')[0]
      const hoyStr  = hoy.toISOString().split('T')[0]

      const [vRes, cRes, cajasRes] = await Promise.all([
        supabase.from('ventas').select('id, fecha, monto_ars, numero_factura, razon_social')
          .neq('canal', 'ecommerce').eq('cobrada', false).lte('fecha', en90Str),
        supabase.from('compras').select('id, fecha, monto_ars, descripcion')
          .in('estado_pago', ['pendiente', 'parcial']).lte('fecha', en90Str),
        supabase.from('cajas').select('nombre, saldo_actual'),
      ])

      setVentasPendientes((vRes.data || []) as VentaPendiente[])
      setComprasPendientes((cRes.data || []) as CompraPendiente[])
      setCajas((cajasRes.data || []) as Caja[])
      setLoading(false)
    }
    fetchData()
  }, [])

  const saldoActual = useMemo(() => cajas.reduce((s, c) => s + Number(c.saldo_actual || 0), 0), [cajas])

  // ── Construir timeline de movimientos ────────────────────────────────────
  const movimientos: Movimiento[] = useMemo(() => {
    const hoy = new Date()
    const list: Omit<Movimiento, 'saldo'>[] = [
      ...ventasPendientes.map(v => ({
        fecha: v.fecha,
        concepto: v.razon_social || v.numero_factura || 'Venta pendiente',
        tipo: 'entrada' as const,
        monto: v.monto_ars,
      })),
      ...comprasPendientes.map(c => ({
        fecha: c.fecha,
        concepto: c.descripcion || 'Compra pendiente',
        tipo: 'salida' as const,
        monto: c.monto_ars,
      })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha))

    let saldo = saldoActual
    return list.map(m => {
      saldo = m.tipo === 'entrada' ? saldo + m.monto : saldo - m.monto
      return { ...m, saldo }
    })
  }, [ventasPendientes, comprasPendientes, saldoActual])

  // ── Saldo proyectado por semana (próximas 12 semanas) ─────────────────────
  const chartData: SemanaData[] = useMemo(() => {
    const hoy = new Date()
    return Array.from({ length: 13 }, (_, i) => {
      const weekStart = new Date(hoy)
      weekStart.setDate(hoy.getDate() + i * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      const wsStr = weekStart.toISOString().split('T')[0]
      const weStr = weekEnd.toISOString().split('T')[0]

      const entradas = ventasPendientes.filter(v => v.fecha >= wsStr && v.fecha <= weStr).reduce((s, v) => s + v.monto_ars, 0)
      const salidas  = comprasPendientes.filter(c => c.fecha >= wsStr && c.fecha <= weStr).reduce((s, c) => s + c.monto_ars, 0)

      // Saldo acumulado hasta fin de semana
      const movsHasta = movimientos.filter(m => m.fecha <= weStr)
      const saldo = movsHasta.length > 0 ? movsHasta[movsHasta.length - 1].saldo : saldoActual

      return {
        semana: `S${i + 1}`,
        saldo: Math.round(saldo),
        entradas: Math.round(entradas),
        salidas: Math.round(salidas),
      }
    })
  }, [movimientos, ventasPendientes, comprasPendientes, saldoActual])

  const hoyStr = new Date().toISOString().split('T')[0]
  const en30   = new Date(); en30.setDate(en30.getDate() + 30)
  const en30Str = en30.toISOString().split('T')[0]

  const entradasProx30 = ventasPendientes.filter(v => v.fecha >= hoyStr && v.fecha <= en30Str).reduce((s, v) => s + v.monto_ars, 0)
  const salidasProx30  = comprasPendientes.filter(c => c.fecha >= hoyStr && c.fecha <= en30Str).reduce((s, c) => s + c.monto_ars, 0)
  const saldoProx30    = saldoActual + entradasProx30 - salidasProx30
  const saldoMinimo    = Math.min(...chartData.map(d => d.saldo), saldoActual)
  const hayNegativo    = saldoMinimo < 0

  return (
    <div>
      <PageHeader title="Flujo de Caja" description="Proyección 90 días" icon={GitBranch} />

      {/* Alerta si saldo negativo proyectado */}
      {hayNegativo && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          El saldo proyectado cae a negativo ({formatCurrency(saldoMinimo)}) en los próximos 90 días
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Landmark className="w-3 h-3" /> Saldo actual</p>
          <Private><p className="text-xl font-bold text-text-primary">{formatCurrency(saldoActual)}</p></Private>
          <p className="text-xs text-text-muted mt-1">{cajas.length} {cajas.length === 1 ? 'caja' : 'cajas'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-400" /> Entradas próx. 30d</p>
          <Private><p className="text-xl font-bold text-green-400">{formatCurrency(entradasProx30)}</p></Private>
          <p className="text-xs text-text-muted mt-1">{ventasPendientes.filter(v => v.fecha <= en30Str).length} ventas</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-400" /> Salidas próx. 30d</p>
          <Private><p className="text-xl font-bold text-red-400">{formatCurrency(salidasProx30)}</p></Private>
          <p className="text-xs text-text-muted mt-1">{comprasPendientes.filter(c => c.fecha <= en30Str).length} compras</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1">Saldo proyectado 30d</p>
          <Private><p className={`text-xl font-bold ${saldoProx30 >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(saldoProx30)}</p></Private>
        </div>
      </div>

      {/* Gráfico saldo proyectado */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-text-secondary mb-4">Saldo proyectado — próximas 13 semanas</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" />
            <Area type="monotone" dataKey="saldo" stroke="var(--color-accent)" fill="url(#saldoGrad)" strokeWidth={2} name="Saldo" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla de movimientos */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-text-secondary">Movimientos proyectados ({movimientos.length})</p>
        </div>
        {movimientos.length === 0 ? (
          <div className="p-10 text-center text-text-muted text-sm">No hay movimientos pendientes en los próximos 90 días</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-4 text-text-muted font-medium text-xs">Fecha</th>
                  <th className="text-left py-2 px-4 text-text-muted font-medium text-xs">Concepto</th>
                  <th className="text-right py-2 px-4 text-text-muted font-medium text-xs">Entrada</th>
                  <th className="text-right py-2 px-4 text-text-muted font-medium text-xs">Salida</th>
                  <th className="text-right py-2 px-4 text-text-muted font-medium text-xs">Saldo acum.</th>
                </tr>
              </thead>
              <tbody>
                {/* Saldo inicial */}
                <tr className="border-b border-border/30 bg-card-hover">
                  <td className="py-2 px-4 text-xs text-text-muted">Hoy</td>
                  <td className="py-2 px-4 text-xs font-medium text-text-secondary">Saldo actual en cajas</td>
                  <td className="py-2 px-4 text-xs text-right" />
                  <td className="py-2 px-4 text-xs text-right" />
                  <td className="py-2 px-4 text-xs text-right font-bold text-text-primary"><Private>{formatCurrency(saldoActual)}</Private></td>
                </tr>
                {movimientos.map((m, i) => (
                  <tr key={i} className={`border-b border-border/30 hover:bg-card-hover transition-colors ${m.saldo < 0 ? 'bg-red-500/5' : ''}`}>
                    <td className="py-2 px-4 text-xs text-text-muted">{formatDate(m.fecha)}</td>
                    <td className="py-2 px-4 text-xs text-text-secondary">{m.concepto}</td>
                    <td className="py-2 px-4 text-xs text-right text-green-400">
                      {m.tipo === 'entrada' ? <Private>{formatCurrency(m.monto)}</Private> : ''}
                    </td>
                    <td className="py-2 px-4 text-xs text-right text-red-400">
                      {m.tipo === 'salida' ? <Private>{formatCurrency(m.monto)}</Private> : ''}
                    </td>
                    <td className={`py-2 px-4 text-xs text-right font-semibold ${m.saldo < 0 ? 'text-red-400' : 'text-text-primary'}`}>
                      <Private>{formatCurrency(m.saldo)}</Private>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
