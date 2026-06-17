'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import Private from '@/components/Private'
import { useProfile } from '@/lib/profile-context'
import { Users, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, Link, RefreshCw } from 'lucide-react'

interface Metrics {
  totalLeads: number
  ganados: number
  perdidos: number
  enProceso: number
  conversionPct: number
  valorGanado: number
  totalContactosMes: number
  porEtapa: { etapa: string; count: number }[]
  porFuente: { fuente: string; count: number }[]
  pipelines: { id: number; name: string }[]
}

export default function CRMPage() {
  const profile = useProfile()
  const isAdmin = profile?.role === 'admin'
  const searchParams = useSearchParams()
  const connected = searchParams.get('connected') === '1'
  const error = searchParams.get('error')
  const errorDetail = searchParams.get('detail')

  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchMetrics = async () => {
    setRefreshing(true)
    const res = await fetch('/api/kommo/metrics')
    if (res.status === 401) {
      const body = await res.json()
      if (body.error === 'not_connected') { setNotConnected(true); setLoading(false); setRefreshing(false); return }
    }
    if (res.ok) {
      const data = await res.json()
      setMetrics(data)
      setNotConnected(false)
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { fetchMetrics() }, [])

  if (loading) return (
    <div>
      <PageHeader title="CRM — Kommo" description="Métricas de leads y pipeline" icon={Users} />
      <div className="text-center py-20 text-text-muted text-sm">Cargando métricas...</div>
    </div>
  )

  if (notConnected) return (
    <div>
      <PageHeader title="CRM — Kommo" description="Métricas de leads y pipeline" icon={Users} />
      <div className="max-w-md mx-auto mt-16 bg-card border border-border rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <Link className="w-7 h-7 text-accent" />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-2">Conectar Kommo</h2>
        <p className="text-sm text-text-muted mb-6">
          Conectá tu cuenta de Kommo para ver métricas de leads, pipeline y conversión en tiempo real.
        </p>
        {error && (
          <div className="mb-4 text-left bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p className="text-xs text-red-400 font-semibold mb-1">Error: {error}</p>
            {errorDetail && <p className="text-[10px] text-red-300 break-all">{decodeURIComponent(errorDetail)}</p>}
          </div>
        )}
        {isAdmin ? (
          <a href="/api/kommo/auth" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors">
            <Link className="w-4 h-4" /> Conectar con Kommo
          </a>
        ) : (
          <p className="text-sm text-text-muted">Pedile al admin que conecte Kommo.</p>
        )}
      </div>
    </div>
  )

  if (!metrics) return null

  const maxEtapa = Math.max(...metrics.porEtapa.map(e => e.count), 1)
  const maxFuente = Math.max(...metrics.porFuente.map(f => f.count), 1)

  return (
    <div>
      <PageHeader
        title="CRM — Kommo"
        description="Métricas del mes actual"
        icon={Users}
        action={
          <button onClick={fetchMetrics} disabled={refreshing} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      {connected && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          ✓ Kommo conectado correctamente
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Leads del mes</p>
          <p className="text-2xl font-bold text-text-primary">{metrics.totalLeads}</p>
          <p className="text-xs text-text-muted mt-1">{metrics.enProceso} en proceso</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-400" /> Ganados</p>
          <p className="text-2xl font-bold text-green-400">{metrics.ganados}</p>
          <p className="text-xs text-text-muted mt-1">{metrics.conversionPct}% conversión</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> Perdidos</p>
          <p className="text-2xl font-bold text-red-400">{metrics.perdidos}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Contactos nuevos</p>
          <p className="text-2xl font-bold text-text-primary">{metrics.totalContactosMes}</p>
        </div>
      </div>

      {/* Conversión visual */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-text-secondary mb-3">Tasa de conversión del mes</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-border rounded-full h-3 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-green-400 transition-all" style={{ width: `${metrics.conversionPct}%` }} />
          </div>
          <span className="text-lg font-bold text-text-primary w-12 text-right">{metrics.conversionPct}%</span>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
          <span>{metrics.totalLeads} leads totales</span>
          <span>{metrics.ganados} ganados · {metrics.perdidos} perdidos · {metrics.enProceso} en proceso</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Por etapa del pipeline */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-text-secondary mb-3">Leads por etapa</p>
          {metrics.porEtapa.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">Sin datos</p>
          ) : (
            <div className="space-y-2.5">
              {metrics.porEtapa.map(({ etapa, count }) => {
                const pct = Math.round((count / maxEtapa) * 100)
                return (
                  <div key={etapa} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-32 flex-shrink-0 truncate">{etapa}</span>
                    <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-text-primary w-6 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Por fuente */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-text-secondary mb-3">Leads por fuente / etiqueta</p>
          {metrics.porFuente.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-6">Sin etiquetas en los leads</p>
          ) : (
            <div className="space-y-2.5">
              {metrics.porFuente.map(({ fuente, count }) => {
                const pct = Math.round((count / maxFuente) * 100)
                return (
                  <div key={fuente} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary w-32 flex-shrink-0 truncate">{fuente}</span>
                    <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-text-primary w-6 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
