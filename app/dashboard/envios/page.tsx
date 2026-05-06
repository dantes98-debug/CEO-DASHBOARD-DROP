'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/lib/profile-context'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Truck, Package, CheckCircle, Clock, Camera, AlertCircle,
  Search, ThumbsUp, Plus, X, MapPin, User, MessageSquare,
} from 'lucide-react'

interface ItemFactura {
  sku: string
  descripcion: string
  cantidad: number
}

interface VentaInfo {
  id: string
  fecha: string
  razon_social: string | null
  numero_factura: string | null
  monto_ars: number | null
  items: ItemFactura[] | null
}

interface Envio {
  id: string
  venta_id: string
  numero_envio: string | null
  estado: 'en_preparacion' | 'preparado' | 'aprobado' | 'en_camino' | 'entregado'
  items_enviados: { sku: string; descripcion: string; cantidad_total: number }[] | null
  fecha_envio: string | null
  transportista: string | null
  notas_almacen: string | null
  foto_preparacion: string | null
  foto_remito: string | null
  direccion: string | null
  receptor: string | null
  aprobado_en: string | null
  fecha_estimada_envio: string | null
  sale_hoy: boolean
  created_at: string
}

interface EnvioConVenta extends Envio {
  venta: VentaInfo | null
}

type EstadoEnvio = Envio['estado']

const ESTADO_CFG: Record<EstadoEnvio, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  en_preparacion: { label: 'En preparación', color: 'text-yellow-400',  bg: 'bg-yellow-400/10',  Icon: Clock        },
  preparado:      { label: 'Preparado',       color: 'text-blue-400',    bg: 'bg-blue-400/10',    Icon: Package      },
  aprobado:       { label: 'Aprobado',        color: 'text-purple-400',  bg: 'bg-purple-400/10',  Icon: ThumbsUp     },
  en_camino:      { label: 'En camino',       color: 'text-orange-400',  bg: 'bg-orange-400/10',  Icon: Truck        },
  entregado:      { label: 'Entregado',       color: 'text-green-400',   bg: 'bg-green-400/10',   Icon: CheckCircle  },
}

const TRANSPORTISTAS = ['Retiro Drop', 'Retiro MOTIC', 'OCA', 'Andreani', 'Correo Argentino', 'Otro']

export default function EnviosPage() {
  const profile = useProfile()
  const [envios, setEnvios] = useState<EnvioConVenta[]>([])
  const [ventasSinEnvio, setVentasSinEnvio] = useState<VentaInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Admin filters
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<string>('todos')

  // "Preparar / editar" modal
  const [preparandoVenta, setPreparandoVenta] = useState<VentaInfo | null>(null)
  const [editingEnvio, setEditingEnvio] = useState<EnvioConVenta | null>(null)
  const [formNotas, setFormNotas] = useState('')
  const [formDireccion, setFormDireccion] = useState('')
  const [formReceptor, setFormReceptor] = useState('')
  const [formTransportista, setFormTransportista] = useState('')
  const [saving, setSaving] = useState(false)

  // Pick venta modal (for admin "Nuevo envío")
  const [pickVentaOpen, setPickVentaOpen] = useState(false)
  const [pickSearch, setPickSearch] = useState('')

  // Warehouse: confirm envío modal
  const [confirmTarget, setConfirmTarget] = useState<EnvioConVenta | null>(null)
  const [formSaleHoy, setFormSaleHoy] = useState(true)
  const [formFechaEstimada, setFormFechaEstimada] = useState('')

  // Photo upload
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadCtx = useRef<{ envioId: string; tipo: 'preparacion' | 'remito' } | null>(null)

  // Photo preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient()

      const { data: enviosData } = await supabase
        .from('envios')
        .select('*')
        .order('created_at', { ascending: false })

      if (!enviosData) { setLoading(false); return }

      const ventaIds = Array.from(new Set(enviosData.map(e => e.venta_id).filter(Boolean)))
      const { data: ventasData } = ventaIds.length > 0
        ? await supabase.from('ventas').select('id, fecha, razon_social, numero_factura, monto_ars, items').in('id', ventaIds)
        : { data: [] as VentaInfo[] }

      const ventasMap = new Map((ventasData || []).map(v => [v.id, v as VentaInfo]))
      const joined: EnvioConVenta[] = enviosData.map(e => ({ ...e, venta: ventasMap.get(e.venta_id) ?? null }))
      setEnvios(joined)

      const withEnvio = new Set(enviosData.map(e => e.venta_id))
      const { data: todasVentas } = await supabase
        .from('ventas')
        .select('id, fecha, razon_social, numero_factura, monto_ars, items')
        .order('fecha', { ascending: false })
        .limit(300)
      setVentasSinEnvio((todasVentas || []).filter(v => !withEnvio.has(v.id)) as VentaInfo[])
    } catch (e) {
      console.error('fetchData error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const isAdmin = profile?.role === 'admin'

  // ─── Notifications ────────────────────────────────────────────────────────

  const notifyAdmins = async (texto: string) => {
    if (!profile) return
    const supabase = createClient()
    const { data: admins } = await supabase.from('user_profiles').select('id').eq('role', 'admin')
    for (const a of admins || []) {
      if (a.id === profile.id) continue
      await supabase.from('mensajes').insert({ de_id: profile.id, para_id: a.id, texto })
    }
  }

  const notifyWarehouse = async (texto: string) => {
    if (!profile) return
    const supabase = createClient()
    const { data: users } = await supabase.from('user_profiles').select('id, role, permisos').neq('role', 'admin')
    for (const u of users || []) {
      if (u.permisos?.envios) {
        await supabase.from('mensajes').insert({ de_id: profile.id, para_id: u.id, texto })
      }
    }
  }

  // ─── Photo upload ─────────────────────────────────────────────────────────

  const triggerUpload = (envioId: string, tipo: 'preparacion' | 'remito') => {
    uploadCtx.current = { envioId, tipo }
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const ctx = uploadCtx.current
    if (!file || !ctx) return
    e.target.value = ''

    setUploadingId(ctx.envioId)
    const supabase = createClient()
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${ctx.envioId}/${ctx.tipo}_${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from('envios').upload(path, file, { upsert: true })
    if (upErr) { toast.error('Error al subir foto'); setUploadingId(null); return }

    const { data: { publicUrl } } = supabase.storage.from('envios').getPublicUrl(path)
    const field = ctx.tipo === 'preparacion' ? 'foto_preparacion' : 'foto_remito'
    const nuevoEstado = ctx.tipo === 'preparacion' ? 'preparado' : 'entregado'

    const { error: updErr } = await supabase.from('envios').update({ [field]: publicUrl, estado: nuevoEstado }).eq('id', ctx.envioId)
    if (updErr) {
      toast.error('Error al actualizar')
    } else {
      if (ctx.tipo === 'preparacion') {
        const envio = envios.find(e => e.id === ctx.envioId)
        const label = envio?.venta?.razon_social || envio?.numero_envio || 'un envío'
        await notifyAdmins(`📦 ${label} está listo para aprobar`)
        toast.success('Foto subida — aguardando aprobación del CEO')
      } else {
        toast.success('Remito subido — envío entregado ✓')
      }
      await fetchData()
    }
    setUploadingId(null)
  }

  // ─── Admin: guardar preparar/editar ──────────────────────────────────────

  const openPreparar = (venta: VentaInfo) => {
    setPreparandoVenta(venta)
    setEditingEnvio(null)
    setFormNotas('')
    setFormDireccion('')
    setFormReceptor('')
    setFormTransportista('')
    setPickVentaOpen(false)
  }

  const openEditar = (envio: EnvioConVenta) => {
    setEditingEnvio(envio)
    setPreparandoVenta(null)
    setFormNotas(envio.notas_almacen || '')
    setFormDireccion(envio.direccion || '')
    setFormReceptor(envio.receptor || '')
    setFormTransportista(envio.transportista || '')
  }

  const handleGuardarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const payload = {
      notas_almacen: formNotas || null,
      direccion: formDireccion || null,
      receptor: formReceptor || null,
      transportista: formTransportista || null,
    }

    if (editingEnvio) {
      const { error } = await supabase.from('envios').update(payload).eq('id', editingEnvio.id)
      if (error) { toast.error('Error al guardar'); setSaving(false); return }
      toast.success('Envío actualizado')
      setEditingEnvio(null)
    } else if (preparandoVenta) {
      const items = (preparandoVenta.items || []).map(item => ({
        sku: item.sku, descripcion: item.descripcion, cantidad_total: item.cantidad,
      }))
      const { error } = await supabase.from('envios').insert({
        venta_id: preparandoVenta.id,
        estado: 'en_preparacion',
        items_enviados: items.length > 0 ? items : null,
        ...payload,
      })
      if (error) { toast.error('Error al crear envío'); setSaving(false); return }
      toast.success('Envío enviado al almacén — en preparación')
      setPreparandoVenta(null)
    }

    setSaving(false)
    await fetchData()
  }

  // ─── Admin: aprobar ───────────────────────────────────────────────────────

  const handleAprobar = async (envio: EnvioConVenta) => {
    const supabase = createClient()
    const { error } = await supabase.from('envios')
      .update({ estado: 'aprobado', aprobado_en: new Date().toISOString() })
      .eq('id', envio.id)
    if (error) { toast.error('Error al aprobar'); return }
    const label = envio.venta?.razon_social || envio.numero_envio || 'el envío'
    await notifyWarehouse(`✅ ${label} fue aprobado — puede salir`)
    toast.success('Envío aprobado — almacén notificado')
    await fetchData()
  }

  // ─── Warehouse: confirmar envío (aprobado → en_camino) ───────────────────

  const handleConfirmarEnvio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmTarget) return
    const supabase = createClient()
    const { error } = await supabase.from('envios').update({
      estado: 'en_camino',
      sale_hoy: formSaleHoy,
      fecha_estimada_envio: formSaleHoy
        ? new Date().toISOString().split('T')[0]
        : (formFechaEstimada || null),
    }).eq('id', confirmTarget.id)
    if (error) { toast.error('Error'); return }
    const label = confirmTarget.venta?.razon_social || confirmTarget.numero_envio || 'Envío'
    await notifyAdmins(`🚚 ${label} salió${formSaleHoy ? ' hoy' : formFechaEstimada ? ` el ${formFechaEstimada}` : ''}`)
    toast.success('Salida confirmada — en camino')
    setConfirmTarget(null)
    await fetchData()
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const enviosFiltrados = envios.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q
      || e.venta?.razon_social?.toLowerCase().includes(q)
      || e.venta?.numero_factura?.toLowerCase().includes(q)
      || (e.numero_envio || '').toLowerCase().includes(q)
    const matchEstado = filterEstado === 'todos' || e.estado === filterEstado
    return matchSearch && matchEstado
  })

  const enviosAlmacen = envios.filter(e => ['en_preparacion', 'preparado', 'aprobado', 'en_camino'].includes(e.estado))

  const counts = (Object.keys(ESTADO_CFG) as EstadoEnvio[]).reduce((acc, k) => {
    acc[k] = envios.filter(e => e.estado === k).length
    return acc
  }, {} as Record<EstadoEnvio, number>)

  const modalOpen = !!preparandoVenta || !!editingEnvio
  const modalVenta = preparandoVenta ?? editingEnvio?.venta ?? null
  const modalTitle = editingEnvio ? 'Editar envío' : 'Preparar envío'

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) return (
    <div>
      <PageHeader title="Envíos" description="Gestión de envíos" icon={Truck} />
      <div className="bg-card rounded-xl border border-border p-8 text-center text-muted">Cargando...</div>
    </div>
  )

  // ─── Warehouse View ───────────────────────────────────────────────────────

  if (!isAdmin) return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelected} />
      <PageHeader title="Envíos" description="Pedidos para preparar y despachar" icon={Truck} />

      {enviosAlmacen.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-16 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-text-secondary font-medium text-lg">Todo al día</p>
          <p className="text-muted text-sm mt-1">No hay envíos pendientes por ahora</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {enviosAlmacen.map(envio => {
            const cfg = ESTADO_CFG[envio.estado] ?? ESTADO_CFG.en_preparacion
            const isUploading = uploadingId === envio.id
            return (
              <div key={envio.id} className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-accent text-sm">{envio.numero_envio || '—'}</span>
                    {envio.venta?.numero_factura && (
                      <span className="text-xs text-muted">· {envio.venta.numero_factura}</span>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                    <cfg.Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                </div>

                {/* Body */}
                <div className="p-4 flex-1 space-y-3">
                  {/* Cliente */}
                  <div>
                    <p className="font-semibold text-text-primary text-sm">{envio.venta?.razon_social || '—'}</p>
                    {envio.venta?.fecha && <p className="text-xs text-muted">{formatDate(envio.venta.fecha)}</p>}
                  </div>

                  {/* Items */}
                  {(envio.items_enviados || []).length > 0 && (
                    <div className="space-y-1.5">
                      {(envio.items_enviados || []).map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-5 h-5 rounded bg-accent/10 text-accent font-bold flex items-center justify-center flex-shrink-0">{item.cantidad_total}</span>
                          <span className="text-text-secondary truncate">{item.descripcion}</span>
                          {item.sku && <span className="text-muted font-mono ml-auto flex-shrink-0">{item.sku}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CEO notes */}
                  {envio.notas_almacen && (
                    <div className="rounded-lg bg-yellow-400/5 border border-yellow-400/20 px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <MessageSquare className="w-3 h-3 text-yellow-400" />
                        <span className="text-xs font-semibold text-yellow-400">Nota del CEO</span>
                      </div>
                      <p className="text-xs text-text-secondary">{envio.notas_almacen}</p>
                    </div>
                  )}

                  {/* Address */}
                  {(envio.direccion || envio.receptor) && (
                    <div className="flex gap-2 text-xs text-text-secondary">
                      <MapPin className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5" />
                      <div>
                        {envio.receptor && <p className="font-medium text-text-primary">{envio.receptor}</p>}
                        {envio.direccion && <p>{envio.direccion}</p>}
                      </div>
                    </div>
                  )}

                  {/* Foto preparación preview */}
                  {envio.foto_preparacion && (
                    <button onClick={() => setPreviewUrl(envio.foto_preparacion)}
                      className="block w-full rounded-lg overflow-hidden border border-border hover:border-accent transition-colors">
                      <img src={envio.foto_preparacion} alt="Foto preparación" className="w-full h-28 object-cover" />
                    </button>
                  )}
                </div>

                {/* Action */}
                <div className="px-4 pb-4">
                  {envio.estado === 'en_preparacion' && (
                    <button
                      onClick={() => triggerUpload(envio.id, 'preparacion')}
                      disabled={isUploading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-semibold text-sm transition-colors disabled:opacity-50 border border-blue-500/20"
                    >
                      <Camera className="w-5 h-5" />
                      {isUploading ? 'Subiendo...' : 'Subir foto del pedido'}
                    </button>
                  )}

                  {envio.estado === 'preparado' && (
                    <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500/5 text-blue-300 text-sm border border-blue-500/20">
                      <Clock className="w-4 h-4" />
                      Foto enviada — esperando aprobación
                    </div>
                  )}

                  {envio.estado === 'aprobado' && (
                    <button
                      onClick={() => {
                        setConfirmTarget(envio)
                        setFormSaleHoy(true)
                        setFormFechaEstimada('')
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-semibold text-sm transition-colors border border-purple-500/20"
                    >
                      <Truck className="w-5 h-5" />
                      Confirmar salida
                    </button>
                  )}

                  {envio.estado === 'en_camino' && (
                    <button
                      onClick={() => triggerUpload(envio.id, 'remito')}
                      disabled={isUploading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/10 hover:bg-green-500/20 text-green-400 font-semibold text-sm transition-colors disabled:opacity-50 border border-green-500/20"
                    >
                      <Camera className="w-5 h-5" />
                      {isUploading ? 'Subiendo...' : 'Subir remito firmado'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm envío modal */}
      <Modal isOpen={!!confirmTarget} onClose={() => setConfirmTarget(null)} title="Confirmar salida">
        {confirmTarget && (
          <form onSubmit={handleConfirmarEnvio} className="space-y-5">
            <div className="rounded-lg border border-border bg-card-hover p-3 text-sm">
              <p className="font-medium text-text-primary">{confirmTarget.venta?.razon_social || '—'}</p>
              <p className="text-xs text-muted mt-0.5">{confirmTarget.numero_envio}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-text-secondary mb-3">¿Cuándo sale?</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setFormSaleHoy(true)}
                  className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${formSaleHoy ? 'border-green-400 bg-green-400/10 text-green-400' : 'border-border text-text-secondary hover:border-green-400/50'}`}>
                  Sale hoy ✓
                </button>
                <button type="button" onClick={() => setFormSaleHoy(false)}
                  className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${!formSaleHoy ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary hover:border-accent/50'}`}>
                  Programar fecha
                </button>
              </div>
              {!formSaleHoy && (
                <input type="date" value={formFechaEstimada} onChange={e => setFormFechaEstimada(e.target.value)}
                  className="mt-3 w-full" />
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setConfirmTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
                Cancelar
              </button>
              <button type="submit"
                className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors">
                Confirmar salida
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Photo preview */}
      <Modal isOpen={!!previewUrl} onClose={() => setPreviewUrl(null)} title="Foto">
        {previewUrl && <img src={previewUrl} alt="preview" className="w-full rounded-lg" />}
      </Modal>
    </div>
  )

  // ─── Admin View ───────────────────────────────────────────────────────────

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelected} />

      <PageHeader
        title="Envíos"
        description="Gestión y seguimiento de envíos"
        icon={Truck}
        action={
          <button onClick={() => { setPickSearch(''); setPickVentaOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Nuevo envío
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {(Object.entries(ESTADO_CFG) as [EstadoEnvio, typeof ESTADO_CFG[EstadoEnvio]][]).map(([key, cfg]) => (
          <button key={key} onClick={() => setFilterEstado(filterEstado === key ? 'todos' : key)}
            className={`bg-card rounded-xl border p-4 flex items-center gap-3 transition-colors text-left ${filterEstado === key ? 'border-accent' : 'border-border hover:border-border/80'}`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
              <cfg.Icon className={`w-5 h-5 ${cfg.color}`} />
            </div>
            <div>
              <p className="text-xs text-muted leading-tight">{cfg.label}</p>
              <p className={`text-2xl font-bold ${cfg.color}`}>{counts[key]}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" placeholder="Buscar por cliente, factura o ENV-..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:border-accent" />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 flex-wrap">
          {[['todos', 'Todos'], ...Object.entries(ESTADO_CFG).map(([k, v]) => [k, v.label])].map(([val, label]) => (
            <button key={val} onClick={() => setFilterEstado(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${filterEstado === val ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {enviosFiltrados.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Truck className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">Sin envíos</p>
          <p className="text-muted text-sm mt-1">Creá un envío desde una venta o con el botón &quot;Nuevo envío&quot;</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted font-medium">Referencia</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Cliente / Factura</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Ítems</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Estado</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Destino</th>
                  <th className="text-left py-3 px-4 text-muted font-medium">Fotos</th>
                  <th className="text-center py-3 px-4 text-muted font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {enviosFiltrados.map(envio => {
                  const cfg = ESTADO_CFG[envio.estado] ?? ESTADO_CFG.en_preparacion
                  return (
                    <tr key={envio.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                      {/* Referencia */}
                      <td className="py-3 px-4">
                        <p className="font-bold text-accent text-sm">{envio.numero_envio || '—'}</p>
                        <p className="text-xs text-muted">{formatDate(envio.created_at.slice(0, 10))}</p>
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-4">
                        <p className="font-medium text-text-primary">{envio.venta?.razon_social || '—'}</p>
                        {envio.venta?.numero_factura && <p className="text-xs text-muted">{envio.venta.numero_factura}</p>}
                      </td>

                      {/* Items */}
                      <td className="py-3 px-4">
                        {(envio.items_enviados || []).length > 0 ? (
                          <div className="space-y-0.5 max-w-48">
                            {(envio.items_enviados || []).slice(0, 3).map((item, i) => (
                              <p key={i} className="text-xs text-text-secondary truncate">
                                <span className="text-accent font-semibold">{item.cantidad_total}×</span> {item.descripcion}
                              </p>
                            ))}
                            {(envio.items_enviados || []).length > 3 && (
                              <p className="text-xs text-muted">+{(envio.items_enviados || []).length - 3} más</p>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted">—</span>}
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          <cfg.Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                        {envio.notas_almacen && (
                          <p className="text-xs text-muted mt-1 max-w-36 truncate" title={envio.notas_almacen}>
                            <MessageSquare className="w-3 h-3 inline mr-0.5" />{envio.notas_almacen}
                          </p>
                        )}
                      </td>

                      {/* Destino */}
                      <td className="py-3 px-4">
                        {(envio.receptor || envio.direccion) ? (
                          <div className="text-xs text-text-secondary">
                            {envio.receptor && <p className="font-medium flex items-center gap-1"><User className="w-3 h-3" />{envio.receptor}</p>}
                            {envio.direccion && <p className="flex items-center gap-1 text-muted"><MapPin className="w-3 h-3" />{envio.direccion}</p>}
                          </div>
                        ) : <span className="text-xs text-muted">—</span>}
                      </td>

                      {/* Fotos */}
                      <td className="py-3 px-4">
                        <div className="flex gap-1.5">
                          {envio.foto_preparacion ? (
                            <button onClick={() => setPreviewUrl(envio.foto_preparacion)}
                              className="w-9 h-9 rounded-lg overflow-hidden border border-border hover:border-accent transition-colors flex-shrink-0">
                              <img src={envio.foto_preparacion} alt="prep" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="w-9 h-9 rounded-lg border border-dashed border-border flex items-center justify-center flex-shrink-0">
                              <Camera className="w-3.5 h-3.5 text-muted" />
                            </div>
                          )}
                          {envio.foto_remito ? (
                            <button onClick={() => setPreviewUrl(envio.foto_remito)}
                              className="w-9 h-9 rounded-lg overflow-hidden border border-border hover:border-accent transition-colors flex-shrink-0">
                              <img src={envio.foto_remito} alt="remito" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="w-9 h-9 rounded-lg border border-dashed border-border flex items-center justify-center flex-shrink-0">
                              <Camera className="w-3.5 h-3.5 text-muted" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {envio.estado === 'preparado' && (
                            <button onClick={() => handleAprobar(envio)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors whitespace-nowrap flex items-center gap-1">
                              <ThumbsUp className="w-3 h-3" /> Aprobar
                            </button>
                          )}
                          <button onClick={() => openEditar(envio)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border text-xs text-muted text-right">
            {enviosFiltrados.length} envío{enviosFiltrados.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* ── Pick venta modal ── */}
      <Modal isOpen={pickVentaOpen} onClose={() => setPickVentaOpen(false)} title="Seleccionar venta">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input type="text" placeholder="Buscar por cliente o factura..."
              value={pickSearch} onChange={e => setPickSearch(e.target.value)} autoFocus
              className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:border-accent" />
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {ventasSinEnvio
              .filter(v => {
                if (!pickSearch) return true
                const q = pickSearch.toLowerCase()
                return v.razon_social?.toLowerCase().includes(q) || v.numero_factura?.toLowerCase().includes(q)
              })
              .slice(0, 30)
              .map(v => (
                <button key={v.id} onClick={() => openPreparar(v)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-card-hover transition-colors border border-transparent hover:border-border">
                  <p className="font-medium text-text-primary text-sm">{v.razon_social || '—'}</p>
                  <p className="text-xs text-muted">{v.numero_factura} · {formatDate(v.fecha)}</p>
                </button>
              ))}
            {ventasSinEnvio.length === 0 && (
              <p className="text-center text-muted text-sm py-6">Todas las ventas ya tienen envío</p>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Preparar / editar modal ── */}
      <Modal isOpen={modalOpen} onClose={() => { setPreparandoVenta(null); setEditingEnvio(null) }} title={modalTitle}>
        {(preparandoVenta || editingEnvio) && (
          <form onSubmit={handleGuardarEnvio} className="space-y-5">
            {/* Venta info */}
            <div className="rounded-lg border border-border bg-card-hover p-3 text-sm">
              <p className="font-medium text-text-primary">{modalVenta?.razon_social || '—'}</p>
              <div className="flex gap-3 mt-0.5 text-xs text-muted flex-wrap">
                {modalVenta?.numero_factura && <span>{modalVenta.numero_factura}</span>}
                {modalVenta?.fecha && <span>{formatDate(modalVenta.fecha)}</span>}
              </div>
              {editingEnvio?.numero_envio && (
                <p className="text-xs font-bold text-accent mt-1">{editingEnvio.numero_envio}</p>
              )}
            </div>

            {/* Items preview */}
            {(() => {
              const items = preparandoVenta
                ? (preparandoVenta.items || []).map(i => ({ sku: i.sku, descripcion: i.descripcion, cantidad: i.cantidad }))
                : (editingEnvio?.items_enviados || []).map(i => ({ sku: i.sku, descripcion: i.descripcion, cantidad: i.cantidad_total }))
              return items.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted mb-2 uppercase tracking-wide">Productos</p>
                  <div className="space-y-1.5">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-card-hover rounded-lg px-3 py-2">
                        <span className="w-5 h-5 rounded bg-accent/10 text-accent font-bold flex items-center justify-center flex-shrink-0">
                          {item.cantidad}
                        </span>
                        <span className="text-text-secondary truncate flex-1">{item.descripcion}</span>
                        {item.sku && <span className="text-muted font-mono">{item.sku}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Nota al almacén */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Nota para el almacén
              </label>
              <textarea value={formNotas} onChange={e => setFormNotas(e.target.value)}
                placeholder="Instrucciones especiales, observaciones..." rows={2}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none" />
            </div>

            {/* Destino */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Receptor</label>
                <input type="text" value={formReceptor} onChange={e => setFormReceptor(e.target.value)}
                  placeholder="Nombre del receptor" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Transportista</label>
                <select value={formTransportista} onChange={e => setFormTransportista(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {TRANSPORTISTAS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Dirección de entrega</label>
              <input type="text" value={formDireccion} onChange={e => setFormDireccion(e.target.value)}
                placeholder="Calle, número, localidad..." />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setPreparandoVenta(null); setEditingEnvio(null) }}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : editingEnvio ? 'Guardar cambios' : 'Enviar al almacén'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Photo preview */}
      <Modal isOpen={!!previewUrl} onClose={() => setPreviewUrl(null)} title="Foto">
        {previewUrl && <img src={previewUrl} alt="preview" className="w-full rounded-lg" />}
      </Modal>
    </div>
  )
}
