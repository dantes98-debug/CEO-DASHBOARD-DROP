'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import { Target, ShoppingCart, Building2, MessageCircle, Store, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

type KpiTipo = 'ventas' | 'estudios' | 'whatsapp' | 'showroom'

interface KpiObjetivo {
  id: string
  tipo: KpiTipo
  anio: number
  mes: number
  objetivo: number
  actual: number
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const KPI_CONFIG: Record<KpiTipo, { label: string; icon: React.ElementType; color: string; colorClass: string; esMonto: boolean }> = {
  ventas:   { label: 'Ventas',              icon: ShoppingCart,   color: '#3b82f6', colorClass: 'blue',   esMonto: true  },
  estudios: { label: 'Contacto estudios',   icon: Building2,      color: '#8b5cf6', colorClass: 'purple', esMonto: false },
  whatsapp: { label: 'Contactos WhatsApp',  icon: MessageCircle,  color: '#22c55e', colorClass: 'green',  esMonto: false },
  showroom: { label: 'Visitas showroom',    icon: Store,          color: '#f59e0b', colorClass: 'yellow', esMonto: false },
}

const colorBar: Record<string, string> = {
  blue: '#3b82f6', purple: '#8b5cf6', green: '#22c55e', yellow: '#f59e0b'
}

export default function ObjetivosPage() {
  const [data, setData] = useState<KpiObjetivo[]>([])
  const [ventasPorMes, setVentasPorMes] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<KpiTipo | null>(null)
  const [editModal, setEditModal] = useState<{ tipo: KpiTipo; anio: number; mes: number; objetivo: number; actual: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const hoy = new Date()
  const mesActual = hoy.getMonth() + 1
  const anioActual = hoy.getFullYear()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [{ data: rows }, { data: ventas }] = await Promise.all([
      supabase.from('kpi_objetivos').select('*').order('anio').order('mes'),
      supabase.from('ventas').select('fecha, monto'),
    ])

    // Agrupar ventas por año-mes
    const ventasMap: Record<string, number> = {}
    for (const v of ventas || []) {
      const d = new Date(v.fecha)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      ventasMap[key] = (ventasMap[key] || 0) + Number(v.monto)
    }

    setVentasPorMes(ventasMap)
    setData(rows || [])
    setLoading(false)
  }

  // Para ventas, el actual viene de la tabla ventas; para el resto, de kpi_objetivos
  const getActual = (tipo: KpiTipo, anio: number, mes: number) => {
    if (tipo === 'ventas') return ventasPorMes[`${anio}-${mes}`] || 0
    return data.find(d => d.tipo === tipo && d.anio === anio && d.mes === mes)?.actual || 0
  }

  const getKpiMes = (tipo: KpiTipo, anio: number, mes: number) =>
    data.find(d => d.tipo === tipo && d.anio === anio && d.mes === mes)

  const getHistorial = (tipo: KpiTipo) => {
    const rows = data.filter(d => d.tipo === tipo)
    const meses: { label: string; actual: number; objetivo: number; mes: number; anio: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anioActual, mesActual - 1 - i, 1)
      const m = d.getMonth() + 1
      const a = d.getFullYear()
      const row = rows.find(r => r.mes === m && r.anio === a)
      const actual = getActual(tipo, a, m)
      meses.push({ label: `${MESES[m - 1]} ${a !== anioActual ? a : ''}`.trim(), actual, objetivo: row?.objetivo || 0, mes: m, anio: a })
    }
    return meses
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editModal) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('kpi_objetivos').upsert(
      { tipo: editModal.tipo, anio: editModal.anio, mes: editModal.mes, objetivo: editModal.objetivo, actual: editModal.actual },
      { onConflict: 'tipo,anio,mes' }
    )
    await fetchData()
    setEditModal(null)
    setSaving(false)
  }

  const openEdit = (tipo: KpiTipo, anio: number, mes: number) => {
    const existing = getKpiMes(tipo, anio, mes)
    setEditModal({ tipo, anio, mes, objetivo: existing?.objetivo || 0, actual: existing?.actual || 0 })
  }

  const tipoActivo = detalle ? KPI_CONFIG[detalle] : null
  const historial = detalle ? getHistorial(detalle) : []
  const kpiActual = detalle ? {
    actual: getActual(detalle, anioActual, mesActual),
    objetivo: getKpiMes(detalle, anioActual, mesActual)?.objetivo || 0,
  } : null

  return (
    <div>
      <PageHeader
        title="Objetivos"
        description="Seguimiento mensual de KPIs"
        icon={Target}
      />

      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {(Object.keys(KPI_CONFIG) as KpiTipo[]).map((tipo) => {
          const cfg = KPI_CONFIG[tipo]
          const kpi = getKpiMes(tipo, anioActual, mesActual)
          const actual = getActual(tipo, anioActual, mesActual)
          const objetivo = kpi?.objetivo || 0
          const pct = objetivo > 0 ? Math.min((actual / objetivo) * 100, 100) : 0
          const Icon = cfg.icon

          const getColor = (p: number) => p >= 100 ? '#22c55e' : p >= 70 ? '#3b82f6' : p >= 40 ? '#eab308' : '#ef4444'
          const getTextColor = (p: number) => p >= 100 ? 'text-green-400' : p >= 70 ? 'text-blue-400' : p >= 40 ? 'text-yellow-400' : 'text-red-400'

          return (
            <div
              key={tipo}
              onClick={() => setDetalle(tipo)}
              className={`bg-card rounded-xl border border-border p-6 cursor-pointer hover:border-accent/50 transition-all group ${objetivo === 0 ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${cfg.color}20` }}>
                    <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-secondary">{cfg.label}</p>
                    <p className="text-xs text-text-muted">{MESES[mesActual - 1]} {anioActual}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(tipo, anioActual, mesActual) }}
                    className="text-xs text-text-muted hover:text-accent px-2 py-1 rounded hover:bg-accent/10 transition-colors"
                  >
                    Editar
                  </button>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                </div>
              </div>

              {loading ? (
                <div className="h-10 bg-border/30 rounded animate-pulse" />
              ) : objetivo === 0 ? (
                <div>
                  <p className="text-xs text-text-muted mb-3">Sin objetivo configurado para este mes</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(tipo, anioActual, mesActual) }}
                    className="text-xs text-accent hover:text-accent-hover border border-accent/30 hover:bg-accent/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    + Configurar objetivo
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <span className="text-2xl font-bold text-text-primary">
                      {cfg.esMonto ? formatCurrency(actual) : actual.toLocaleString('es-AR')}
                    </span>
                    <span className="text-sm text-text-muted ml-2">
                      / {cfg.esMonto ? formatCurrency(objetivo) : objetivo.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="w-full bg-border rounded-full h-2 mb-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: getColor(pct) }}
                    />
                  </div>
                  <p className={`text-xs font-semibold ${getTextColor(pct)}`}>
                    {pct.toFixed(0)}% del objetivo
                  </p>
                </>
              )}
              {!loading && (() => {
                const hist = getHistorial(tipo).slice(-6)
                return (
                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50">
                    {hist.map((h, i) => {
                      const p = h.objetivo > 0 ? (h.actual / h.objetivo) * 100 : -1
                      const colorCls = p < 0 ? 'bg-border'
                        : p >= 100 ? 'bg-green-500'
                        : p >= 50 ? 'bg-yellow-400'
                        : 'bg-red-500'
                      return (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${colorCls}`}
                          title={`${h.label}: ${h.objetivo > 0 ? `${p.toFixed(0)}%` : 'sin objetivo'}`}
                        />
                      )
                    })}
                    <span className="text-xs text-text-muted ml-1">últimos 6m</span>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {/* Detail modal */}
      {detalle && tipoActivo && (
        <Modal isOpen={true} onClose={() => setDetalle(null)} title={tipoActivo.label} size="lg">
          <div className="space-y-6">
            {/* Current month summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card-hover rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted mb-1">Actual</p>
                <p className="text-lg font-bold text-text-primary">
                  {tipoActivo.esMonto ? formatCurrency(kpiActual?.actual || 0) : (kpiActual?.actual || 0).toLocaleString('es-AR')}
                </p>
              </div>
              <div className="bg-card-hover rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted mb-1">Objetivo</p>
                <p className="text-lg font-bold text-text-primary">
                  {tipoActivo.esMonto ? formatCurrency(kpiActual?.objetivo || 0) : (kpiActual?.objetivo || 0).toLocaleString('es-AR')}
                </p>
              </div>
              <div className="bg-card-hover rounded-lg p-3 text-center">
                <p className="text-xs text-text-muted mb-1">Cumplimiento</p>
                <p className="text-lg font-bold text-green-400">
                  {kpiActual?.objetivo ? `${Math.min(((kpiActual.actual / kpiActual.objetivo) * 100), 999).toFixed(0)}%` : '—'}
                </p>
              </div>
            </div>

            {/* Chart */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-4">Últimos 12 meses</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={historial} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#f1f5f9' }}
                  />
                  <Bar dataKey="actual" name="Actual" fill={colorBar[tipoActivo.colorClass]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="objetivo" name="Objetivo" fill="#334155" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly table */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-3">Detalle por mes</p>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {historial.slice().reverse().map((row, i) => {
                  const pct = row.objetivo > 0 ? Math.min((row.actual / row.objetivo) * 100, 100) : 0
                  return (
                    <div key={i} className="flex items-center justify-between bg-card-hover rounded-lg px-4 py-2.5 gap-2">
                      <span className="text-sm text-text-primary w-16 shrink-0">{row.label}</span>
                      <span className="text-sm text-text-secondary flex-1">
                        {tipoActivo.esMonto ? formatCurrency(row.actual) : row.actual.toLocaleString('es-AR')}
                        <span className="text-text-muted"> / {tipoActivo.esMonto ? formatCurrency(row.objetivo) : row.objetivo.toLocaleString('es-AR')}</span>
                      </span>
                      <span className={`text-xs font-semibold w-10 text-right shrink-0 ${pct >= 100 ? 'text-green-400' : pct >= 70 ? 'text-blue-400' : pct >= 40 ? 'text-yellow-400' : row.objetivo === 0 ? 'text-text-muted' : 'text-red-400'}`}>
                        {row.objetivo === 0 ? '—' : `${pct.toFixed(0)}%`}
                      </span>
                      <button
                        onClick={() => { setDetalle(null); openEdit(detalle!, row.anio, row.mes) }}
                        className="text-xs text-text-muted hover:text-accent shrink-0 px-2 py-1 rounded hover:bg-accent/10 transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => { setDetalle(null); openEdit(detalle, anioActual, mesActual) }}
              className="w-full py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Actualizar mes actual
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editModal && (
        <Modal isOpen={true} onClose={() => setEditModal(null)} title={`${KPI_CONFIG[editModal.tipo].label} — ${MESES[editModal.mes - 1]} ${editModal.anio}`} size="sm">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Objetivo del mes</label>
              <input
                type="number" min="0" step="any"
                value={editModal.objetivo}
                onChange={(e) => setEditModal({ ...editModal, objetivo: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
            {editModal.tipo !== 'ventas' && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Actual</label>
                <input
                  type="number" min="0" step="any"
                  value={editModal.actual}
                  onChange={(e) => setEditModal({ ...editModal, actual: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
            )}
            {editModal.tipo === 'ventas' && (
              <p className="text-xs text-text-muted bg-card-hover rounded-lg px-3 py-2">
                El actual de Ventas se calcula automático desde el módulo de Ventas.
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditModal(null)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
