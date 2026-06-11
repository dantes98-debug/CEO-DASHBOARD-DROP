'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/lib/profile-context'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import Private from '@/components/Private'
import MonthPicker from '@/components/MonthPicker'
import { formatCurrency, formatDate, MESES_CORTO } from '@/lib/utils'
import { Store, TrendingUp, ShoppingBag, Package, MapPin, CreditCard, CheckCircle, Clock, Download } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'

interface ItemVenta {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  total: number
}

interface Venta {
  id: string
  fecha: string
  monto_ars: number
  monto: number
  subtotal: number
  iva_monto: number
  costo: number
  numero_factura: string | null
  razon_social: string | null
  cobrada: boolean
  fecha_cobro: string | null
  provincia: string | null
  metodo_pago: string | null
  items: ItemVenta[] | null
  clientes: { nombre: string }[] | null
}

export default function EcommercePage() {
  const profile = useProfile()
  const isAdmin = profile?.role === 'admin'

  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)

  const hoy = new Date()
  const [mesFiltro, setMesFiltro] = useState(hoy.getMonth() + 1)
  const [anioFiltro, setAnioFiltro] = useState(hoy.getFullYear())
  const mesValue = `${anioFiltro}-${String(mesFiltro).padStart(2, '0')}`

  const fetchVentas = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('ventas')
      .select('id, fecha, monto_ars, monto, subtotal, iva_monto, costo, numero_factura, razon_social, cobrada, fecha_cobro, provincia, metodo_pago, items, clientes(nombre)')
      .eq('canal', 'ecommerce')
      .order('fecha', { ascending: false })
    const rows = (data || []) as unknown as Venta[]
    setVentas(rows)
    // Auto-seleccionar el mes más reciente con datos
    if (rows.length > 0) {
      const ultima = rows[0].fecha
      const [y, m] = ultima.split('-').map(Number)
      setAnioFiltro(y)
      setMesFiltro(m)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchVentas().finally(() => setLoading(false))
  }, [])

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)
    try {
      const resp = await fetch('/api/woocommerce/import', { method: 'POST' })
      const data = await resp.json()
      if (data.ok) {
        setImportResult({ created: data.created, updated: data.updated, skipped: data.skipped })
        await fetchVentas()
      }
    } finally {
      setImporting(false)
    }
  }

  // ── Mes actual filtrado ──────────────────────────────────────────────────
  const mesStart = `${anioFiltro}-${String(mesFiltro).padStart(2, '0')}-01`
  const mesEnd   = new Date(anioFiltro, mesFiltro, 0).toISOString().split('T')[0]
  const ventasMes = useMemo(() => ventas.filter(v => v.fecha >= mesStart && v.fecha <= mesEnd), [ventas, mesStart, mesEnd])

  // ── KPIs históricos totales ──────────────────────────────────────────────
  const totalHistorico   = ventas.reduce((s, v) => s + v.monto_ars, 0)
  const cantidadHistorica = ventas.length
  const ticketPromHistorico = cantidadHistorica > 0 ? totalHistorico / cantidadHistorica : 0

  // ── KPIs del mes ─────────────────────────────────────────────────────────
  const totalMes      = ventasMes.reduce((s, v) => s + v.monto_ars, 0)
  const cantidadMes   = ventasMes.length
  const ticketProm    = cantidadMes > 0 ? totalMes / cantidadMes : 0
  const gananciasMes  = ventasMes.reduce((s, v) => s + (v.monto_ars - (v.costo || 0) - (v.iva_monto || 0)), 0)
  const margenPct     = totalMes > 0 ? (gananciasMes / totalMes) * 100 : 0
  const cobradas      = ventasMes.filter(v => v.cobrada).length
  const pendientes    = cantidadMes - cobradas

  // ── Gráfico mensual (últimos 12 meses) ───────────────────────────────────
  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(anioFiltro, mesFiltro - 1 - (11 - i), 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      const end   = new Date(y, m, 0).toISOString().split('T')[0]
      const vs    = ventas.filter(v => v.fecha >= start && v.fecha <= end)
      return {
        mes: MESES_CORTO[m - 1],
        ventas: Math.round(vs.reduce((s, v) => s + v.monto_ars, 0)),
        ordenes: vs.length,
      }
    })
  }, [ventas, mesFiltro, anioFiltro])

  // ── Top productos del mes ─────────────────────────────────────────────────
  const topProductos = useMemo(() => {
    const map = new Map<string, { descripcion: string; cantidad: number; revenue: number }>()
    ventasMes.forEach(v => {
      (v.items || []).forEach(item => {
        const key = item.sku || item.descripcion
        const prev = map.get(key) || { descripcion: item.descripcion, cantidad: 0, revenue: 0 }
        map.set(key, {
          descripcion: item.descripcion || item.sku,
          cantidad: prev.cantidad + item.cantidad,
          revenue: prev.revenue + (item.total || item.precio_unitario * item.cantidad),
        })
      })
    })
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  }, [ventasMes])

  // ── Ventas por provincia del mes ─────────────────────────────────────────
  const porProvincia = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    ventasMes.forEach(v => {
      const p = v.provincia || 'Sin provincia'
      const prev = map.get(p) || { total: 0, count: 0 }
      map.set(p, { total: prev.total + v.monto_ars, count: prev.count + 1 })
    })
    return Array.from(map.entries())
      .map(([provincia, d]) => ({ provincia, ...d }))
      .sort((a, b) => b.total - a.total)
  }, [ventasMes])

  // ── Métodos de pago del mes ──────────────────────────────────────────────
  const porMetodoPago = useMemo(() => {
    const map = new Map<string, number>()
    ventasMes.forEach(v => {
      const m = v.metodo_pago || 'Sin especificar'
      map.set(m, (map.get(m) || 0) + 1)
    })
    return Array.from(map.entries()).map(([metodo, count]) => ({ metodo, count })).sort((a, b) => b.count - a.count)
  }, [ventasMes])

  const METODO_LABEL: Record<string, string> = {
    mercado_pago: 'Mercado Pago', transferencia_motic: 'Transferencia',
    efectivo_drop: 'Efectivo Drop', efectivo_motic: 'Efectivo Motic',
    echeq: 'Echeq',
  }

  return (
    <div>
      <PageHeader
        title="Ecommerce"
        description="Ventas generadas desde la tienda online"
        icon={Store}
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={handleImport} disabled={importing}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors">
                <Download className="w-3.5 h-3.5" />
                {importing ? 'Importando...' : 'Importar historial'}
              </button>
            )}
            <MonthPicker value={mesValue} onChange={v => { const [y, m] = v.split('-').map(Number); setAnioFiltro(y); setMesFiltro(m) }} />
          </div>
        }
      />

      {importResult && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          Importación completa — {importResult.created} creadas · {importResult.updated} actualizadas · {importResult.skipped} omitidas
        </div>
      )}

      {/* Totales históricos */}
      {!loading && ventas.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-text-muted mb-1">Total histórico</p>
            <Private><p className="text-xl font-bold text-text-primary">{formatCurrency(totalHistorico)}</p></Private>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Órdenes totales</p>
            <p className="text-xl font-bold text-text-primary">{cantidadHistorica}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Ticket promedio histórico</p>
            <Private><p className="text-xl font-bold text-text-primary">{formatCurrency(ticketPromHistorico)}</p></Private>
          </div>
        </div>
      )}

      {/* KPIs del mes seleccionado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Facturado" value={formatCurrency(totalMes)} icon={TrendingUp} color="blue" loading={loading} />
        <MetricCard title="Órdenes" value={String(cantidadMes)} icon={ShoppingBag} color="green" loading={loading} />
        <MetricCard title="Ticket promedio" value={formatCurrency(ticketProm)} icon={Store} color="yellow" loading={loading} />
        <MetricCard title="Margen" value={`${margenPct.toFixed(1)}%`} icon={TrendingUp} color={margenPct > 20 ? 'green' : 'yellow'} loading={loading} />
      </div>

      {/* Estado cobro */}
      {cantidadMes > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-400/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Cobradas</p>
              <p className="text-2xl font-bold text-green-400">{cobradas}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-yellow-400/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Pendientes de cobro</p>
              <p className="text-2xl font-bold text-yellow-400">{pendientes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico 12 meses */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-text-secondary mb-4">Facturación mensual — últimos 12 meses</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} labelStyle={{ color: 'var(--color-text-primary)' }} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
            <Bar dataKey="ventas" fill="var(--color-accent)" radius={[4, 4, 0, 0]} name="Facturado" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top productos */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-text-secondary mb-3">
            Productos más vendidos — {MESES_CORTO[mesFiltro - 1]} {anioFiltro}
          </p>
          {topProductos.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">Sin ventas en el período</p>
          ) : (
            <div className="space-y-2">
              {topProductos.map((p, i) => {
                const maxRevenue = topProductos[0].revenue
                const pct = maxRevenue > 0 ? Math.round(p.revenue / maxRevenue * 100) : 0
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-text-muted w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate font-medium">{p.descripcion}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 bg-border rounded-full h-1 overflow-hidden">
                          <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-text-muted w-8 text-right">{p.cantidad}u</span>
                    <Private><span className="text-xs font-semibold text-text-primary w-24 text-right">{formatCurrency(p.revenue)}</span></Private>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Por provincia */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-text-secondary mb-3">
            <MapPin className="w-3.5 h-3.5 inline mr-1" />
            Ventas por provincia — {MESES_CORTO[mesFiltro - 1]} {anioFiltro}
          </p>
          {porProvincia.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">Sin ventas en el período</p>
          ) : (
            <div className="space-y-2">
              {porProvincia.map(({ provincia, total, count }) => {
                const maxTotal = porProvincia[0].total
                const pct = maxTotal > 0 ? Math.round(total / maxTotal * 100) : 0
                return (
                  <div key={provincia} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs text-text-primary font-medium truncate">{provincia}</p>
                        <span className="text-xs text-text-muted ml-2 flex-shrink-0">{count} {count === 1 ? 'orden' : 'órdenes'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-border rounded-full h-1 overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <Private><span className="text-xs font-semibold text-text-primary w-24 text-right">{formatCurrency(total)}</span></Private>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Métodos de pago */}
      {porMetodoPago.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-text-secondary mb-3">
            <CreditCard className="w-3.5 h-3.5 inline mr-1" />
            Métodos de pago — {MESES_CORTO[mesFiltro - 1]} {anioFiltro}
          </p>
          <div className="flex flex-wrap gap-3">
            {porMetodoPago.map(({ metodo, count }) => (
              <div key={metodo} className="bg-card-hover border border-border rounded-lg px-3 py-2 text-center">
                <p className="text-xs font-semibold text-text-primary">{count}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{METODO_LABEL[metodo] || metodo}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de órdenes recientes */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-text-secondary">
            Órdenes — {MESES_CORTO[mesFiltro - 1]} {anioFiltro} ({ventasMes.length})
          </p>
        </div>
        {ventasMes.length === 0 ? (
          <div className="p-12 text-center">
            <Store className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">Sin órdenes en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-text-muted font-medium text-xs">Orden</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium text-xs">Cliente</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium text-xs">Provincia</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium text-xs">Productos</th>
                  <th className="text-right py-3 px-4 text-text-muted font-medium text-xs">Monto</th>
                  <th className="text-center py-3 px-4 text-text-muted font-medium text-xs">Estado</th>
                  <th className="text-left py-3 px-4 text-text-muted font-medium text-xs">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {ventasMes.map(v => (
                  <tr key={v.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    <td className="py-3 px-4">
                      <span className="text-xs font-mono text-accent">{v.numero_factura || '—'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs font-medium text-text-primary">{v.clientes?.[0]?.nombre || v.razon_social || '—'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-text-secondary">{v.provincia || '—'}</span>
                    </td>
                    <td className="py-3 px-4 max-w-48">
                      {(v.items || []).length > 0 ? (
                        <div className="space-y-0.5">
                          {(v.items || []).slice(0, 2).map((item, i) => (
                            <p key={i} className="text-xs text-text-secondary truncate">
                              <span className="font-semibold text-accent">{item.cantidad}×</span> {item.descripcion}
                            </p>
                          ))}
                          {(v.items || []).length > 2 && (
                            <p className="text-xs text-text-muted">+{(v.items || []).length - 2} más</p>
                          )}
                        </div>
                      ) : <span className="text-xs text-text-muted">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Private><span className="text-xs font-semibold text-text-primary">{formatCurrency(v.monto_ars)}</span></Private>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {v.cobrada ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-400/10 text-green-400">
                          <CheckCircle className="w-3 h-3" /> Cobrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400">
                          <Clock className="w-3 h-3" /> Pendiente
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-text-muted">{formatDate(v.fecha)}</span>
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
