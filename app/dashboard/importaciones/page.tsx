'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Ship, Plus, FileText, DollarSign, Upload, Download } from 'lucide-react'

type EstadoImport = 'pendiente' | 'en_transito' | 'en_aduana' | 'recibido' | 'cancelado'

interface Importacion {
  id: string
  proveedor: string
  fecha_pedido: string
  fecha_estimada: string | null
  fecha_llegada: string | null
  estado: EstadoImport
  monto_usd: number
  tipo_cambio: number | null
  monto_ars: number | null
  arancel_pct: number
  arancel_monto: number
  flete: number
  otros_gastos: number
  costo_total_usd: number
  numero_invoice: string | null
  descripcion: string | null
  archivo_url: string | null
  notas: string | null
  created_at: string
}

const ESTADO_LABEL: Record<EstadoImport, string> = {
  pendiente: 'Pendiente',
  en_transito: 'En tránsito',
  en_aduana: 'En aduana',
  recibido: 'Recibido',
  cancelado: 'Cancelado',
}

const ESTADO_COLOR: Record<EstadoImport, string> = {
  pendiente: 'bg-yellow-400/10 text-yellow-400',
  en_transito: 'bg-blue-400/10 text-blue-400',
  en_aduana: 'bg-orange-400/10 text-orange-400',
  recibido: 'bg-green-400/10 text-green-400',
  cancelado: 'bg-red-400/10 text-red-400',
}

const FORM_DEFAULT = {
  proveedor: '',
  fecha_pedido: new Date().toISOString().split('T')[0],
  fecha_estimada: '',
  fecha_llegada: '',
  estado: 'pendiente' as EstadoImport,
  monto_usd: '',
  tipo_cambio: '',
  arancel_pct: '',
  arancel_monto: '',
  flete: '',
  otros_gastos: '',
  numero_invoice: '',
  descripcion: '',
  notas: '',
}

export default function ImportacionesPage() {
  const [importaciones, setImportaciones] = useState<Importacion[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Importacion | null>(null)
  const [form, setForm] = useState(FORM_DEFAULT)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('importaciones').select('*').order('fecha_pedido', { ascending: false })
    setImportaciones(data || [])
    setLoading(false)
  }

  const openNew = () => {
    setEditTarget(null)
    setForm(FORM_DEFAULT)
    setFile(null)
    setMsg(null)
    setModalOpen(true)
  }

  const openEdit = (imp: Importacion) => {
    setEditTarget(imp)
    setForm({
      proveedor: imp.proveedor,
      fecha_pedido: imp.fecha_pedido,
      fecha_estimada: imp.fecha_estimada || '',
      fecha_llegada: imp.fecha_llegada || '',
      estado: imp.estado,
      monto_usd: String(imp.monto_usd),
      tipo_cambio: imp.tipo_cambio ? String(imp.tipo_cambio) : '',
      arancel_pct: imp.arancel_pct ? String(imp.arancel_pct) : '',
      arancel_monto: imp.arancel_monto ? String(imp.arancel_monto) : '',
      flete: imp.flete ? String(imp.flete) : '',
      otros_gastos: imp.otros_gastos ? String(imp.otros_gastos) : '',
      numero_invoice: imp.numero_invoice || '',
      descripcion: imp.descripcion || '',
      notas: imp.notas || '',
    })
    setFile(null)
    setMsg(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const supabase = createClient()

    let archivo_url = editTarget?.archivo_url || null
    if (file) {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('invoices').upload(path, file)
      if (uploadError) { setMsg('Error al subir el archivo'); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(path)
      archivo_url = publicUrl
    }

    const payload = {
      proveedor: form.proveedor,
      fecha_pedido: form.fecha_pedido,
      fecha_estimada: form.fecha_estimada || null,
      fecha_llegada: form.fecha_llegada || null,
      estado: form.estado,
      monto_usd: Number(form.monto_usd) || 0,
      tipo_cambio: form.tipo_cambio ? Number(form.tipo_cambio) : null,
      arancel_pct: Number(form.arancel_pct) || 0,
      arancel_monto: Number(form.arancel_monto) || 0,
      flete: Number(form.flete) || 0,
      otros_gastos: Number(form.otros_gastos) || 0,
      numero_invoice: form.numero_invoice || null,
      descripcion: form.descripcion || null,
      notas: form.notas || null,
      archivo_url,
    }

    if (editTarget) {
      await supabase.from('importaciones').update(payload).eq('id', editTarget.id)
    } else {
      await supabase.from('importaciones').insert(payload)
    }

    await fetchData()
    setModalOpen(false)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta importación?')) return
    const supabase = createClient()
    await supabase.from('importaciones').delete().eq('id', id)
    await fetchData()
  }

  const activas = importaciones.filter(i => i.estado !== 'cancelado')
  const enTransito = importaciones.filter(i => i.estado === 'en_transito').length
  const enAduana = importaciones.filter(i => i.estado === 'en_aduana').length
  const montoTotalUsd = activas.reduce((s, i) => s + Number(i.monto_usd), 0)
  const costoTotalUsd = activas.reduce((s, i) => s + Number(i.costo_total_usd), 0)

  return (
    <div>
      <PageHeader
        title="Importaciones"
        description="Seguimiento de compras al exterior"
        icon={Ship}
        action={
          <button onClick={openNew} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Nueva importación
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard title="Total importaciones" value={String(importaciones.length)} icon={Ship} color="blue" loading={loading} />
        <MetricCard title="En tránsito" value={String(enTransito)} icon={Ship} color="yellow" loading={loading} />
        <MetricCard title="En aduana" value={String(enAduana)} icon={FileText} color="red" loading={loading} />
        <MetricCard title="Monto total USD" value={`USD ${montoTotalUsd.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} icon={DollarSign} color="green" loading={loading} />
      </div>

      {!loading && importaciones.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Ship className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium mb-1">Sin importaciones registradas</p>
          <p className="text-sm text-muted">Registrá tus importaciones para hacer seguimiento de estado, costos y documentos.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted font-medium">Proveedor</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Estado</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">F. Pedido</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">F. Estimada</th>
                  <th className="text-right py-3 px-4 text-muted font-medium">Monto USD</th>
                  <th className="text-right py-3 px-4 text-muted font-medium">Costo total</th>
                  <th className="text-center py-3 px-4 text-muted font-medium">Invoice</th>
                  <th className="text-center py-3 px-4 text-muted font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {importaciones.map((imp) => (
                  <tr key={imp.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    <td className="py-3 px-4 font-medium text-text-primary">
                      {imp.proveedor}
                      {imp.descripcion && <p className="text-xs text-muted font-normal truncate max-w-[160px]">{imp.descripcion}</p>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[imp.estado]}`}>
                        {ESTADO_LABEL[imp.estado]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-text-secondary">{formatDate(imp.fecha_pedido)}</td>
                    <td className="py-3 px-4 text-text-secondary">{imp.fecha_estimada ? formatDate(imp.fecha_estimada) : <span className="text-muted">—</span>}</td>
                    <td className="py-3 px-4 text-right font-semibold">USD {Number(imp.monto_usd).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold">USD {Number(imp.costo_total_usd).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                      {imp.tipo_cambio && (
                        <p className="text-xs text-muted">≈ {formatCurrency(Number(imp.costo_total_usd) * Number(imp.tipo_cambio))}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {imp.archivo_url ? (
                        <a href={imp.archivo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors">
                          <Download className="w-3.5 h-3.5" />
                          {imp.numero_invoice || 'Ver'}
                        </a>
                      ) : (
                        <span className="text-muted text-xs">{imp.numero_invoice || '—'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(imp)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Editar</button>
                        <button onClick={() => handleDelete(imp.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-card-hover/30">
                  <td colSpan={4} className="py-3 px-4 font-bold text-text-primary">Total activo</td>
                  <td className="py-3 px-4 text-right font-bold text-text-primary">USD {montoTotalUsd.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                  <td className="py-3 px-4 text-right font-bold text-text-primary">USD {costoTotalUsd.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Editar importación' : 'Nueva importación'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Proveedor *</label>
              <input type="text" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} placeholder="Ej: Proveedor China, Importadora XYZ" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de pedido *</label>
              <input type="date" value={form.fecha_pedido} onChange={(e) => setForm({ ...form, fecha_pedido: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha estimada llegada</label>
              <input type="date" value={form.fecha_estimada} onChange={(e) => setForm({ ...form, fecha_estimada: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de llegada real</label>
              <input type="date" value={form.fecha_llegada} onChange={(e) => setForm({ ...form, fecha_llegada: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Estado</label>
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoImport })}>
                {(Object.keys(ESTADO_LABEL) as EstadoImport[]).map((k) => (
                  <option key={k} value={k}>{ESTADO_LABEL[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Costos</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto USD *</label>
                <input type="number" min="0" step="0.01" value={form.monto_usd} onChange={(e) => setForm({ ...form, monto_usd: e.target.value })} placeholder="0.00" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo de cambio (ARS)</label>
                <input type="number" min="0" step="0.01" value={form.tipo_cambio} onChange={(e) => setForm({ ...form, tipo_cambio: e.target.value })} placeholder="Ej: 1200" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Arancel %</label>
                <input type="number" min="0" max="100" step="0.01" value={form.arancel_pct} onChange={(e) => setForm({ ...form, arancel_pct: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Arancel monto USD</label>
                <input type="number" min="0" step="0.01" value={form.arancel_monto} onChange={(e) => setForm({ ...form, arancel_monto: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Flete USD</label>
                <input type="number" min="0" step="0.01" value={form.flete} onChange={(e) => setForm({ ...form, flete: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Otros gastos USD</label>
                <input type="number" min="0" step="0.01" value={form.otros_gastos} onChange={(e) => setForm({ ...form, otros_gastos: e.target.value })} placeholder="0.00" />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Documentación</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Número de invoice</label>
                <input type="text" value={form.numero_invoice} onChange={(e) => setForm({ ...form, numero_invoice: e.target.value })} placeholder="Ej: INV-2024-001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Archivo (PDF/imagen)</label>
                <label className="flex items-center gap-2 cursor-pointer border border-border rounded-lg px-3 py-2 hover:bg-card-hover transition-colors text-sm text-text-secondary">
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{file ? file.name : editTarget?.archivo_url ? 'Cambiar archivo' : 'Subir archivo'}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                {editTarget?.archivo_url && !file && (
                  <a href={editTarget.archivo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline mt-1 block">Ver archivo actual</a>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción</label>
                <input type="text" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Griferías de cocina modelo X" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas</label>
                <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas adicionales..." rows={2} />
              </div>
            </div>
          </div>

          {msg && <p className="text-sm text-red-400">{msg}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
