'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import FacturaUploader, { type FacturaParseada } from '@/components/FacturaUploader'
import { formatCurrency, formatDate, getMonthName } from '@/lib/utils'
import { TrendingUp, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts'

type TipoVenta = 'blanco_a' | 'blanco_b' | 'negro'
type Moneda = 'ars' | 'usd'
type FiltroTipo = 'todos' | TipoVenta

const TIPO_LABEL: Record<TipoVenta, string> = { blanco_a: 'Factura A', blanco_b: 'Factura B', negro: 'Negro' }
const TIPO_COLOR: Record<TipoVenta, string> = { blanco_a: 'text-blue-400', blanco_b: 'text-purple-400', negro: 'text-yellow-400' }
const TIPO_BG: Record<TipoVenta, string> = { blanco_a: 'bg-blue-50 text-blue-700 border-blue-200', blanco_b: 'bg-purple-50 text-purple-700 border-purple-200', negro: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
const IVA_DEFAULT: Record<TipoVenta, number> = { blanco_a: 21, blanco_b: 21, negro: 0 }
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface ItemFactura {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  total: number
  costo_usd?: number
  costo_ars?: number
  ganancia?: number
}

interface Venta {
  id: string
  fecha: string
  monto: number
  moneda: Moneda
  tipo_cambio: number
  monto_ars: number
  tipo: TipoVenta
  costo: number
  iva_pct: number
  iva_monto: number
  subtotal: number
  numero_factura: string | null
  razon_social: string | null
  garantia_desde: string | null
  items: ItemFactura[] | null
  descripcion: string | null
  cliente_id: string | null
  estudio_id: string | null
  archivo_url: string | null
  clientes?: { nombre: string } | null
  estudios?: { nombre: string } | null
  created_at: string
  iva?: number
  ganancia?: number
}

interface Cliente { id: string; nombre: string }
interface Estudio { id: string; nombre: string }
interface Producto { sku: string; costo_usd: number }

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [estudios, setEstudios] = useState<Estudio[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [tipoCambioDefault, setTipoCambioDefault] = useState(1000)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const hoy = new Date()
  const [mesFiltro, setMesFiltro] = useState(hoy.getMonth() + 1)
  const [anioFiltro, setAnioFiltro] = useState(hoy.getFullYear())

  // Form state
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    cliente_id: '',
    estudio_id: '',
    monto: '',
    moneda: 'ars' as Moneda,
    tipo_cambio: '',
    tipo: 'blanco_a' as TipoVenta,
    costo: '',
    iva_pct: '21',
    descripcion: '',
    numero_factura: '',
    razon_social: '',
    garantia_desde: '',
    subtotal: '',
    iva_monto: '',
  })
  const [facturaItems, setFacturaItems] = useState<ItemFactura[]>([])
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState('')
  const [nuevoEstudio, setNuevoEstudio] = useState('')
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [creandoEstudio, setCreandoEstudio] = useState(false)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [ventasRes, clientesRes, estudiosRes, productosRes, configRes] = await Promise.all([
      supabase.from('ventas').select('*, clientes(nombre), estudios(nombre)').order('fecha', { ascending: false }),
      supabase.from('clientes').select('id, nombre').order('nombre'),
      supabase.from('estudios').select('id, nombre').order('nombre'),
      supabase.from('productos').select('sku, costo_usd').not('sku', 'is', null),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
    ])
    const tc = Number(configRes.data?.valor || 1000)
    setTipoCambioDefault(tc)
    const withCalc = (ventasRes.data || []).map((v) => {
      const montoArs = v.moneda === 'usd' ? Number(v.monto) * Number(v.tipo_cambio || tc) : Number(v.monto)
      const ivaMonto = v.iva_monto || (montoArs / (1 + Number(v.iva_pct || 0) / 100)) * (Number(v.iva_pct || 0) / 100)
      const ganancia = montoArs - Number(v.costo || 0) - ivaMonto
      return { ...v, monto_ars: montoArs, iva: ivaMonto, ganancia }
    })
    setVentas(withCalc)
    setClientes(clientesRes.data || [])
    setEstudios(estudiosRes.data || [])
    setProductos(productosRes.data || [])
    setLoading(false)
  }

  const enrichItems = (items: ItemFactura[], tc: number) =>
    items.map((item) => {
      const prod = productos.find(p => p.sku?.toLowerCase() === item.sku?.toLowerCase())
      const costoArs = prod ? prod.costo_usd * tc : 0
      const ganancia = item.total - costoArs * item.cantidad
      return { ...item, costo_usd: prod?.costo_usd || 0, costo_ars: costoArs, ganancia }
    })

  // When PDF is parsed
  const handleFacturaParsed = (data: FacturaParseada) => {
    const tc = tipoCambioDefault
    const enrichedItems = enrichItems(data.items, tc)
    const totalCosto = enrichedItems.reduce((s, i) => s + (i.costo_ars || 0) * i.cantidad, 0)
    // Garantia = fecha + 7 años
    const garantia = data.fecha ? `${parseInt(data.fecha.slice(0,4)) + 7}${data.fecha.slice(4)}` : ''

    setFacturaItems(enrichedItems)
    setPdfFile(data.pdfFile)
    setForm(prev => ({
      ...prev,
      fecha: data.fecha,
      tipo: data.tipo,
      iva_pct: String(IVA_DEFAULT[data.tipo]),
      monto: String(data.total),
      moneda: 'ars',
      tipo_cambio: '',
      numero_factura: data.numero_factura,
      razon_social: data.razon_social,
      subtotal: String(data.subtotal),
      iva_monto: String(data.iva_monto),
      costo: String(totalCosto.toFixed(0)),
      garantia_desde: garantia,
    }))
    setModalOpen(true)
  }

  // Re-enrich items when TC changes
  const handleTcChange = (newTc: string) => {
    const tc = Number(newTc) || tipoCambioDefault
    setForm(prev => ({ ...prev, tipo_cambio: newTc }))
    if (facturaItems.length > 0) {
      const enriched = enrichItems(facturaItems.map(i => ({ ...i, costo_usd: i.costo_usd, costo_ars: 0, ganancia: 0 })), tc)
      const totalCosto = enriched.reduce((s, i) => s + (i.costo_ars || 0) * i.cantidad, 0)
      setFacturaItems(enriched)
      setForm(prev => ({ ...prev, tipo_cambio: newTc, costo: String(totalCosto.toFixed(0)) }))
    }
  }

  const handleCrearCliente = async () => {
    if (!nuevoCliente.trim()) return
    setCreandoCliente(true)
    const supabase = createClient()
    const { data } = await supabase.from('clientes').insert({ nombre: nuevoCliente.trim() }).select('id, nombre').single()
    if (data) {
      setClientes(prev => [...prev, data])
      setForm(prev => ({ ...prev, cliente_id: data.id }))
    }
    setNuevoCliente('')
    setCreandoCliente(false)
  }

  const handleCrearEstudio = async () => {
    if (!nuevoEstudio.trim()) return
    setCreandoEstudio(true)
    const supabase = createClient()
    const { data } = await supabase.from('estudios').insert({ nombre: nuevoEstudio.trim() }).select('id, nombre').single()
    if (data) {
      setEstudios(prev => [...prev, data])
      setForm(prev => ({ ...prev, estudio_id: data.id }))
    }
    setNuevoEstudio('')
    setCreandoEstudio(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const tc = form.moneda === 'usd' ? Number(form.tipo_cambio) || tipoCambioDefault : 1
    const montoArs = form.moneda === 'usd' ? Number(form.monto) * tc : Number(form.monto)

    let archivo_url = null
    if (pdfFile) {
      setUploadingPdf(true)
      const fileName = `${Date.now()}_${pdfFile.name.replace(/\s/g, '_')}`
      const { data: upData } = await supabase.storage.from('facturas').upload(fileName, pdfFile)
      archivo_url = upData?.path || null
      setUploadingPdf(false)
    }

    await supabase.from('ventas').insert({
      fecha: form.fecha,
      cliente_id: form.cliente_id || null,
      estudio_id: form.estudio_id || null,
      monto: Number(form.monto),
      moneda: form.moneda,
      tipo_cambio: tc,
      monto_ars: montoArs,
      tipo: form.tipo,
      costo: Number(form.costo) || 0,
      iva_pct: Number(form.iva_pct) || 0,
      iva_monto: Number(form.iva_monto) || 0,
      subtotal: Number(form.subtotal) || 0,
      descripcion: form.descripcion || null,
      numero_factura: form.numero_factura || null,
      razon_social: form.razon_social || null,
      garantia_desde: form.garantia_desde || null,
      items: facturaItems.length > 0 ? facturaItems : null,
          archivo_url,
    })
    await fetchData()
    setModalOpen(false)
    resetForm()
    setSaving(false)
  }

  const resetForm = () => {
    setForm({ fecha: new Date().toISOString().split('T')[0], cliente_id: '', estudio_id: '', monto: '', moneda: 'ars', tipo_cambio: '', tipo: 'blanco_a', costo: '', iva_pct: '21', descripcion: '', numero_factura: '', razon_social: '', garantia_desde: '', subtotal: '', iva_monto: '' })
    setFacturaItems([])
    setPdfFile(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta venta?')) return
    const supabase = createClient()
    await supabase.from('ventas').delete().eq('id', id)
    await fetchData()
  }

  const navegarMes = (dir: -1 | 1) => {
    const d = new Date(anioFiltro, mesFiltro - 1 + dir, 1)
    setMesFiltro(d.getMonth() + 1)
    setAnioFiltro(d.getFullYear())
  }

  const mesStart = `${anioFiltro}-${String(mesFiltro).padStart(2, '0')}-01`
  const mesEnd = new Date(anioFiltro, mesFiltro, 0).toISOString().split('T')[0]
  const ventasMes = ventas.filter(v => v.fecha >= mesStart && v.fecha <= mesEnd)
  const ventasMesFiltradas = ventasMes.filter(v => filtroTipo === 'todos' || v.tipo === filtroTipo)

  const totalMes = ventasMes.reduce((s, v) => s + v.monto_ars, 0)
  const gananciasMes = ventasMes.reduce((s, v) => s + (v.ganancia || 0), 0)
  const costosMes = ventasMes.reduce((s, v) => s + Number(v.costo || 0), 0)
  const ivaMes = ventasMes.reduce((s, v) => s + (v.iva || 0), 0)
  const ventasAnioTotal = ventas.filter(v => v.fecha.startsWith(String(anioFiltro))).reduce((s, v) => s + v.monto_ars, 0)

  const monthlyMap: Record<string, { blanco_a: number; blanco_b: number; negro: number }> = {}
  ventas.filter(v => v.fecha.startsWith(String(anioFiltro))).forEach((v) => {
    const m = parseInt(v.fecha.slice(5, 7))
    const key = MESES_CORTO[m - 1]
    if (!monthlyMap[key]) monthlyMap[key] = { blanco_a: 0, blanco_b: 0, negro: 0 }
    monthlyMap[key][v.tipo || 'blanco_a'] += v.monto_ars
  })
  const chartData = MESES_CORTO.map(m => ({ mes: m, ...(monthlyMap[m] || { blanco_a: 0, blanco_b: 0, negro: 0 }) }))

  const tendenciaData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1)
    const m = d.getMonth() + 1
    const a = d.getFullYear()
    const s = `${a}-${String(m).padStart(2, '0')}-01`
    const e2 = new Date(a, m, 0).toISOString().split('T')[0]
    const rows = ventas.filter(v => v.fecha >= s && v.fecha <= e2)
    return { label: MESES_CORTO[m - 1], ventas: rows.reduce((acc, v) => acc + v.monto_ars, 0), ganancia: rows.reduce((acc, v) => acc + (v.ganancia || 0), 0) }
  })

  const formMontoArs = form.moneda === 'usd' ? Number(form.monto) * (Number(form.tipo_cambio) || tipoCambioDefault) : Number(form.monto)
  const formIva = Number(form.iva_monto) || (formMontoArs > 0 ? (formMontoArs / (1 + Number(form.iva_pct) / 100)) * (Number(form.iva_pct) / 100) : 0)
  const formGanancia = formMontoArs - Number(form.costo || 0) - formIva
  const esMesActual = mesFiltro === hoy.getMonth() + 1 && anioFiltro === hoy.getFullYear()

  const openManual = () => { resetForm(); setModalOpen(true) }

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Registro de ventas y facturación"
        icon={TrendingUp}
        action={
          <div className="flex gap-2">
            <FacturaUploader onParsed={handleFacturaParsed} />
            <button onClick={openManual} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Manual
            </button>
          </div>
        }
      />

      {/* Selector de mes */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navegarMes(-1)} className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors">
          <ChevronLeft className="w-4 h-4 text-text-secondary" />
        </button>
        <span className="text-sm font-semibold text-text-primary min-w-28 text-center">
          {MESES_CORTO[mesFiltro - 1]} {anioFiltro}
          {esMesActual && <span className="ml-2 text-xs font-normal text-accent bg-accent/10 px-2 py-0.5 rounded-full">actual</span>}
        </span>
        <button onClick={() => navegarMes(1)} className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors">
          <ChevronRight className="w-4 h-4 text-text-secondary" />
        </button>
        {!esMesActual && (
          <button onClick={() => { setMesFiltro(hoy.getMonth() + 1); setAnioFiltro(hoy.getFullYear()) }} className="text-xs text-accent hover:underline ml-1">
            Ir al mes actual
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Ventas del mes" value={formatCurrency(totalMes)} icon={TrendingUp} color="blue" loading={loading} />
        <MetricCard title={`Acumulado ${anioFiltro}`} value={formatCurrency(ventasAnioTotal)} icon={TrendingUp} color="green" loading={loading} />
        <MetricCard title="Costos del mes" value={formatCurrency(costosMes)} icon={TrendingUp} color="purple" loading={loading} />
        <MetricCard title="Ganancia del mes" value={formatCurrency(gananciasMes)} icon={TrendingUp} color="yellow" loading={loading} />
      </div>

      {totalMes > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 mb-6 grid grid-cols-3 gap-4 text-center">
          <div><p className="text-xs text-text-muted mb-1">IVA del mes</p><p className="text-sm font-semibold text-text-primary">{formatCurrency(ivaMes)}</p></div>
          <div><p className="text-xs text-text-muted mb-1">Costo del mes</p><p className="text-sm font-semibold text-text-primary">{formatCurrency(costosMes)}</p></div>
          <div><p className="text-xs text-text-muted mb-1">Margen %</p><p className="text-sm font-semibold text-green-600">{totalMes > 0 ? `${((gananciasMes / totalMes) * 100).toFixed(1)}%` : '—'}</p></div>
        </div>
      )}

      {/* Filtros tipo */}
      <div className="flex gap-2 mb-6">
        {(['todos', 'blanco_a', 'blanco_b', 'negro'] as FiltroTipo[]).map((f) => (
          <button key={f} onClick={() => setFiltroTipo(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroTipo === f ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}>
            {f === 'todos' ? 'Todos' : TIPO_LABEL[f as TipoVenta]}
          </button>
        ))}
      </div>

      {/* Gráfico barras */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <h3 className="text-base font-semibold text-text-primary mb-1">Ventas {anioFiltro} por tipo</h3>
        <p className="text-xs text-text-muted mb-5">Montos en ARS</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fill: '#475569', fontSize: 11 }} />
            <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }}
              formatter={(value: number, name: string) => [formatCurrency(value), name === 'blanco_a' ? 'Factura A' : name === 'blanco_b' ? 'Factura B' : 'Negro']} />
            <Legend formatter={(v) => v === 'blanco_a' ? 'Factura A' : v === 'blanco_b' ? 'Factura B' : 'Negro'} />
            <Bar dataKey="blanco_a" stackId="a" fill="#3b82f6" />
            <Bar dataKey="blanco_b" stackId="a" fill="#8b5cf6" />
            <Bar dataKey="negro" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tendencia */}
      <div className="bg-card rounded-xl border border-border p-6 mb-8">
        <h3 className="text-base font-semibold text-text-primary mb-1">Tendencia — últimos 12 meses</h3>
        <p className="text-xs text-text-muted mb-5">Ventas totales y ganancia en ARS</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={tendenciaData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} />
            <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }}
              formatter={(value: number, name: string) => [formatCurrency(value), name === 'ventas' ? 'Ventas' : 'Ganancia']} />
            <Legend />
            <Line type="monotone" dataKey="ventas" name="ventas" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="ganancia" name="ganancia" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-text-primary">
            Ventas de {MESES_CORTO[mesFiltro - 1]} {anioFiltro}
            <span className="ml-2 text-xs font-normal text-text-muted">({ventasMesFiltradas.length} registros)</span>
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-text-muted">Cargando...</div>
        ) : ventasMesFiltradas.length === 0 ? (
          <div className="p-8 text-center text-text-muted">No hay ventas en {MESES_CORTO[mesFiltro - 1]} {anioFiltro}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card-hover">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Razón social / Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">N° Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Total ARS</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {ventasMesFiltradas.map((row) => (
                <>
                  <tr key={row.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-text-primary">{formatDate(row.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TIPO_BG[row.tipo || 'blanco_a']}`}>{TIPO_LABEL[row.tipo || 'blanco_a']}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-text-primary text-xs font-medium">{row.razon_social || row.clientes?.nombre || '—'}</p>
                      {row.estudios?.nombre && <p className="text-text-muted text-xs">{row.estudios.nombre}</p>}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{row.numero_factura || '—'}</td>
                    <td className="px-4 py-3"><span className="font-semibold text-green-600">{formatCurrency(row.monto_ars)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === row.id ? null : row.id) }}
                          className="text-xs text-text-muted hover:text-accent transition-colors flex items-center gap-1">
                          {expandedId === row.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Detalle
                        </button>
                        <button onClick={() => handleDelete(row.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr key={`${row.id}-d`} className="bg-card-hover border-b border-border/50">
                      <td colSpan={6} className="px-4 py-4">
                        {/* Resumen financiero */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                          <div className="bg-card rounded-lg p-3 border border-border">
                            <p className="text-xs text-text-muted mb-1">Subtotal s/IVA</p>
                            <p className="text-sm font-semibold text-text-primary">{formatCurrency(row.subtotal || (row.monto_ars - (row.iva || 0)))}</p>
                          </div>
                          <div className="bg-card rounded-lg p-3 border border-border">
                            <p className="text-xs text-text-muted mb-1">IVA ({row.iva_pct || 0}%)</p>
                            <p className="text-sm font-semibold text-yellow-600">{formatCurrency(row.iva || 0)}</p>
                          </div>
                          <div className="bg-card rounded-lg p-3 border border-border">
                            <p className="text-xs text-text-muted mb-1">Costo</p>
                            <p className="text-sm font-semibold text-red-500">{formatCurrency(Number(row.costo || 0))}</p>
                          </div>
                          <div className="bg-card rounded-lg p-3 border border-border">
                            <p className="text-xs text-text-muted mb-1">Ganancia neta</p>
                            <p className={`text-sm font-semibold ${(row.ganancia || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(row.ganancia || 0)}</p>
                          </div>
                        </div>
                        {/* Info extra */}
                        <div className="flex gap-4 text-xs text-text-muted mb-3">
                          {row.garantia_desde && <span>Garantía desde: <span className="text-text-primary">{formatDate(row.garantia_desde)}</span></span>}
                          {row.moneda === 'usd' && <span>TC: ${Number(row.tipo_cambio).toLocaleString('es-AR')}</span>}
                          {row.archivo_url && <span className="flex items-center gap-1 text-accent"><FileText className="w-3 h-3" /> PDF adjunto</span>}
                        </div>
                        {/* Items de factura */}
                        {row.items && row.items.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-text-secondary mb-2">Items de la factura</p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-1 text-text-muted">SKU</th>
                                  <th className="text-left py-1 text-text-muted">Descripción</th>
                                  <th className="text-right py-1 text-text-muted">Cant.</th>
                                  <th className="text-right py-1 text-text-muted">P.Unit</th>
                                  <th className="text-right py-1 text-text-muted">Total</th>
                                  <th className="text-right py-1 text-text-muted">Costo</th>
                                  <th className="text-right py-1 text-text-muted">Ganancia</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.items.map((item, i) => (
                                  <tr key={i} className="border-b border-border/30">
                                    <td className="py-1 font-mono text-text-primary">{item.sku}</td>
                                    <td className="py-1 text-text-secondary max-w-48 truncate">{item.descripcion}</td>
                                    <td className="py-1 text-right text-text-primary">{item.cantidad}</td>
                                    <td className="py-1 text-right text-text-primary">{formatCurrency(item.precio_unitario)}</td>
                                    <td className="py-1 text-right font-semibold text-text-primary">{formatCurrency(item.total)}</td>
                                    <td className="py-1 text-right text-red-500">{item.costo_ars ? formatCurrency(item.costo_ars * item.cantidad) : '—'}</td>
                                    <td className={`py-1 text-right font-semibold ${(item.ganancia || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{item.ganancia !== undefined ? formatCurrency(item.ganancia) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal carga de venta */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title={pdfFile ? `Factura ${form.numero_factura || ''}` : 'Nueva venta'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Datos leídos del PDF — solo lectura con posibilidad de corregir */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">N° Factura</label>
              <input type="text" value={form.numero_factura} onChange={(e) => setForm({ ...form, numero_factura: e.target.value })} placeholder="0002-00000237" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
              <select value={form.tipo} onChange={(e) => { const t = e.target.value as TipoVenta; setForm({ ...form, tipo: t, iva_pct: String(IVA_DEFAULT[t]) }) }}>
                <option value="blanco_a">Factura A</option>
                <option value="blanco_b">Factura B</option>
                <option value="negro">Negro / Prueba</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Razón social (del PDF)</label>
            <input type="text" value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} placeholder="BULONERA VIETRI SRL" />
          </div>

          {/* Cliente con creación inline */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Cliente</label>
            <div className="flex gap-2">
              <select className="flex-1" value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" value={nuevoCliente} onChange={(e) => setNuevoCliente(e.target.value)}
                placeholder="Crear nuevo cliente..." className="flex-1 text-xs" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCrearCliente())} />
              <button type="button" onClick={handleCrearCliente} disabled={creandoCliente || !nuevoCliente.trim()}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors">
                {creandoCliente ? '...' : '+ Crear'}
              </button>
            </div>
          </div>

          {/* Estudio con creación inline */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Estudio que derivó</label>
            <div className="flex gap-2">
              <select className="flex-1" value={form.estudio_id} onChange={(e) => setForm({ ...form, estudio_id: e.target.value })}>
                <option value="">Sin estudio</option>
                {estudios.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" value={nuevoEstudio} onChange={(e) => setNuevoEstudio(e.target.value)}
                placeholder="Crear nuevo estudio..." className="flex-1 text-xs" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCrearEstudio())} />
              <button type="button" onClick={handleCrearEstudio} disabled={creandoEstudio || !nuevoEstudio.trim()}
                className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg disabled:opacity-40 hover:bg-accent-hover transition-colors">
                {creandoEstudio ? '...' : '+ Crear'}
              </button>
            </div>
          </div>

          {/* Fecha + garantía automática */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha de factura</label>
              <input type="date" value={form.fecha} onChange={(e) => {
                const f = e.target.value
                const garantia = f ? `${parseInt(f.slice(0,4)) + 7}${f.slice(4)}` : ''
                setForm({ ...form, fecha: f, garantia_desde: garantia })
              }} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Garantía hasta (auto +7 años)</label>
              <input type="date" value={form.garantia_desde} onChange={(e) => setForm({ ...form, garantia_desde: e.target.value })} />
            </div>
          </div>

          {/* Solo pide tipo de cambio */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Tipo de cambio (USD → ARS)
              <span className="text-text-muted font-normal ml-1 text-xs">— usado para calcular costos desde tu Excel en USD</span>
            </label>
            <input type="number" min="0" step="1" value={form.tipo_cambio}
              onChange={(e) => handleTcChange(e.target.value)}
              placeholder={`${tipoCambioDefault.toLocaleString('es-AR')} (valor guardado en Márgenes)`} />
          </div>

          {/* Resumen leído del PDF */}
          {(Number(form.monto) > 0 || Number(form.subtotal) > 0) && (
            <div className="bg-card-hover rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-text-secondary mb-3">Resumen de la factura</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-1">Subtotal s/IVA</p>
                  <p className="text-sm font-semibold text-text-primary">{formatCurrency(Number(form.subtotal) || 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-1">IVA</p>
                  <p className="text-sm font-semibold text-yellow-600">{formatCurrency(Number(form.iva_monto) || formIva)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-1">Total factura</p>
                  <p className="text-sm font-semibold text-text-primary">{formatCurrency(Number(form.monto) || 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-muted mb-1">Costo (SKUs)</p>
                  <p className="text-sm font-semibold text-red-500">{formatCurrency(Number(form.costo) || 0)}</p>
                </div>
              </div>
              {formMontoArs > 0 && (
                <div className="mt-3 pt-3 border-t border-border text-center">
                  <p className="text-xs text-text-muted mb-1">Ganancia estimada</p>
                  <p className={`text-lg font-bold ${formGanancia >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(formGanancia)}</p>
                </div>
              )}
            </div>
          )}

          {/* Items detectados */}
          {facturaItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-2">Items del PDF ({facturaItems.length} productos)</p>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-card-hover sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-text-muted">SKU</th>
                      <th className="text-right px-3 py-2 text-text-muted">Cant</th>
                      <th className="text-right px-3 py-2 text-text-muted">Venta</th>
                      <th className="text-right px-3 py-2 text-text-muted">Costo ARS</th>
                      <th className="text-right px-3 py-2 text-text-muted">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturaItems.map((item, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-1.5 font-mono text-text-primary">{item.sku}</td>
                        <td className="px-3 py-1.5 text-right text-text-secondary">{item.cantidad}</td>
                        <td className="px-3 py-1.5 text-right text-text-primary">{formatCurrency(item.total)}</td>
                        <td className="px-3 py-1.5 text-right text-red-500">{item.costo_ars ? formatCurrency((item.costo_ars || 0) * item.cantidad) : <span className="text-text-muted">—</span>}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${(item.ganancia || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {item.ganancia !== undefined ? formatCurrency(item.ganancia) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {facturaItems.some(i => !i.costo_ars) && (
                <p className="text-xs text-yellow-600 mt-1">⚠ Algunos SKUs no tienen costo en Márgenes — cargalos para ver ganancia por ítem.</p>
              )}
            </div>
          )}

          {pdfFile && (
            <div className="flex items-center gap-2 p-2 bg-card-hover rounded-lg border border-border text-xs text-text-secondary">
              <FileText className="w-4 h-4 text-accent" />
              <span>{pdfFile.name}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción / Notas</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Notas adicionales..." rows={2} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); resetForm() }} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving || uploadingPdf} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">
              {saving ? (uploadingPdf ? 'Subiendo PDF...' : 'Guardando...') : 'Guardar venta'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
