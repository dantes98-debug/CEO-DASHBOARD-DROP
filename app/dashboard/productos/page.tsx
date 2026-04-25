'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { formatCurrency } from '@/lib/utils'
import { Boxes, Plus, Upload, Search, Pencil, Trash2, X, ChevronDown, Package } from 'lucide-react'
import { toast } from 'sonner'

interface Producto {
  id: string
  sku: string
  codigo: string
  nombre: string
  linea: string
  costo_usd: number
  precio_venta: number
  cantidad_nordelta: number
  cantidad_villa_martelli: number
  cantidad_reserva: number
  cantidad_total: number
}

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const n = Number(String(val).replace(/\s/g, ''))
  return isNaN(n) ? 0 : n
}

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [tc, setTc] = useState(1000)
  const [busqueda, setBusqueda] = useState('')
  const [lineaFilter, setLineaFilter] = useState('')
  const [depositoFilter, setDepositoFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [form, setForm] = useState({ sku: '', codigo: '', nombre: '', linea: '', costo_usd: '', precio_venta: '' })
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Producto | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [importando, setImportando] = useState(false)
  const [showImportMenu, setShowImportMenu] = useState(false)
  const stockFileRef = useRef<HTMLInputElement>(null)
  const costosFileRef = useRef<HTMLInputElement>(null)
  const preciosFileRef = useRef<HTMLInputElement>(null)
  const importMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [prodRes, tcRes] = await Promise.all([
      supabase.from('productos').select('*').order('sku'),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
    ])
    setProductos(prodRes.data || [])
    setTc(Number(tcRes.data?.valor || 1000))
    setLoading(false)
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ sku: '', codigo: '', nombre: '', linea: '', costo_usd: '', precio_venta: '' })
    setModalOpen(true)
  }

  const openEdit = (p: Producto) => {
    setEditing(p)
    setForm({
      sku: p.sku,
      codigo: p.codigo || '',
      nombre: p.nombre || '',
      linea: p.linea || '',
      costo_usd: p.costo_usd ? String(p.costo_usd) : '',
      precio_venta: p.precio_venta ? String(p.precio_venta) : '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const payload = {
      sku: form.sku.trim().toUpperCase(),
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      linea: form.linea.trim(),
      costo_usd: Number(form.costo_usd) || 0,
      precio_venta: Number(form.precio_venta) || 0,
    }
    if (editing) {
      const { error } = await supabase.from('productos').update(payload).eq('id', editing.id)
      if (error) { toast.error('Error al actualizar el producto'); setSaving(false); return }
      toast.success('Producto actualizado')
    } else {
      const { error } = await supabase.from('productos').insert(payload)
      if (error) { toast.error(error.message.includes('duplicate') ? 'Ya existe un producto con ese SKU' : 'Error al crear el producto'); setSaving(false); return }
      toast.success('Producto creado')
    }
    await fetchData()
    setModalOpen(false)
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('productos').delete().eq('id', deleteTarget.id)
    await fetchData()
    toast.success('Producto eliminado')
    setDeleteTarget(null)
    setDeleting(false)
  }

  // ── Import Stock ──────────────────────────────────────────────────────────────
  const handleImportStock = async (file: File) => {
    setImportando(true)
    setImportMsg(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const norm = (v: unknown) => String(v ?? '').trim().toUpperCase()
      const headerRowIdx = rawRows.findIndex(row =>
        (row as unknown[]).some(cell => norm(cell).includes('CODIGO') || norm(cell).includes('ARTICULO'))
      )
      if (headerRowIdx === -1) {
        setImportMsg({ type: 'error', text: 'No se encontró fila de encabezados con CODIGO/ARTICULO.' })
        setImportando(false); return
      }

      const headers = (rawRows[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim())
      const dataRows = rawRows.slice(headerRowIdx + 1)
      const colIdx = (keyword: string, exclude?: string) =>
        headers.findIndex(h => {
          const u = h.toUpperCase()
          return u.includes(keyword.toUpperCase()) && (!exclude || !u.includes(exclude.toUpperCase()))
        })

      const iLinea      = colIdx('LINEA')
      const iCodigo     = colIdx('CODIGO')
      const iArticulo   = colIdx('ARTICULO')
      const iConsumo    = colIdx('CONSUMO')
      const iIntermedio = colIdx('INTERMEDIO')
      const iReserva    = colIdx('RESERVA')
      const iNordelta   = colIdx('NORDELTA')
      const iDrop       = colIdx('DROP', 'CAMILO')
      const iDropCamilo = colIdx('CAMILO')

      if (iCodigo === -1 || iArticulo === -1) {
        setImportMsg({ type: 'error', text: `Headers detectados: ${headers.join(' | ')}` })
        setImportando(false); return
      }

      const get = (row: unknown[], idx: number) => idx >= 0 ? row[idx] : 0
      const inserts = dataRows
        .filter(row => { const c = norm(get(row as unknown[], iCodigo)); return c && /\d/.test(c) })
        .map(row => {
          const r = row as unknown[]
          const articuloRaw = String(get(r, iArticulo) ?? '').trim()
          const sku = articuloRaw.includes(' - ') ? articuloRaw.split(' - ')[0].trim().toUpperCase() : articuloRaw.toUpperCase()
          const nombre = articuloRaw.includes(' - ') ? articuloRaw.split(' - ').slice(1).join(' - ').trim() : articuloRaw
          const vm = parseNum(get(r, iConsumo)) + parseNum(get(r, iIntermedio)) + parseNum(get(r, iDrop)) + parseNum(get(r, iDropCamilo))
          const nrd = parseNum(get(r, iNordelta))
          const rsv = parseNum(get(r, iReserva))
          return {
            sku,
            codigo: String(get(r, iCodigo)).trim(),
            nombre,
            linea: iLinea >= 0 ? String(get(r, iLinea)).trim() : '',
            cantidad_villa_martelli: vm,
            cantidad_nordelta: nrd,
            cantidad_reserva: rsv,
            cantidad_total: vm + nrd + rsv,
          }
        })

      if (inserts.length === 0) { setImportMsg({ type: 'error', text: 'No se encontraron filas válidas.' }); setImportando(false); return }

      const supabase = createClient()
      const { error } = await supabase.from('productos').upsert(inserts, { onConflict: 'sku' })
      if (error) { setImportMsg({ type: 'error', text: `Error: ${error.message}` }); setImportando(false); return }

      await fetchData()
      setImportMsg({ type: 'ok', text: `Stock actualizado: ${inserts.length} productos` })
      toast.success(`Stock importado: ${inserts.length} productos`)
    } catch (err) {
      setImportMsg({ type: 'error', text: `Error al leer el archivo: ${String(err)}` })
    }
    setImportando(false)
  }

  // ── Import Costos ─────────────────────────────────────────────────────────────
  const handleImportCostos = async (file: File) => {
    setImportando(true)
    setImportMsg(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws)

      if (rows.length === 0) { setImportMsg({ type: 'error', text: 'El archivo está vacío.' }); setImportando(false); return }

      const keys = Object.keys(rows[0])
      const norm = (k: string) => k.trim().toUpperCase()
      const skuKey = keys.find(k => norm(k) === 'SKU')
      const costoKey = keys.find(k => norm(k) === 'COSTO')
      if (!skuKey || !costoKey) {
        setImportMsg({ type: 'error', text: `Columnas requeridas: SKU, COSTO. Detectadas: ${keys.join(', ')}` })
        setImportando(false); return
      }

      const seen = new Map<string, { sku: string; nombre: string; costo_usd: number }>()
      for (const r of rows) {
        if (!r[skuKey] || !r[costoKey]) continue
        const raw = String(r[skuKey]).trim()
        const sku = raw.includes(' - ') ? raw.split(' - ')[0].trim().toUpperCase() : raw.toUpperCase()
        const nombre = raw.includes(' - ') ? raw.split(' - ').slice(1).join(' - ').trim() : raw
        seen.set(sku, { sku, nombre, costo_usd: Number(r[costoKey]) })
      }
      const inserts = Array.from(seen.values())
      if (inserts.length === 0) { setImportMsg({ type: 'error', text: 'No se encontraron filas válidas.' }); setImportando(false); return }

      const supabase = createClient()
      const { error } = await supabase.from('productos').upsert(inserts, { onConflict: 'sku' })
      if (error) { setImportMsg({ type: 'error', text: `Error: ${error.message}` }); setImportando(false); return }

      await fetchData()
      setImportMsg({ type: 'ok', text: `Costos actualizados: ${inserts.length} productos` })
      toast.success(`Costos importados: ${inserts.length} productos`)
    } catch (err) {
      setImportMsg({ type: 'error', text: `Error al leer el archivo: ${String(err)}` })
    }
    setImportando(false)
  }

  // ── Import Precios ────────────────────────────────────────────────────────────
  const handleImportPrecios = async (file: File) => {
    setImportando(true)
    setImportMsg(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws)

      if (rows.length === 0) { setImportMsg({ type: 'error', text: 'El archivo está vacío.' }); setImportando(false); return }

      const keys = Object.keys(rows[0])
      const norm = (k: string) => k.trim().toUpperCase()
      const skuKey = keys.find(k => norm(k).includes('SKU') || norm(k).includes('CODIGO') || norm(k).includes('ARTICULO'))
      const precioKey = keys.find(k => norm(k).includes('PRECIO') || norm(k).includes('PRICE') || norm(k).includes('VENTA'))
      if (!skuKey || !precioKey) {
        setImportMsg({ type: 'error', text: `Columnas requeridas: SKU/Articulo, Precio. Detectadas: ${keys.join(', ')}` })
        setImportando(false); return
      }

      const seen = new Map<string, { sku: string; precio_venta: number }>()
      for (const r of rows) {
        if (!r[skuKey] || !r[precioKey]) continue
        const raw = String(r[skuKey]).trim()
        const sku = raw.includes(' - ') ? raw.split(' - ')[0].trim().toUpperCase() : raw.toUpperCase()
        seen.set(sku, { sku, precio_venta: Number(r[precioKey]) })
      }
      const inserts = Array.from(seen.values())
      if (inserts.length === 0) { setImportMsg({ type: 'error', text: 'No se encontraron filas válidas.' }); setImportando(false); return }

      const supabase = createClient()
      const { error } = await supabase.from('productos').upsert(inserts, { onConflict: 'sku' })
      if (error) { setImportMsg({ type: 'error', text: `Error: ${error.message}` }); setImportando(false); return }

      await fetchData()
      setImportMsg({ type: 'ok', text: `Precios actualizados: ${inserts.length} productos` })
      toast.success(`Precios importados: ${inserts.length} productos`)
    } catch (err) {
      setImportMsg({ type: 'error', text: `Error al leer el archivo: ${String(err)}` })
    }
    setImportando(false)
  }

  const lineas = Array.from(new Set(productos.map(p => p.linea).filter(Boolean))).sort()

  const filtrado = productos.filter(p => {
    const q = busqueda.toLowerCase()
    const matchQ = !q || p.sku?.toLowerCase().includes(q) || p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q) || p.linea?.toLowerCase().includes(q)
    const matchL = !lineaFilter || p.linea === lineaFilter
    const matchD = !depositoFilter
      || (depositoFilter === 'nordelta' && (p.cantidad_nordelta || 0) > 0)
      || (depositoFilter === 'villa_martelli' && (p.cantidad_villa_martelli || 0) > 0)
      || (depositoFilter === 'reserva' && (p.cantidad_reserva || 0) > 0)
      || (depositoFilter === 'sin_stock' && (p.cantidad_nordelta || 0) + (p.cantidad_villa_martelli || 0) + (p.cantidad_reserva || 0) === 0)
    return matchQ && matchL && matchD
  })

  const totalStock = productos.reduce((s, p) => s + (p.cantidad_nordelta || 0) + (p.cantidad_villa_martelli || 0), 0)
  const sinStock = productos.filter(p => (p.cantidad_nordelta || 0) + (p.cantidad_villa_martelli || 0) === 0).length
  const valorUSD = productos.reduce((s, p) => s + (p.costo_usd || 0) * ((p.cantidad_nordelta || 0) + (p.cantidad_villa_martelli || 0)), 0)

  return (
    <div>
      <PageHeader
        title="Productos"
        description="Catálogo unificado — stock, costos y precios de venta"
        icon={Boxes}
        action={
          <div className="flex gap-2">
            <div className="relative" ref={importMenuRef}>
              <button
                onClick={() => setShowImportMenu(v => !v)}
                disabled={importando}
                className="flex items-center gap-2 bg-card hover:bg-card-hover border border-border text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {importando ? 'Importando...' : 'Importar Excel'}
                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
              </button>
              {showImportMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {[
                    { label: 'Stock', desc: 'Actualiza cantidades por depósito', ref: stockFileRef },
                    { label: 'Costos (USD)', desc: 'Actualiza costo_usd por SKU', ref: costosFileRef },
                    { label: 'Precios de venta', desc: 'Actualiza precio_venta por SKU', ref: preciosFileRef },
                  ].map(({ label, desc, ref }) => (
                    <button key={label}
                      onClick={() => { setShowImportMenu(false); ref.current?.click() }}
                      className="w-full text-left px-4 py-3 hover:bg-card-hover transition-colors border-b border-border/50 last:border-0">
                      <p className="text-sm font-medium text-text-primary">{label}</p>
                      <p className="text-xs text-text-muted mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input ref={stockFileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportStock(f); e.target.value = '' }} />
            <input ref={costosFileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCostos(f); e.target.value = '' }} />
            <input ref={preciosFileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportPrecios(f); e.target.value = '' }} />
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Nuevo producto
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Total productos" value={String(productos.length)} icon={Boxes} color="blue" loading={loading} />
        <MetricCard title="Unidades disponibles" value={totalStock.toLocaleString('es-AR')} icon={Package} color="green" loading={loading} />
        <MetricCard title="Sin stock" value={String(sinStock)} icon={Package} color="red" loading={loading} />
        <MetricCard title="Valor inventario" value={`USD ${Math.round(valorUSD).toLocaleString('es-AR')}`} icon={Boxes} color="purple" loading={loading} />
      </div>

      {importMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border flex items-center justify-between gap-3 ${importMsg.type === 'ok' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          <span>{importMsg.text}</span>
          <button onClick={() => setImportMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="Buscar por SKU, código o nombre..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)} className="w-full pl-9" />
        </div>
        {lineas.length > 0 && (
          <select value={lineaFilter} onChange={e => setLineaFilter(e.target.value)} className="w-44">
            <option value="">Todas las líneas</option>
            {lineas.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <select value={depositoFilter} onChange={e => setDepositoFilter(e.target.value)} className="w-44">
          <option value="">Todos los depósitos</option>
          <option value="nordelta">Nordelta</option>
          <option value="villa_martelli">Villa Martelli</option>
          <option value="reserva">Reserva</option>
          <option value="sin_stock">Sin stock</option>
        </select>
        {(busqueda || lineaFilter || depositoFilter) && (
          <button onClick={() => { setBusqueda(''); setLineaFilter(''); setDepositoFilter('') }}
            className="flex items-center gap-1 text-xs text-text-muted border border-border rounded-md px-3 py-1.5 hover:bg-card-hover hover:text-text-primary transition-colors">
            <X className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-text-primary">
            Catálogo <span className="ml-2 text-xs font-normal text-text-muted">({filtrado.length} productos)</span>
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-text-muted">Cargando...</div>
        ) : filtrado.length === 0 ? (
          <div className="p-8 text-center text-text-muted">No hay productos. Creá uno o importá un Excel.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Línea</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Costo USD</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">P. Venta</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Margen</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-green-600 uppercase">Nordelta</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-blue-600 uppercase">V. Martelli</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-yellow-600 uppercase">Reserva</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Disp.</th>
                  <th className="w-20 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrado.map(p => {
                  const costoARS = (p.costo_usd || 0) * tc
                  const margen = p.precio_venta > 0 && costoARS > 0
                    ? ((p.precio_venta - costoARS) / p.precio_venta) * 100
                    : null
                  const dispTotal = (p.cantidad_nordelta || 0) + (p.cantidad_villa_martelli || 0)
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-text-primary">{p.sku}</td>
                      <td className="px-4 py-2.5 text-xs text-text-secondary max-w-52 truncate">{p.nombre || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-text-muted">{p.linea || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-text-secondary">
                        {p.costo_usd > 0 ? `USD ${Number(p.costo_usd).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-text-secondary">
                        {p.precio_venta > 0 ? formatCurrency(p.precio_venta) : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {margen !== null
                          ? <span className={`text-xs font-semibold ${margen >= 30 ? 'text-green-400' : margen >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>{margen.toFixed(1)}%</span>
                          : <span className="text-xs text-text-muted">—</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-sm font-semibold ${(p.cantidad_nordelta || 0) > 0 ? 'text-green-600' : 'text-text-muted'}`}>
                        {p.cantidad_nordelta || '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-sm font-semibold ${(p.cantidad_villa_martelli || 0) > 0 ? 'text-blue-600' : 'text-text-muted'}`}>
                        {p.cantidad_villa_martelli || '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-sm font-semibold ${(p.cantidad_reserva || 0) > 0 ? 'text-yellow-600' : 'text-text-muted'}`}>
                        {p.cantidad_reserva || '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-sm font-bold ${dispTotal === 0 ? 'text-red-400' : 'text-text-primary'}`}>
                        {dispTotal === 0 ? 'Sin stock' : dispTotal}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(p)} className="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget(p)} className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Eliminar">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear / editar */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar producto' : 'Nuevo producto'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">SKU *</label>
              <input type="text" value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                placeholder="Ej: AN101" required
                readOnly={!!editing}
                className={editing ? 'bg-card-hover cursor-default opacity-70' : ''} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Código</label>
              <input type="text" value={form.codigo}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                placeholder="Código interno" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre</label>
              <input type="text" value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del producto" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Línea</label>
              <input type="text" value={form.linea}
                onChange={e => setForm(f => ({ ...f, linea: e.target.value }))}
                placeholder="Ej: ANTIK" list="lineas-datalist" />
              <datalist id="lineas-datalist">
                {lineas.map(l => <option key={l} value={l} />)}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Costo (USD)</label>
              <input type="number" min="0" step="0.01" value={form.costo_usd}
                onChange={e => setForm(f => ({ ...f, costo_usd: e.target.value }))}
                placeholder="0.00" />
              {form.costo_usd && (
                <p className="text-xs text-text-muted mt-1">≈ {formatCurrency(Number(form.costo_usd) * tc)} ARS</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Precio venta (ARS)</label>
              <input type="number" min="0" step="1" value={form.precio_venta}
                onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))}
                placeholder="0" />
            </div>
          </div>
          {form.costo_usd && form.precio_venta && (() => {
            const m = ((Number(form.precio_venta) - Number(form.costo_usd) * tc) / Number(form.precio_venta)) * 100
            if (!isFinite(m)) return null
            return (
              <div className={`p-3 rounded-lg text-sm font-medium ${m > 30 ? 'bg-green-500/10 text-green-400' : m > 15 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                Margen estimado: {m.toFixed(1)}%
              </div>
            )
          })()}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar este producto?"
        description={deleteTarget && (
          <>Se eliminará <strong>{deleteTarget.nombre || deleteTarget.sku}</strong> ({deleteTarget.sku}). Esta acción no se puede deshacer.</>
        )}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
