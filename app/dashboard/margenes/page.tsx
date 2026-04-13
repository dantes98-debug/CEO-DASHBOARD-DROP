'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { Percent, Plus, Upload, DollarSign, Search } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface Producto {
  id: string
  sku: string
  nombre: string
  costo_usd: number
  costo_ars: number
  precio_venta: number
  margen?: number
  created_at: string
}

interface Config {
  tipo_cambio: number
}

export default function MargenesPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [tcModalOpen, setTcModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tipoCambio, setTipoCambio] = useState(1000)
  const [newTc, setNewTc] = useState('')
  const [form, setForm] = useState({ sku: '', nombre: '', costo_usd: '', precio_venta: '' })
  const [importando, setImportando] = useState(false)
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchConfig()
    fetchData()
  }, [])

  const fetchConfig = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('config').select('*').eq('clave', 'tipo_cambio').single()
    if (data) setTipoCambio(Number(data.valor))
  }

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('productos').select('*').order('sku')
    const tc = tipoCambio
    const withCalc = (data || []).map((p) => ({
      ...p,
      costo_ars: Number(p.costo_usd) * tc,
      margen: ((Number(p.precio_venta) - Number(p.costo_usd) * tc) / Number(p.precio_venta)) * 100,
    }))
    setProductos(withCalc)
    setLoading(false)
  }

  // Re-calculate when tipoCambio changes
  useEffect(() => {
    setProductos((prev) =>
      prev.map((p) => ({
        ...p,
        costo_ars: Number(p.costo_usd) * tipoCambio,
        margen: ((Number(p.precio_venta) - Number(p.costo_usd) * tipoCambio) / Number(p.precio_venta)) * 100,
      }))
    )
  }, [tipoCambio])

  const handleSaveTc = async () => {
    const supabase = createClient()
    const val = Number(newTc)
    if (!val) return
    await supabase.from('config').upsert({ clave: 'tipo_cambio', valor: String(val) }, { onConflict: 'clave' })
    setTipoCambio(val)
    setTcModalOpen(false)
    setNewTc('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    await supabase.from('productos').insert({
      sku: form.sku,
      nombre: form.nombre,
      costo_usd: Number(form.costo_usd),
      precio_venta: Number(form.precio_venta),
    })
    await fetchData()
    setModalOpen(false)
    setForm({ sku: '', nombre: '', costo_usd: '', precio_venta: '' })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return
    const supabase = createClient()
    await supabase.from('productos').delete().eq('id', id)
    await fetchData()
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportMsg(null)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws)

      if (rows.length === 0) {
        setImportMsg({ type: 'error', text: 'El archivo está vacío.' })
        setImportando(false)
        return
      }

      const normalize = (key: string) => key.trim().toUpperCase()
      const keys = Object.keys(rows[0])
      const skuKey = keys.find((k) => normalize(k) === 'SKU')
      const costoKey = keys.find((k) => normalize(k) === 'COSTO')

      if (!skuKey || !costoKey) {
        setImportMsg({ type: 'error', text: `Columnas detectadas: ${keys.join(', ')}. El archivo debe tener columnas SKU y COSTO.` })
        setImportando(false)
        return
      }

      const supabase = createClient()
      const insertsRaw = rows
        .filter((r) => r[skuKey] && r[costoKey])
        .map((r) => {
          const raw = String(r[skuKey]).trim()
          // Si el campo SKU tiene formato "ABC02 - NOMBRE", extraer solo el código
          const sku = raw.includes(' - ') ? raw.split(' - ')[0].trim().toUpperCase() : raw.toUpperCase()
          const nombre = raw.includes(' - ') ? raw.split(' - ').slice(1).join(' - ').trim() : raw
          return { sku, nombre, costo_usd: Number(r[costoKey]), precio_venta: 0 }
        })
      // Deduplicar por SKU (queda el último valor si hay repetidos)
      const seen = new Map<string, typeof insertsRaw[0]>()
      for (const row of insertsRaw) seen.set(row.sku, row)
      const inserts = Array.from(seen.values())

      if (inserts.length === 0) {
        setImportMsg({ type: 'error', text: 'No se encontraron filas válidas con SKU y COSTO.' })
        setImportando(false)
        return
      }

      // Borrar todos los productos existentes y re-insertar desde el Excel
      const { error: delError } = await supabase.from('productos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (delError) {
        setImportMsg({ type: 'error', text: `Error al limpiar tabla: ${delError.message}` })
        setImportando(false)
        return
      }

      const { error } = await supabase.from('productos').insert(inserts)
      if (error) {
        setImportMsg({ type: 'error', text: `Error Supabase: ${error.message}` })
        setImportando(false)
        return
      }

      await fetchData()
      setImportMsg({ type: 'ok', text: `Lista actualizada: ${inserts.length} productos cargados.` })
    } catch (err) {
      setImportMsg({ type: 'error', text: `Error al leer el archivo: ${String(err)}` })
    }

    setImportando(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const margenPromedio = productos.length > 0
    ? productos.reduce((sum, p) => sum + (p.margen || 0), 0) / productos.length
    : 0

  const mejorMargen = productos.length > 0
    ? Math.max(...productos.map((p) => p.margen || 0))
    : 0

  const columns = [
    { key: 'sku', label: 'SKU' },
    { key: 'nombre', label: 'Producto' },
    {
      key: 'costo_usd',
      label: 'Costo USD',
      render: (v: unknown) => `USD ${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
    },
    {
      key: 'costo_ars',
      label: 'Costo ARS',
      render: (v: unknown) => formatCurrency(Number(v)),
    },
    {
      key: 'precio_venta',
      label: 'Precio venta',
      render: (v: unknown) => Number(v) === 0
        ? <span className="text-text-muted text-xs">Sin precio</span>
        : formatCurrency(Number(v)),
    },
    {
      key: 'margen',
      label: 'Margen',
      render: (v: unknown, row: Producto) => {
        if (!row.precio_venta) return <span className="text-text-muted text-xs">—</span>
        const val = Number(v)
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 max-w-24 bg-border rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${val > 30 ? 'bg-green-500' : val > 15 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(Math.max(val, 0), 100)}%` }}
              />
            </div>
            <span className={`font-semibold text-sm ${val > 30 ? 'text-green-400' : val > 15 ? 'text-yellow-400' : 'text-red-400'}`}>
              {formatPercent(val)}
            </span>
          </div>
        )
      },
    },
    {
      key: 'id',
      label: '',
      render: (_: unknown, row: Producto) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Eliminar
        </button>
      ),
    },
  ]

  const chartData = productos
    .filter((p) => p.precio_venta > 0)
    .map((p) => ({
      nombre: p.sku.length > 12 ? p.sku.slice(0, 12) + '...' : p.sku,
      margen: p.margen || 0,
    }))

  const previewMargen = form.costo_usd && form.precio_venta
    ? ((Number(form.precio_venta) - Number(form.costo_usd) * tipoCambio) / Number(form.precio_venta)) * 100
    : null

  return (
    <div>
      <PageHeader
        title="Márgenes"
        description="Rentabilidad por producto"
        icon={Percent}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setTcModalOpen(true)}
              className="flex items-center gap-2 bg-card hover:bg-card-hover border border-border text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              TC: ${tipoCambio.toLocaleString('es-AR')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportExcel}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importando}
              className="flex items-center gap-2 bg-card hover:bg-card-hover border border-border text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {importando ? 'Importando...' : 'Importar Excel'}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <MetricCard
          title="Margen promedio"
          value={formatPercent(margenPromedio)}
          icon={Percent}
          color="green"
          loading={loading}
        />
        <MetricCard
          title="Mejor margen"
          value={formatPercent(mejorMargen)}
          icon={Percent}
          color="blue"
          loading={loading}
        />
      </div>

      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-6">Margen por SKU</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="nombre" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#f1f5f9' }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Margen']}
              />
              <Bar dataKey="margen" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.margen > 30 ? '#22c55e' : entry.margen > 15 ? '#eab308' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {importMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${importMsg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {importMsg.text}
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Buscar por SKU o nombre..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full pl-9"
        />
      </div>

      <DataTable
        columns={columns as never}
        data={productos.filter(p =>
          p.sku?.toLowerCase().includes(busqueda.toLowerCase()) ||
          p.nombre?.toLowerCase().includes(busqueda.toLowerCase())
        ) as never}
        loading={loading}
        emptyMessage="No hay productos. Importá un Excel con columnas SKU y COSTO."
      />

      {/* Tipo de cambio modal */}
      <Modal isOpen={tcModalOpen} onClose={() => setTcModalOpen(false)} title="Actualizar tipo de cambio">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Tipo de cambio actual: <span className="text-text-primary font-semibold">${tipoCambio.toLocaleString('es-AR')}</span></p>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nuevo tipo de cambio (ARS por USD)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={newTc}
              onChange={(e) => setNewTc(e.target.value)}
              placeholder={String(tipoCambio)}
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setTcModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
              Cancelar
            </button>
            <button onClick={handleSaveTc} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors">
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      {/* Agregar producto manual */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo producto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="Ej: PISO-60-GR"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Piso gris 60x60"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Costo (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costo_usd}
                onChange={(e) => setForm({ ...form, costo_usd: e.target.value })}
                placeholder="0.00"
                required
              />
              {form.costo_usd && (
                <p className="text-xs text-text-muted mt-1">≈ {formatCurrency(Number(form.costo_usd) * tipoCambio)} ARS</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Precio venta (ARS)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.precio_venta}
                onChange={(e) => setForm({ ...form, precio_venta: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>
          {previewMargen !== null && (
            <div className={`p-3 rounded-lg text-sm font-medium ${previewMargen > 30 ? 'bg-green-500/10 text-green-400' : previewMargen > 15 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
              Margen calculado: {formatPercent(previewMargen)}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
