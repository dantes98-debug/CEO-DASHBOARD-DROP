'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatPercent, getCurrentMonthRange } from '@/lib/utils'
import {
  TrendingUp,
  Receipt,
  Percent,
  Package,
  HandCoins,
  Landmark,
  CalendarDays,
  Target,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts'

interface OverviewData {
  ventasMes: number
  gastosMes: number
  margenPromedio: number
  stockTotal: number
  comisionesPendientes: number
  saldoCajas: number
  reunionesMes: number
  objetivosCompletados: number
  ventasPorMes: { mes: string; ventas: number; gastos: number }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverviewData()
  }, [])

  const fetchOverviewData = async () => {
    const supabase = createClient()
    const { start, end } = getCurrentMonthRange()

    const [
      ventasRes,
      gastosRes,
      productosRes,
      stockRes,
      comisionesRes,
      cajasRes,
      reunionesRes,
      objetivosRes,
      ventasHistRes,
      gastosHistRes,
    ] = await Promise.all([
      supabase.from('ventas').select('monto').gte('fecha', start).lte('fecha', end),
      supabase.from('gastos').select('monto').gte('fecha', start).lte('fecha', end),
      supabase.from('productos').select('costo, precio_venta'),
      supabase.from('stock').select('cantidad, precio_lista'),
      supabase.from('comisiones').select('monto').eq('pagada', false),
      supabase.from('cajas').select('saldo_actual'),
      supabase.from('reuniones').select('id').gte('fecha', start).lte('fecha', end),
      supabase.from('objetivos').select('meta, actual'),
      supabase.from('ventas').select('fecha, monto').gte('fecha', `${new Date().getFullYear()}-01-01`),
      supabase.from('gastos').select('fecha, monto').gte('fecha', `${new Date().getFullYear()}-01-01`),
    ])

    const ventasMes = (ventasRes.data || []).reduce((sum, v) => sum + Number(v.monto), 0)
    const gastosMes = (gastosRes.data || []).reduce((sum, g) => sum + Number(g.monto), 0)

    const productos = productosRes.data || []
    const margenPromedio = productos.length > 0
      ? productos.reduce((sum, p) => sum + ((Number(p.precio_venta) - Number(p.costo)) / Number(p.precio_venta)) * 100, 0) / productos.length
      : 0

    const stockTotal = (stockRes.data || []).reduce(
      (sum, s) => sum + Number(s.cantidad) * Number(s.precio_lista), 0
    )

    const comisionesPendientes = (comisionesRes.data || []).reduce(
      (sum, c) => sum + Number(c.monto), 0
    )

    const saldoCajas = (cajasRes.data || []).reduce(
      (sum, c) => sum + Number(c.saldo_actual), 0
    )

    const reunionesMes = (reunionesRes.data || []).length

    const objetivos = objetivosRes.data || []
    const objetivosCompletados = objetivos.length > 0
      ? (objetivos.filter(o => Number(o.actual) >= Number(o.meta)).length / objetivos.length) * 100
      : 0

    // Build monthly chart data
    const monthlyMap: Record<string, { ventas: number; gastos: number }> = {}
    for (let m = 1; m <= 12; m++) {
      const key = `${m.toString().padStart(2, '0')}`
      monthlyMap[key] = { ventas: 0, gastos: 0 }
    }

    ;(ventasHistRes.data || []).forEach((v) => {
      const month = v.fecha.slice(5, 7)
      if (monthlyMap[month]) monthlyMap[month].ventas += Number(v.monto)
    })
    ;(gastosHistRes.data || []).forEach((g) => {
      const month = g.fecha.slice(5, 7)
      if (monthlyMap[month]) monthlyMap[month].gastos += Number(g.monto)
    })

    const mesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const ventasPorMes = Object.entries(monthlyMap).map(([k, v], i) => ({
      mes: mesNombres[i],
      ventas: v.ventas,
      gastos: v.gastos,
    }))

    setData({
      ventasMes,
      gastosMes,
      margenPromedio,
      stockTotal,
      comisionesPendientes,
      saldoCajas,
      reunionesMes,
      objetivosCompletados,
      ventasPorMes,
    })
    setLoading(false)
  }

  const metrics = data ? [
    {
      title: 'Ventas del mes',
      value: formatCurrency(data.ventasMes),
      icon: TrendingUp,
      color: 'blue' as const,
    },
    {
      title: 'Gastos del mes',
      value: formatCurrency(data.gastosMes),
      icon: Receipt,
      color: 'red' as const,
    },
    {
      title: 'Margen promedio',
      value: formatPercent(data.margenPromedio),
      icon: Percent,
      color: 'green' as const,
    },
    {
      title: 'Stock valorizado',
      value: formatCurrency(data.stockTotal),
      icon: Package,
      color: 'purple' as const,
    },
    {
      title: 'Comisiones pendientes',
      value: formatCurrency(data.comisionesPendientes),
      icon: HandCoins,
      color: 'yellow' as const,
    },
    {
      title: 'Saldo en cajas',
      value: formatCurrency(data.saldoCajas),
      icon: Landmark,
      color: 'cyan' as const,
    },
    {
      title: 'Reuniones este mes',
      value: String(data.reunionesMes),
      icon: CalendarDays,
      color: 'blue' as const,
    },
    {
      title: 'Objetivos completados',
      value: formatPercent(data.objetivosCompletados),
      icon: Target,
      color: 'green' as const,
    },
  ] : []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Resumen general</h1>
        <p className="text-text-secondary mt-1">Panel ejecutivo — métricas clave del negocio</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <MetricCard
                key={i}
                title=""
                value=""
                icon={TrendingUp}
                loading={true}
              />
            ))
          : metrics.map((m) => (
              <MetricCard key={m.title} {...m} />
            ))}
      </div>

      {/* Charts */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-base font-semibold text-text-primary mb-6">Ventas vs Gastos</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.ventasPorMes} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
                <Bar dataKey="ventas" name="Ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-base font-semibold text-text-primary mb-6">Evolución de ventas</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.ventasPorMes} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
                <Line
                  type="monotone"
                  dataKey="ventas"
                  name="Ventas"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
