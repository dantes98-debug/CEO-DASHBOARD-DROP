'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatPercent } from '@/lib/utils'
import { Target, Plus, Edit2 } from 'lucide-react'

interface Objetivo {
  id: string
  socio: string
  titulo: string
  descripcion: string | null
  meta: number
  actual: number
  unidad: string | null
  periodo: string | null
  created_at: string
  progreso?: number
}

const SOCIOS = ['Socio 1', 'Socio 2', 'Socio 3']

export default function ObjetivosPage() {
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editModal, setEditModal] = useState<Objetivo | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    socio: SOCIOS[0],
    titulo: '',
    descripcion: '',
    meta: '',
    actual: '0',
    unidad: '',
    periodo: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('objetivos').select('*').order('socio')
    const withProgress = (data || []).map((o) => ({
      ...o,
      progreso: Math.min((Number(o.actual) / Number(o.meta)) * 100, 100),
    }))
    setObjetivos(withProgress)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('objetivos').insert({
      socio: form.socio,
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      meta: Number(form.meta),
      actual: Number(form.actual),
      unidad: form.unidad || null,
      periodo: form.periodo || null,
    })
    await fetchData()
    setModalOpen(false)
    setForm({ socio: SOCIOS[0], titulo: '', descripcion: '', meta: '', actual: '0', unidad: '', periodo: '' })
    setSaving(false)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editModal) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('objetivos').update({ actual: Number((e.target as HTMLFormElement).actual.value) }).eq('id', editModal.id)
    await fetchData()
    setEditModal(null)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este objetivo?')) return
    const supabase = createClient()
    await supabase.from('objetivos').delete().eq('id', id)
    await fetchData()
  }

  const completados = objetivos.filter(o => (o.progreso || 0) >= 100).length
  const pctCompletados = objetivos.length > 0 ? (completados / objetivos.length) * 100 : 0

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return 'bg-green-500'
    if (pct >= 70) return 'bg-blue-500'
    if (pct >= 40) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getProgressTextColor = (pct: number) => {
    if (pct >= 100) return 'text-green-400'
    if (pct >= 70) return 'text-blue-400'
    if (pct >= 40) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <div>
      <PageHeader
        title="Objetivos"
        description="Metas y seguimiento por socio"
        icon={Target}
        action={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo objetivo
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard title="Objetivos completados" value={formatPercent(pctCompletados)} icon={Target} color="green" loading={loading} />
        <MetricCard title="Completados" value={`${completados} / ${objetivos.length}`} icon={Target} color="blue" loading={loading} />
        <MetricCard title="Total objetivos" value={String(objetivos.length)} icon={Target} color="purple" loading={loading} />
      </div>

      {/* Grouped by socio */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-6 animate-pulse">
              <div className="h-5 w-24 bg-border rounded mb-4" />
              <div className="space-y-4">
                {[1, 2].map((j) => (
                  <div key={j} className="h-16 bg-border/30 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {SOCIOS.map((socio) => {
            const socioObjetivos = objetivos.filter(o => o.socio === socio)
            if (socioObjetivos.length === 0) return null

            const socioCompletados = socioObjetivos.filter(o => (o.progreso || 0) >= 100).length

            return (
              <div key={socio} className="bg-card rounded-xl border border-border p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-text-primary">{socio}</h3>
                  <span className="text-sm text-text-secondary">
                    {socioCompletados}/{socioObjetivos.length} completados
                  </span>
                </div>
                <div className="space-y-4">
                  {socioObjetivos.map((obj) => (
                    <div key={obj.id} className="bg-card-hover rounded-lg p-4 border border-border">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{obj.titulo}</p>
                          {obj.descripcion && (
                            <p className="text-xs text-muted mt-0.5">{obj.descripcion}</p>
                          )}
                          {obj.periodo && (
                            <span className="inline-block text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full mt-1">{obj.periodo}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => setEditModal(obj)}
                            className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-card transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(obj.id)}
                            className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <span className="text-xs">×</span>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-border rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${getProgressColor(obj.progreso || 0)}`}
                            style={{ width: `${obj.progreso || 0}%` }}
                          />
                        </div>
                        <div className="text-right min-w-fit">
                          <span className={`text-sm font-semibold ${getProgressTextColor(obj.progreso || 0)}`}>
                            {formatPercent(obj.progreso || 0)}
                          </span>
                          <p className="text-xs text-muted mt-0.5">
                            {Number(obj.actual).toLocaleString()} / {Number(obj.meta).toLocaleString()}
                            {obj.unidad ? ` ${obj.unidad}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {objetivos.length === 0 && (
            <div className="bg-card rounded-xl border border-border p-12 text-center text-text-secondary">
              No hay objetivos registrados
            </div>
          )}
        </div>
      )}

      {/* New objective modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo objetivo">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Socio</label>
            <select value={form.socio} onChange={(e) => setForm({ ...form, socio: e.target.value })}>
              {SOCIOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Título</label>
            <input type="text" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Conseguir 10 nuevos clientes" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción del objetivo..." rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Meta</label>
              <input type="number" min="0" step="any" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} placeholder="100" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Actual</label>
              <input type="number" min="0" step="any" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Unidad</label>
              <input type="text" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="Ej: clientes, $, kg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Período</label>
              <input type="text" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} placeholder="Ej: Q1 2025, Anual" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit progress modal */}
      {editModal && (
        <Modal isOpen={true} onClose={() => setEditModal(null)} title={`Actualizar: ${editModal.titulo}`} size="sm">
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Progreso actual {editModal.unidad ? `(${editModal.unidad})` : ''}
              </label>
              <input
                name="actual"
                type="number"
                min="0"
                step="any"
                defaultValue={editModal.actual}
                placeholder={String(editModal.meta)}
                required
              />
              <p className="text-xs text-muted mt-1">Meta: {Number(editModal.meta).toLocaleString()} {editModal.unidad || ''}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditModal(null)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Actualizar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
