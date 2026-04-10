'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatDate, getCurrentMonthRange, getMonthName } from '@/lib/utils'
import { CalendarDays, Plus } from 'lucide-react'
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

const SOCIOS = ['Socio 1', 'Socio 2', 'Socio 3']
const TIPOS = ['Interna', 'Cliente', 'Proveedor', 'Estudio', 'Otro']
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b']

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

  useEffect(() => {
    fetchData()
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

  const { start, end } = getCurrentMonthRange()
  const reunionesMes = reuniones.filter(r => r.fecha >= start && r.fecha <= end).length

  // By socio
  const bySocio: Record<string, number> = {}
  reuniones.forEach(r => {
    bySocio[r.socio] = (bySocio[r.socio] || 0) + 1
  })
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
