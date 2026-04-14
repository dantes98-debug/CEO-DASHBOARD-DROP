'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatDate, getCurrentMonthRange, getMonthName } from '@/lib/utils'
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Clock, MapPin, User, RefreshCw, CheckSquare, ExternalLink } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

interface Reunion {
  id: string
  fecha: string
  titulo: string
  socio: string
  tipo: string | null
  notas: string | null
  created_at: string
}

interface CalendlyEventEnriched {
  uuid: string
  name: string
  start_time: string
  end_time: string
  location: string | null
  invitees: { name: string; email: string }[]
}

interface NotionTask {
  id: string
  url: string
  titulo: string
  fecha_start: string | null
  fecha_end: string | null
  estado: string | null
  prioridad: string | null
  area: string | null
  notas: string | null
}

const SOCIOS = ['Socio 1', 'Socio 2', 'Socio 3']
const TIPOS = ['Interna', 'Cliente', 'Proveedor', 'Estudio', 'Otro']
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b']

function toDateART(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function formatTimeART(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDateART(isoString: string): string {
  return new Date(isoString).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

export default function ReunionesPage() {
  const [reuniones, setReuniones] = useState<Reunion[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    titulo: '',
    socio: SOCIOS[0],
    tipo: TIPOS[0],
    notas: '',
  })

  // Calendly state
  const [calendlyDate, setCalendlyDate] = useState<string>(toDateART(new Date()))
  const [calendlyEvents, setCalendlyEvents] = useState<CalendlyEventEnriched[]>([])
  const [calendlyLoading, setCalendlyLoading] = useState(false)
  const [calendlyError, setCalendlyError] = useState<string | null>(null)

  // Notion state
  const [notionTasks, setNotionTasks] = useState<NotionTask[]>([])
  const [notionLoading, setNotionLoading] = useState(false)
  const [notionError, setNotionError] = useState<string | null>(null)

  const fetchNotion = useCallback(async (date: string) => {
    setNotionLoading(true)
    setNotionError(null)
    try {
      const res = await fetch(`/api/notion/tasks?date=${date}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setNotionTasks(data.tasks || [])
    } catch (e) {
      setNotionError((e as Error).message)
      setNotionTasks([])
    } finally {
      setNotionLoading(false)
    }
  }, [])

  const fetchCalendly = useCallback(async (date: string) => {
    setCalendlyLoading(true)
    setCalendlyError(null)
    try {
      const res = await fetch(`/api/calendly/events?date=${date}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setCalendlyEvents(data.events || [])
    } catch (e) {
      setCalendlyError((e as Error).message)
      setCalendlyEvents([])
    } finally {
      setCalendlyLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchCalendly(calendlyDate)
    fetchNotion(calendlyDate)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('reuniones').select('*').order('fecha', { ascending: false })
    setReuniones(data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('reuniones').insert({
      fecha: form.fecha,
      titulo: form.titulo,
      socio: form.socio,
      tipo: form.tipo || null,
      notas: form.notas || null,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ fecha: new Date().toISOString().split('T')[0], titulo: '', socio: SOCIOS[0], tipo: TIPOS[0], notas: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta reunión?')) return
    const supabase = createClient()
    await supabase.from('reuniones').delete().eq('id', id)
    await fetchData()
  }

  const changeDate = (delta: number) => {
    const newDate = addDays(calendlyDate, delta)
    setCalendlyDate(newDate)
    fetchCalendly(newDate)
    fetchNotion(newDate)
  }

  const today = toDateART(new Date())
  const isToday = calendlyDate === today

  const { start, end } = getCurrentMonthRange()
  const reunionesMes = reuniones.filter(r => r.fecha >= start && r.fecha <= end).length

  // By socio
  const bySocio: Record<string, number> = {}
  reuniones.forEach(r => { bySocio[r.socio] = (bySocio[r.socio] || 0) + 1 })
  const socioData = Object.entries(bySocio).map(([name, value]) => ({ name, value }))

  // By month
  const byMonth: Record<string, number> = {}
  reuniones.forEach(r => {
    const month = parseInt(r.fecha.slice(5, 7))
    const key = getMonthName(month)
    byMonth[key] = (byMonth[key] || 0) + 1
  })
  const monthData = Object.entries(byMonth).map(([mes, count]) => ({ mes, count }))

  const columns = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v: unknown) => formatDate(v as string),
    },
    { key: 'titulo', label: 'Título' },
    { key: 'socio', label: 'Socio' },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v: unknown) => v ? (
        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">{String(v)}</span>
      ) : <span className="text-muted">—</span>,
    },
    {
      key: 'notas',
      label: 'Notas',
      render: (v: unknown) => v ? (
        <span className="truncate max-w-xs block text-muted text-sm">{String(v)}</span>
      ) : <span className="text-muted">—</span>,
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Reunion) => (
        <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Reuniones"
        description="Registro de reuniones por socio"
        icon={CalendarDays}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar reunión
          </button>
        }
      />

      {/* Calendly Section */}
      <div className="bg-card rounded-xl border border-border p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">Agenda Calendly</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCalendly(calendlyDate)}
              className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-card-hover transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${calendlyLoading ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex items-center gap-1 bg-background rounded-lg border border-border">
              <button
                onClick={() => changeDate(-1)}
                className="p-1.5 text-muted hover:text-text-primary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setCalendlyDate(today)
                  fetchCalendly(today)
                  fetchNotion(today)
                }}
                className={`px-3 py-1 text-sm font-medium transition-colors ${isToday ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {isToday ? 'Hoy' : calendlyDate}
              </button>
              <button
                onClick={() => changeDate(1)}
                className="p-1.5 text-muted hover:text-text-primary transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {!isToday && (
          <p className="text-sm text-muted mb-4 capitalize">{formatDateART(`${calendlyDate}T12:00:00-03:00`)}</p>
        )}

        {calendlyLoading ? (
          <div className="flex items-center justify-center py-10 text-muted text-sm">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            Cargando agenda...
          </div>
        ) : calendlyError ? (
          <div className="text-center py-8 text-red-400 text-sm">{calendlyError}</div>
        ) : calendlyEvents.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm">
            No hay reuniones programadas {isToday ? 'para hoy' : 'este día'}
          </div>
        ) : (
          <div className="space-y-3">
            {calendlyEvents.map((ev) => (
              <div key={ev.uuid} className="flex gap-4 p-4 rounded-xl bg-background border border-border hover:border-accent/30 transition-colors">
                {/* Time column */}
                <div className="flex flex-col items-center min-w-[56px]">
                  <span className="text-sm font-semibold text-accent">{formatTimeART(ev.start_time)}</span>
                  <div className="w-px flex-1 bg-border my-1" />
                  <span className="text-xs text-muted">{formatTimeART(ev.end_time)}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary mb-2">{ev.name}</p>

                  {/* Invitees */}
                  {ev.invitees.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {ev.invitees.map((inv, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-text-secondary">
                          <User className="w-3 h-3 text-muted" />
                          <span>{inv.name}</span>
                          <span className="text-muted">({inv.email})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Location */}
                  {ev.location && (
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <MapPin className="w-3 h-3" />
                      {ev.location.startsWith('http') ? (
                        <a href={ev.location} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate">
                          {ev.location.includes('zoom') ? 'Zoom' : ev.location.includes('meet') ? 'Google Meet' : 'Ver enlace'}
                        </a>
                      ) : (
                        <span className="truncate">{ev.location}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Duration badge */}
                <div className="flex items-start">
                  <span className="text-xs text-muted bg-card-hover px-2 py-0.5 rounded-full whitespace-nowrap">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {Math.round((new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 60000)} min
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notion Tasks Section */}
      <div className="bg-card rounded-xl border border-border p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">Tareas del día — Notion</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://www.notion.so/30c92612f49380218a7fd0d9f0528d58?v=30c92612f4938090a5eb000c5230af61"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-card-hover border border-border transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir en Notion
            </a>
            <button
              onClick={() => fetchNotion(calendlyDate)}
              className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-card-hover transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${notionLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {notionLoading ? (
          <div className="flex items-center justify-center py-8 text-muted text-sm">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            Cargando tareas...
          </div>
        ) : notionError ? (
          <div className="text-center py-6 text-red-400 text-sm">{notionError}</div>
        ) : notionTasks.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm">
            No hay tareas para {isToday ? 'hoy' : 'este día'}
          </div>
        ) : (
          <div className="space-y-2">
            {notionTasks.map((task) => {
              const prioColor = task.prioridad?.includes('Alta') ? 'text-red-400 bg-red-400/10'
                : task.prioridad?.includes('Media') ? 'text-yellow-400 bg-yellow-400/10'
                : 'text-green-400 bg-green-400/10'
              return (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl bg-background border border-border hover:border-accent/30 transition-colors">
                  <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-accent" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-text-primary">{task.titulo}</p>
                      <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-accent transition-colors flex-shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {task.estado && (
                        <span className="text-xs text-muted bg-card-hover px-2 py-0.5 rounded-full">{task.estado}</span>
                      )}
                      {task.prioridad && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${prioColor}`}>{task.prioridad}</span>
                      )}
                      {task.area && (
                        <span className="text-xs text-muted">{task.area}</span>
                      )}
                    </div>
                    {task.notas && (
                      <p className="text-xs text-muted mt-1 truncate">{task.notas}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <MetricCard title="Reuniones este mes" value={String(reunionesMes)} icon={CalendarDays} color="blue" loading={loading} />
        <MetricCard title="Total reuniones" value={String(reuniones.length)} icon={CalendarDays} color="purple" loading={loading} />
      </div>

      {(monthData.length > 0 || socioData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {monthData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-base font-semibold text-text-primary mb-6">Reuniones por mes</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: number) => [value, 'Reuniones']}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {socioData.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="text-base font-semibold text-text-primary mb-6">Por socio</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={socioData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                    {socioData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    formatter={(value: number) => [value, 'Reuniones']}
                  />
                  <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <DataTable
        columns={columns as never}
        data={reuniones as never}
        loading={loading}
        emptyMessage="No hay reuniones registradas"
      />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva reunión">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Título</label>
            <input type="text" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Reunión con Estudio García" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Socio</label>
              <select value={form.socio} onChange={(e) => setForm({ ...form, socio: e.target.value })}>
                {SOCIOS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas</label>
            <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas o resumen de la reunión..." rows={3} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
