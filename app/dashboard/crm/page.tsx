'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { useProfile } from '@/lib/profile-context'
import {
  Users, TrendingUp, TrendingDown, CheckCircle, XCircle,
  Link, RefreshCw, Flame, Clock, DollarSign,
  AlertTriangle, BarChart2, ChevronDown, ChevronUp,
} from 'lucide-react'

interface LeadCaliente {
  id: number
  nombre: string
  valor: number
  etapa: string
  responsable: string
  diasAbierto: number
  ultimaActividad: number | null
}

interface LeadFrio {
  id: number
  nombre: string
  valor: number
  etapa: string
  responsable: string
  diasSinActividad: number
}

interface EtapaEmbudo {
  etapa: string
  count: number
  valor: number
  pipeline: string
}

interface Vendedor {
  nombre: string
  leads: number
  valor: number
  ganados: number
}

interface Metrics {
  totalLeads: number
  ganados: number
  perdidos: number
  enProceso: number
  conversionPct: number
  valorGanado: number
  valorPipeline: number
  ticketPromedio: number
  calientes: number
  velocidad: number | null
  totalLeadsAnterior: number
  ganadosAnterior: number
  perdidosAnterior: number
  conversionPctAnterior: number
  valorGanadoAnterior: number
  leadsCalientes: LeadCaliente[]
  leadsFrios: LeadFrio[]
  embudo: EtapaEmbudo[]
  ranking: Vendedor[]
}

function fmtARS(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-AR')}`
}

function Delta({ curr, prev, invert = false }: { curr: number; prev: number; invert?: boolean }) {
  if (prev === 0) return null
  const pct = Math.round(((curr - prev) / prev) * 100)
  const up = pct >= 0
  const good = invert ? !up : up
  return (
    <span className={`text-[10px] flex items-center gap-0.5 ${good ? 'text-green-400' : 'text-red-400'}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '+' : ''}{pct}% vs mes ant.
    </span>
  )
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
  const [showEmbudo, setShowEmbudo] = useState(true)
  const [showRanking, setShowRanking] = useState(true)

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
      <PageHeader title="CRM — Kommo" description="Pipeline y métricas comerciales" icon={Users} />
      <div className="text-center py-20 text-text-muted text-sm">Cargando métricas...</div>
    </div>
  )

  if (notConnected) return (
    <div>
      <PageHeader title="CRM — Kommo" description="Pipeline y métricas comerciales" icon={Users} />
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

  const maxEmbudo = Math.max(...metrics.embudo.map(e => e.count), 1)
  const maxRanking = Math.max(...metrics.ranking.map(r => r.valor), 1)

  return (
    <div>
      <PageHeader
        title="CRM — Kommo"
        description="Pipeline y métricas comerciales"
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

      {/* KPIs fila 1 — los números que importan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Pipeline activo</p>
          <p className="text-2xl font-bold text-text-primary">{fmtARS(metrics.valorPipeline)}</p>
          <p className="text-[10px] text-text-muted mt-1">{metrics.enProceso} leads en proceso</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-400" /> Cerrado este mes</p>
          <p className="text-2xl font-bold text-green-400">{fmtARS(metrics.valorGanado)}</p>
          <Delta curr={metrics.valorGanado} prev={metrics.valorGanadoAnterior} />
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" /> Leads calientes</p>
          <p className="text-2xl font-bold text-orange-400">{metrics.calientes}</p>
          <p className="text-[10px] text-text-muted mt-1">cerca del cierre</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Velocidad de cierre</p>
          <p className="text-2xl font-bold text-text-primary">{metrics.velocidad != null ? `${metrics.velocidad}d` : '—'}</p>
          <p className="text-[10px] text-text-muted mt-1">promedio para cerrar</p>
        </div>
      </div>

      {/* KPIs fila 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Leads este mes</p>
          <p className="text-2xl font-bold text-text-primary">{metrics.totalLeads}</p>
          <Delta curr={metrics.totalLeads} prev={metrics.totalLeadsAnterior} />
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Conversión</p>
          <p className="text-2xl font-bold text-text-primary">{metrics.conversionPct}%</p>
          <Delta curr={metrics.conversionPct} prev={metrics.conversionPctAnterior} />
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><BarChart2 className="w-3 h-3" /> Ticket promedio</p>
          <p className="text-2xl font-bold text-text-primary">{metrics.ticketPromedio > 0 ? fmtARS(metrics.ticketPromedio) : '—'}</p>
          <p className="text-[10px] text-text-muted mt-1">por lead cerrado</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> Perdidos</p>
          <p className="text-2xl font-bold text-red-400">{metrics.perdidos}</p>
          <Delta curr={metrics.perdidos} prev={metrics.perdidosAnterior} invert />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Leads calientes */}
        {metrics.leadsCalientes.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5 uppercase tracking-wide">
              <Flame className="w-3.5 h-3.5 text-orange-400" /> Leads calientes — accionables ahora
            </p>
            <div className="space-y-2">
              {metrics.leadsCalientes.map(lead => (
                <div key={lead.id} className="flex items-start justify-between gap-3 bg-orange-500/5 border border-orange-500/10 rounded-lg px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary truncate">{lead.nombre || `Lead #${lead.id}`}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{lead.etapa}</p>
                    {lead.responsable && <p className="text-[10px] text-text-muted">{lead.responsable}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-orange-400">{lead.valor > 0 ? fmtARS(lead.valor) : '—'}</p>
                    <p className="text-[10px] text-text-muted">{lead.diasAbierto}d abierto</p>
                    {lead.ultimaActividad !== null && lead.ultimaActividad > 3 && (
                      <p className="text-[10px] text-yellow-500">{lead.ultimaActividad}d sin actividad</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leads fríos — alertas */}
        {metrics.leadsFrios.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5 uppercase tracking-wide">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Abandonados — +14 días sin actividad
            </p>
            <div className="space-y-2">
              {metrics.leadsFrios.map(lead => (
                <div key={lead.id} className="flex items-start justify-between gap-3 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary truncate">{lead.nombre || `Lead #${lead.id}`}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{lead.etapa}</p>
                    {lead.responsable && <p className="text-[10px] text-text-muted">{lead.responsable}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold text-text-primary">{lead.valor > 0 ? fmtARS(lead.valor) : '—'}</p>
                    <p className="text-[10px] text-red-400 font-semibold">{lead.diasSinActividad}d sin mover</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Embudo con valor ARS por etapa */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <button onClick={() => setShowEmbudo(s => !s)} className="flex items-center justify-between w-full mb-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-accent" /> Embudo — leads y valor por etapa
          </p>
          {showEmbudo ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
        </button>
        {showEmbudo && (
          <div className="space-y-2">
            {metrics.embudo.map(({ etapa, count, valor }) => {
              const pct = Math.round((count / maxEmbudo) * 100)
              return (
                <div key={etapa} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-44 flex-shrink-0 truncate" title={etapa}>{etapa}</span>
                  <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-text-primary w-6 text-right flex-shrink-0">{count}</span>
                  <span className="text-[10px] text-text-muted w-16 text-right flex-shrink-0">{valor > 0 ? fmtARS(valor) : '—'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ranking por vendedor */}
      {metrics.ranking.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <button onClick={() => setShowRanking(s => !s)} className="flex items-center justify-between w-full mb-3">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-accent" /> Performance por vendedor
            </p>
            {showRanking ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
          </button>
          {showRanking && (
            <div className="space-y-2.5">
              {metrics.ranking.map(({ nombre, leads, valor, ganados }, i) => (
                <div key={nombre} className="flex items-center gap-3">
                  <span className="text-[10px] text-text-muted w-4 flex-shrink-0">{i + 1}</span>
                  <span className="text-xs text-text-secondary flex-shrink-0 w-36 truncate">{nombre}</span>
                  <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.round((valor / maxRanking) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-text-primary w-16 text-right flex-shrink-0">{fmtARS(valor)}</span>
                  <span className="text-[10px] text-text-muted w-20 text-right flex-shrink-0">{leads} leads · {ganados} cerr.</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
