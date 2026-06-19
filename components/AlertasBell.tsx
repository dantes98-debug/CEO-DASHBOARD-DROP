'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Bell } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Alerta {
  tipo: 'kpi' | 'envio' | 'cobro' | 'garantia'
  mensaje: string
  nivel: 'rojo' | 'amarillo'
}

export default function AlertasBell() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      const supabase = createClient()
      const hoy = new Date()
      const mesHoy = hoy.getMonth() + 1
      const anioHoy = hoy.getFullYear()

      const prevDate = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
      const prevMes = prevDate.getMonth() + 1
      const prevAnio = prevDate.getFullYear()
      const prevStart = `${prevAnio}-${String(prevMes).padStart(2, '0')}-01`
      const prevEnd = new Date(prevAnio, prevMes, 0).toISOString().split('T')[0]

      const hace7 = new Date(hoy)
      hace7.setDate(hoy.getDate() - 7)
      const hace7Str = hace7.toISOString().split('T')[0]

      const mesStart = `${anioHoy}-${String(mesHoy).padStart(2, '0')}-01`
      const mesEnd = new Date(anioHoy, mesHoy, 0).toISOString().split('T')[0]

      const hace3 = new Date(hoy)
      hace3.setDate(hoy.getDate() - 3)
      const hace3Str = hace3.toISOString().split('T')[0]

      const hace45 = new Date(hoy)
      hace45.setDate(hoy.getDate() - 45)
      const hace45Str = hace45.toISOString().split('T')[0]

      const [objRes, enviosRes, ventasRes, ventasMesRes, ventasMesAntRes, ventasUlt3Res, cajasRes, comprasTranRes, garantiasRes] = await Promise.all([
        supabase.from('kpi_objetivos').select('tipo, objetivo, actual').eq('anio', anioHoy).eq('mes', mesHoy),
        supabase.from('envios').select('id').lte('fecha_envio', hace7Str).not('estado', 'in', '("entregado","cancelado")'),
        supabase.from('ventas').select('id, monto_ars').or('canal.neq.ecommerce,confirmada.eq.true').eq('cobrada', false).gte('fecha', prevStart).lte('fecha', prevEnd),
        supabase.from('ventas').select('monto_ars').or('canal.neq.ecommerce,confirmada.eq.true').gte('fecha', mesStart).lte('fecha', mesEnd),
        supabase.from('ventas').select('monto_ars').or('canal.neq.ecommerce,confirmada.eq.true').gte('fecha', prevStart).lte('fecha', prevEnd),
        supabase.from('ventas').select('id').or('canal.neq.ecommerce,confirmada.eq.true').gte('fecha', hace3Str),
        supabase.from('cajas').select('nombre, saldo_actual'),
        supabase.from('compras').select('id, descripcion').eq('estado_pago', 'pendiente').lte('fecha', hace45Str),
        supabase.from('garantias').select('id, prioridad').in('estado', ['pendiente', 'en_gestion', 'en_reparacion']),
      ])

      const ventasActual = (ventasMesRes.data || []).reduce((s, v) => s + Number(v.monto_ars || 0), 0)
      const nuevas: Alerta[] = []

      const KPI_LABELS: Record<string, string> = {
        ventas: 'Ventas', estudios: 'Contacto estudios', whatsapp: 'WhatsApp', showroom: 'Showroom',
      }

      for (const obj of objRes.data || []) {
        if (obj.objetivo <= 0) continue
        const actual = obj.tipo === 'ventas' ? ventasActual : obj.actual
        const pct = (actual / obj.objetivo) * 100
        if (pct < 40) {
          nuevas.push({
            tipo: 'kpi',
            mensaje: `KPI ${KPI_LABELS[obj.tipo] || obj.tipo} en rojo (${pct.toFixed(0)}% del objetivo)`,
            nivel: 'rojo',
          })
        }
      }

      const enviosPend = enviosRes.data?.length ?? 0
      if (enviosPend > 0) {
        nuevas.push({
          tipo: 'envio',
          mensaje: `${enviosPend} envío${enviosPend > 1 ? 's' : ''} sin actualizar hace más de 7 días`,
          nivel: 'amarillo',
        })
      }

      const ventasSinCobrar = ventasRes.data || []
      if (ventasSinCobrar.length > 0) {
        const total = ventasSinCobrar.reduce((s, v) => s + Number(v.monto_ars || 0), 0)
        nuevas.push({
          tipo: 'cobro',
          mensaje: `${ventasSinCobrar.length} venta${ventasSinCobrar.length > 1 ? 's' : ''} sin cobrar del mes anterior (${formatCurrency(total)})`,
          nivel: 'rojo',
        })
      }

      // Ventas mes actual < 70% del mes anterior
      const factMesActual = (ventasMesRes.data || []).reduce((s, v) => s + Number(v.monto_ars || 0), 0)
      const factMesAnt    = (ventasMesAntRes.data || []).reduce((s, v) => s + Number(v.monto_ars || 0), 0)
      if (factMesAnt > 0 && factMesActual < factMesAnt * 0.7) {
        nuevas.push({
          tipo: 'kpi',
          mensaje: `Ventas del mes son ${((factMesActual / factMesAnt) * 100).toFixed(0)}% del mes anterior`,
          nivel: 'amarillo',
        })
      }

      // Sin ventas en los últimos 3 días
      if ((ventasUlt3Res.data || []).length === 0) {
        nuevas.push({ tipo: 'cobro', mensaje: 'Sin ventas registradas en los últimos 3 días', nivel: 'amarillo' })
      }

      // Caja con saldo bajo
      for (const caja of cajasRes.data || []) {
        if (Number(caja.saldo_actual || 0) < 50000) {
          nuevas.push({ tipo: 'cobro', mensaje: `Caja "${caja.nombre}" con saldo bajo (${formatCurrency(Number(caja.saldo_actual))})`, nivel: 'rojo' })
        }
      }

      // Compras en tránsito hace más de 45 días
      const comprasViejas = (comprasTranRes.data || []).length
      if (comprasViejas > 0) {
        nuevas.push({ tipo: 'envio', mensaje: `${comprasViejas} compra${comprasViejas > 1 ? 's' : ''} pendiente${comprasViejas > 1 ? 's' : ''} de pago hace más de 45 días`, nivel: 'amarillo' })
      }

      const garantiasPend = garantiasRes.data || []
      if (garantiasPend.length > 0) {
        const urgentes = garantiasPend.filter(g => g.prioridad === 'urgente').length
        nuevas.push({
          tipo: 'garantia',
          mensaje: `${garantiasPend.length} garantía${garantiasPend.length > 1 ? 's' : ''} pendiente${garantiasPend.length > 1 ? 's' : ''} de resolución${urgentes > 0 ? ` (${urgentes} urgente${urgentes > 1 ? 's' : ''})` : ''}`,
          nivel: urgentes > 0 ? 'rojo' : 'amarillo',
        })
      }

      setAlertas(nuevas)
      setLoading(false)
    }
    cargar()
  }, [])

  const rojas = alertas.filter(a => a.nivel === 'rojo').length
  const total = alertas.length

  if (loading) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-card-hover transition-colors"
        title="Alertas"
      >
        <Bell className="w-4 h-4" />
        {total > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 w-4 h-4 text-[9px] font-bold rounded-full flex items-center justify-center text-white ${rojas > 0 ? 'bg-red-500' : 'bg-yellow-500'}`}>
            {total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-full ml-2 top-0 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary">Alertas activas</span>
              {total === 0 && <span className="text-xs text-green-400">Todo en orden ✓</span>}
            </div>
            {alertas.length === 0 ? (
              <div className="px-3 py-4 text-xs text-text-muted text-center">Sin alertas — todo en orden</div>
            ) : (
              <div className="divide-y divide-border">
                {alertas.map((a, i) => (
                  <div key={i} className={`px-3 py-2.5 flex items-start gap-2 ${a.nivel === 'rojo' ? 'bg-red-500/5' : 'bg-yellow-500/5'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.nivel === 'rojo' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                    <p className="text-xs text-text-secondary leading-relaxed">{a.mensaje}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
