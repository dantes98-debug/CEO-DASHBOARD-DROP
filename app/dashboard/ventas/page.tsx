'use client'

import { useEffect, useState, useRef, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import FacturaUploader, { type FacturaParseada } from '@/components/FacturaUploader'
import { formatCurrency, formatDate, getMonthName } from '@/lib/utils'
import { TrendingUp, Plus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileText, ExternalLink, Search, Download } from 'lucide-react'
import { exportarExcel } from '@/lib/exportar'
import { toast } from 'sonner'
import RowMenu from '@/components/RowMenu'
import ConfirmDialog from '@/components/ConfirmDialog'
import MonthPicker from '@/components/MonthPicker'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts'

type TipoVenta = 'blanco_a' | 'blanco_b' | 'negro'
type Moneda = 'ars' | 'usd'
type FiltroTipo = 'todos' | TipoVenta
type Canal = 'meta' | 'equipo_comercial' | 'referido' | 'organico' | 'otro'
type MetodoPago = 'efectivo_drop' | 'efectivo_motic' | 'transferencia_motic' | 'mercado_pago' | 'echeq'

const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo_drop: 'Efectivo Drop',
  efectivo_motic: 'Efectivo Motic',
  transferencia_motic: 'Transferencia Motic',
  mercado_pago: 'Mercado Pago',
  echeq: 'Echeq',
}

const TIPO_LABEL: Record<TipoVenta, string> = { blanco_a: 'Factura A', blanco_b: 'Factura B', negro: 'Negro' }
const TIPO_COLOR: Record<TipoVenta, string> = { blanco_a: 'text-blue-400', blanco_b: 'text-purple-400', negro: 'text-yellow-400' }
const TIPO_BG: Record<TipoVenta, string> = { blanco_a: 'bg-blue-50 text-blue-700 border-blue-200', blanco_b: 'bg-purple-50 text-purple-700 border-purple-200', negro: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
const IVA_DEFAULT: Record<TipoVenta, number> = { blanco_a: 21, blanco_b: 21, negro: 0 }

const CANAL_LABEL: Record<Canal, string> = {
  meta: 'Meta Ads', equipo_comercial: 'Equipo Comercial',
  referido: 'Referido', organico: 'Orgánico', otro: 'Otro',
}
const CANAL_STYLE: Record<Canal, string> = {
  meta: 'bg-blue-100 text-blue-700 border-blue-200',
  equipo_comercial: 'bg-green-100 text-green-700 border-green-200',
  referido: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  organico: 'bg-purple-100 text-purple-700 border-purple-200',
  otro: 'bg-gray-100 text-gray-600 border-gray-200',
}
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
  canal: Canal
  metodo_pago: MetodoPago | null
  comision_tipo: 'nominal' | 'porcentaje' | null
  comision_valor: number | null
  clientes?: { nombre: string } | null
  estudios?: { nombre: string } | null
  created_at: string
  iva?: number
  ganancia?: number
  comision_monto?: number
}

interface Cliente { id: string; nombre: string }
interface Estudio { id: string; nombre: string }
interface Producto { sku: string; codigo: string; costo_usd: number; nombre?: string }

// Acepta tanto "123.456,78" (AR) como "123456.78" (US) como "123456,78"
function parseN(s: string | number): number {
  const str = String(s ?? '').trim()
  if (!str) return 0
  if (str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(str) || 0
}

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
  const [busqueda, setBusqueda] = useState('')
  const [clienteFiltro, setClienteFiltro] = useState('')

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
    canal: 'equipo_comercial' as Canal,
    metodo_pago: '' as MetodoPago | '',
    comision_tipo: '' as 'nominal' | 'porcentaje' | '',
    comision_valor: '',
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
  const [showComision, setShowComision] = useState(false)
  const [nuevoItem, setNuevoItem] = useState({ sku: '', cantidad: '1', precio: '' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [ventasRes, clientesRes, estudiosRes, productosRes, configRes] = await Promise.all([
      supabase.from('ventas').select('*, clientes(nombre), estudios(nombre)').order('fecha', { ascending: false }),
      supabase.from('clientes').select('id, nombre').order('nombre'),
      supabase.from('estudios').select('id, nombre').order('nombre'),
      supabase.from('productos').select('sku, codigo, costo_usd, nombre').not('sku', 'is', null),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
    ])
    const tc = Number(configRes.data?.valor || 1000)
    setTipoCambioDefault(tc)
    const withCalc = (ventasRes.data || []).map((v) => {
      let montoArs = v.moneda === 'usd' ? Number(v.monto) * Number(v.tipo_cambio || tc) : Number(v.monto)
      // Si el monto guardado es 0 pero hay items, recalcular desde items
      if (montoArs === 0 && Array.isArray(v.items) && v.items.length > 0) {
        montoArs = v.items.reduce((s: number, item: { precio_unitario: number; cantidad: number }) => s + (item.precio_unitario * item.cantidad), 0)
      }
      const ivaMonto = v.iva_monto || (montoArs / (1 + Number(v.iva_pct || 0) / 100)) * (Number(v.iva_pct || 0) / 100)
      const neto = Number(v.subtotal) || (montoArs - ivaMonto)
      const comision_monto = v.comision_tipo === 'nominal'
        ? Number(v.comision_valor || 0)
        : v.comision_tipo === 'porcentaje'
          ? neto * Number(v.comision_valor || 0) / 100
          : 0
      const ganancia = montoArs - Number(v.costo || 0) - ivaMonto - comision_monto
      return { ...v, monto_ars: montoArs, iva: ivaMonto, ganancia, comision_monto }
    })
    setVentas(withCalc)
    setClientes(clientesRes.data || [])
    setEstudios(estudiosRes.data || [])
    setProductos(productosRes.data || [])
    setLoading(false)
  }

  const enrichItems = (items: ItemFactura[], tc: number) =>
    items.map((item) => {
      const key = item.sku?.toLowerCase()
      const prod = productos.find(p =>
        p.sku?.toLowerCase() === key || p.codigo?.toLowerCase() === key
      )
      const costoArs = prod ? Number(prod.costo_usd) * tc : 0
      const itemTotal = item.precio_unitario * item.cantidad
      const ganancia = itemTotal - costoArs * item.cantidad
      return { ...item, costo_usd: 0, costo_ars: costoArs, ganancia }
    })

  // When PDF is parsed
  const handleFacturaParsed = (data: FacturaParseada) => {
    const tc = tipoCambioDefault
    const enrichedItems = enrichItems(data.items, tc)

    // Si la suma de PARCIALs difiere del neto real (total − IVA), escalar los totales
    // para que items y resumen muestren la misma ganancia
    const parcialSum = enrichedItems.reduce((s, i) => s + i.total, 0)
    const actualNet = data.total > 0 && data.iva_monto > 0
      ? data.total - data.iva_monto
      : parcialSum
    const scaleFactor = parcialSum > 0 && Math.abs(parcialSum - actualNet) > 1
      ? actualNet / parcialSum
      : 1
    const finalItems = scaleFactor !== 1
      ? enrichedItems.map(item => {
          const netTotal = Math.round(item.total * scaleFactor * 100) / 100
          return { ...item, total: netTotal, ganancia: netTotal - (item.costo_ars || 0) * item.cantidad }
        })
      : enrichedItems

    const totalCosto = finalItems.reduce((s, i) => s + (i.costo_ars || 0) * i.cantidad, 0)
    // Garantia = fecha + 7 años
    const garantia = data.fecha ? `${parseInt(data.fecha.slice(0,4)) + 7}${data.fecha.slice(4)}` : ''

    setFacturaItems(finalItems)
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
    const tc = form.moneda === 'usd' ? parseN(form.tipo_cambio) || tipoCambioDefault : 1
    const montoArs = form.moneda === 'usd' ? parseN(form.monto) * tc : parseN(form.monto)

    let archivo_url = null
    if (pdfFile) {
      setUploadingPdf(true)
      const fileName = `${Date.now()}_${pdfFile.name.replace(/\s/g, '_')}`
      const { data: upData, error: upError } = await supabase.storage.from('facturas').upload(fileName, pdfFile)
      if (upError) console.error('Storage upload error:', upError)
      archivo_url = upData?.path || null
      setUploadingPdf(false)
    }

    const payload = {
      fecha: form.fecha,
      cliente_id: form.cliente_id || null,
      estudio_id: form.estudio_id || null,
      monto: parseN(form.monto),
      moneda: form.moneda,
      tipo_cambio: tc,
      monto_ars: montoArs,
      tipo: form.tipo,
      costo: parseN(form.costo),
      iva_pct: parseN(form.iva_pct),
      iva_monto: parseN(form.iva_monto),
      subtotal: parseN(form.subtotal),
      canal: form.canal,
      metodo_pago: form.metodo_pago || null,
      comision_tipo: form.comision_tipo || null,
      comision_valor: form.comision_tipo && form.comision_valor ? parseN(form.comision_valor) : null,
      descripcion: form.descripcion || null,
      numero_factura: form.numero_factura || null,
      razon_social: form.razon_social || null,
      garantia_desde: form.garantia_desde || null,
      items: facturaItems.length > 0
        ? facturaItems.map(i => ({ ...i, descripcion: i.descripcion?.replace(/[^ -~À-ɏ]/g, '') || '' }))
        : null,
      archivo_url: archivo_url ?? (editTarget?.archivo_url || null),
    }

    const { error: saveError } = editTarget
      ? await supabase.from('ventas').update(payload).eq('id', editTarget.id)
      : await supabase.from('ventas').insert(payload)

    if (saveError) {
      console.error('Save error:', saveError)
      toast.error(`Error al guardar: ${saveError.message}`)
      setSaving(false)
      return
    }
    const teniaPdf = !!pdfFile
    const savedDate = new Date(form.fecha + 'T12:00:00')
    setMesFiltro(savedDate.getMonth() + 1)
    setAnioFiltro(savedDate.getFullYear())
    await fetchData()
    setModalOpen(false)
    resetForm()
    setSaving(false)
    toast.success(editTarget ? 'Venta actualizada correctamente' : teniaPdf ? 'Factura cargada correctamente' : 'Venta registrada correctamente')
  }

  const resetForm = () => {
    setEditTarget(null)
    setForm({ fecha: new Date().toISOString().split('T')[0], cliente_id: '', estudio_id: '', monto: '', moneda: 'ars', tipo_cambio: '', tipo: 'blanco_a', canal: 'equipo_comercial', metodo_pago: '', comision_tipo: '', comision_valor: '', costo: '', iva_pct: '21', descripcion: '', numero_factura: '', razon_social: '', garantia_desde: '', subtotal: '', iva_monto: '' })
    setShowComision(false)
    setFacturaItems([])
    setPdfFile(null)
    setNuevoItem({ sku: '', cantidad: '1', precio: '' })
  }

  const handleAddItem = () => {
    const sku = nuevoItem.sku.trim().toUpperCase()
    if (!sku) return
    const tc = parseN(form.tipo_cambio) || tipoCambioDefault
    const prod = productos.find(p =>
      p.sku?.toUpperCase() === sku || p.codigo?.toUpperCase() === sku
    )
    const costoArs = prod ? Number(prod.costo_usd) * tc : 0
    const cant = Math.max(1, parseInt(nuevoItem.cantidad) || 1)
    const precio = parseN(nuevoItem.precio)
    const total = precio || 0
    const item: ItemFactura = {
      sku,
      descripcion: prod?.nombre || sku,
      cantidad: cant,
      precio_unitario: cant > 0 ? total / cant : 0,
      total,
      costo_usd: 0,
      costo_ars: costoArs,
      ganancia: total - costoArs * cant,
    }
    const next = [...facturaItems, item]
    setFacturaItems(next)
    const totalCosto = next.reduce((s, i) => s + (i.costo_ars || 0) * i.cantidad, 0)
    setForm(f => ({ ...f, costo: String(totalCosto.toFixed(0)) }))
    setNuevoItem({ sku: '', cantidad: '1', precio: '' })
  }

  const handleRemoveItem = (idx: number) => {
    const next = facturaItems.filter((_, i) => i !== idx)
    setFacturaItems(next)
    const totalCosto = next.reduce((s, i) => s + (i.costo_ars || 0) * i.cantidad, 0)
    setForm(f => ({ ...f, costo: String(totalCosto.toFixed(0)) }))
  }

  const [editTarget, setEditTarget] = useState<Venta | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Venta | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openEdit = (v: Venta) => {
    setEditTarget(v)
    setForm({
      fecha: v.fecha,
      cliente_id: v.cliente_id || '',
      estudio_id: v.estudio_id || '',
      monto: String(v.monto),
      moneda: v.moneda,
      tipo_cambio: String(v.tipo_cambio || ''),
      tipo: v.tipo,
      canal: v.canal || 'equipo_comercial',
      metodo_pago: (v.metodo_pago || '') as MetodoPago | '',
      comision_tipo: (v.comision_tipo || '') as 'nominal' | 'porcentaje' | '',
      comision_valor: String(v.comision_valor || ''),
      costo: String(v.costo || ''),
      iva_pct: String(v.iva_pct || '21'),
      descripcion: v.descripcion || '',
      numero_factura: v.numero_factura || '',
      razon_social: v.razon_social || '',
      garantia_desde: v.garantia_desde || '',
      subtotal: String(v.subtotal || ''),
      iva_monto: String(v.iva_monto || ''),
    })
    setFacturaItems((v.items || []) as ItemFactura[])
    setShowComision(!!v.comision_tipo)
    setPdfFile(null)
    setModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('ventas').delete().eq('id', deleteTarget.id)
    await fetchData()
    toast.success('Venta eliminada')
    setDeleteTarget(null)
    setDeleting(false)
  }

  const navegarMes = (dir: -1 | 1) => {
    const d = new Date(anioFiltro, mesFiltro - 1 + dir, 1)
    setMesFiltro(d.getMonth() + 1)
    setAnioFiltro(d.getFullYear())
  }

  const mesStart = `${anioFiltro}-${String(mesFiltro).padStart(2, '0')}-01`
  const mesEnd = new Date(anioFiltro, mesFiltro, 0).toISOString().split('T')[0]
  const ventasMes = ventas.filter(v => v.fecha >= mesStart && v.fecha <= mesEnd)
  const ventasMesFiltradas = ventasMes.filter(v => {
    const matchTipo = filtroTipo === 'todos' || v.tipo === filtroTipo
    const matchBusqueda = !busqueda ||
      v.razon_social?.toLowerCase().includes(busqueda.toLowerCase()) ||
      v.numero_factura?.toLowerCase().includes(busqueda.toLowerCase())
    const matchCliente = !clienteFiltro || v.cliente_id === clienteFiltro
    return matchTipo && matchBusqueda && matchCliente
  })

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
  const formNeto = Number(form.subtotal) || (formMontoArs - formIva)
  const formComision = form.comision_tipo === 'nominal'
    ? Number(form.comision_valor || 0)
    : form.comision_tipo === 'porcentaje'
      ? formNeto * Number(form.comision_valor || 0) / 100
      : 0
  const formGanancia = formMontoArs - Number(form.costo || 0) - formIva - formComision
  const esMesActual = mesFiltro === hoy.getMonth() + 1 && anioFiltro === hoy.getFullYear()

  const openManual = () => { resetForm(); setModalOpen(true) }

  const updateItem = (idx: number, field: 'cantidad' | 'total' | 'costo_ars', raw: string) => {
    const val = parseN(raw)
    setFacturaItems(prev => {
      const next = prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [field]: field === 'costo_ars' ? val : val }
        // recalculate ganancia: total - costo_ars_unitario * cantidad
        const costoUnit = field === 'costo_ars' ? val : (item.costo_ars || 0)
        const cant = field === 'cantidad' ? val : item.cantidad
        const total = field === 'total' ? val : item.total
        updated.ganancia = total - costoUnit * cant
        updated.costo_ars = costoUnit
        updated.cantidad = cant
        updated.total = total
        return updated
      })
      // sync form.costo = sum of costo_ars * cantidad
      const totalCosto = next.reduce((s, it) => s + (it.costo_ars || 0) * it.cantidad, 0)
      setForm(f => ({ ...f, costo: String(totalCosto.toFixed(0)) }))
      return next
    })
  }

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Registro de ventas y facturación"
        icon={TrendingUp}
        action={
          <div className="flex gap-2">
            <a
              href="https://gmo.zomatik.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-border hover:bg-card-hover text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Sistema Motic
            </a>
            <FacturaUploader onParsed={handleFacturaParsed} />
            <button
              onClick={() => exportarExcel(
                ventasMesFiltradas.map(v => ({
                  Fecha: v.fecha,
                  Canal: v.canal || '',
                  Tipo: TIPO_LABEL[v.tipo || 'blanco_a'],
                  'Razón Social': v.razon_social || '',
                  'N° Factura': v.numero_factura || '',
                  'Total ARS': v.monto_ars,
                  'Costo ARS': Number(v.costo || 0),
                  Ganancia: v.ganancia || 0,
                  'Margen %': v.monto_ars > 0 ? ((v.ganancia || 0) / v.monto_ars * 100).toFixed(1) : '—',
                })),
                `ventas-${MESES_CORTO[mesFiltro - 1].toLowerCase()}-${anioFiltro}`
              )}
              className="flex items-center gap-2 border border-border hover:bg-card-hover text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" /> Exportar
            </button>
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
        <MonthPicker
          value={`${anioFiltro}-${String(mesFiltro).padStart(2, '0')}`}
          onChange={(ym) => {
            const [y, m] = ym.split('-').map(Number)
            setAnioFiltro(y)
            setMesFiltro(m)
          }}
        />
        {esMesActual && <span className="text-xs font-normal text-accent bg-accent/10 px-2 py-0.5 rounded-full">actual</span>}
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
        <div className="bg-card border border-border rounded-xl p-4 mb-6 grid grid-cols-4 gap-4 text-center">
          <div><p className="text-xs text-text-muted mb-1">IVA del mes</p><p className="text-sm font-semibold text-text-primary">{formatCurrency(ivaMes)}</p></div>
          <div><p className="text-xs text-text-muted mb-1">Costo del mes</p><p className="text-sm font-semibold text-text-primary">{formatCurrency(costosMes)}</p></div>
          <div><p className="text-xs text-text-muted mb-1">Margen %</p><p className="text-sm font-semibold text-green-600">{totalMes > 0 ? `${((gananciasMes / totalMes) * 100).toFixed(1)}%` : '—'}</p></div>
          <div><p className="text-xs text-text-muted mb-1">ROI</p><p className="text-sm font-semibold text-blue-600">{costosMes > 0 ? `${((gananciasMes / costosMes) * 100).toFixed(1)}%` : '—'}</p></div>
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
        <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm font-semibold text-text-primary shrink-0">
            Ventas de {MESES_CORTO[mesFiltro - 1]} {anioFiltro}
            <span className="ml-2 text-xs font-normal text-text-muted">({ventasMesFiltradas.length} registros)</span>
          </p>
          <div className="flex gap-2 flex-wrap items-center ml-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Razón social, N° factura..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="pl-8 py-1.5 text-xs w-52 border border-border rounded-lg bg-card-hover focus:outline-none focus:border-accent"
              />
            </div>
            <select
              value={clienteFiltro}
              onChange={e => setClienteFiltro(e.target.value)}
              className="py-1.5 text-xs border border-border rounded-lg bg-card-hover focus:outline-none focus:border-accent"
            >
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {(busqueda || clienteFiltro) && (
              <button
                onClick={() => { setBusqueda(''); setClienteFiltro('') }}
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                ✕ Limpiar
              </button>
            )}
          </div>
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
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Canal</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Razón social / Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">N° Factura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Total ARS</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {ventasMesFiltradas.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-text-primary">{formatDate(row.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CANAL_STYLE[row.canal || 'equipo_comercial']}`}>{CANAL_LABEL[row.canal || 'equipo_comercial']}</span>
                    </td>
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
                      <RowMenu actions={[
                        { label: 'Editar', onClick: () => openEdit(row) },
                        { label: 'Ver detalle', onClick: () => setExpandedId(expandedId === row.id ? null : row.id) },
                        { label: 'Eliminar', onClick: () => setDeleteTarget(row), variant: 'danger' },
                      ]} />
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr className="bg-card-hover border-b border-border/50">
                      <td colSpan={7} className="px-4 py-4">
                        {/* Resumen financiero */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
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
                          <div className="bg-card rounded-lg p-3 border border-border">
                            <p className="text-xs text-text-muted mb-1">ROI</p>
                            <p className={`text-sm font-semibold ${(row.ganancia || 0) >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                              {Number(row.costo) > 0 ? `${(((row.ganancia || 0) / Number(row.costo)) * 100).toFixed(1)}%` : '—'}
                            </p>
                          </div>
                        </div>
                        {/* Info extra */}
                        <div className="flex gap-4 text-xs text-text-muted mb-3 flex-wrap">
                          {row.metodo_pago && <span>Pago: <span className="text-text-primary font-medium">{METODO_PAGO_LABEL[row.metodo_pago]}</span></span>}
                          {row.comision_monto != null && row.comision_monto > 0 && (
                            <span>Comisión: <span className="text-yellow-500 font-medium">
                              {formatCurrency(row.comision_monto)}
                              {row.comision_tipo === 'porcentaje' && ` (${row.comision_valor}%)`}
                            </span></span>
                          )}
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
                                    <td className="py-1 text-right font-semibold text-text-primary">{formatCurrency(item.precio_unitario * item.cantidad)}</td>
                                    <td className="py-1 text-right text-red-500">{item.costo_ars ? formatCurrency(item.costo_ars * item.cantidad) : '—'}</td>
                                    <td className={`py-1 text-right font-semibold ${((item.precio_unitario * item.cantidad) - (item.costo_ars || 0) * item.cantidad) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{item.costo_ars !== undefined ? formatCurrency((item.precio_unitario * item.cantidad) - (item.costo_ars * item.cantidad)) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal carga de venta */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="¿Eliminar esta venta?"
        description={deleteTarget && (
          <>Se eliminará la venta de <strong>{deleteTarget.razon_social || '—'}</strong> por <strong>{formatCurrency(deleteTarget.monto_ars)}</strong> del {formatDate(deleteTarget.fecha)}. Esta acción no se puede deshacer.</>
        )}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title={editTarget ? `Editar venta${form.numero_factura ? ` · ${form.numero_factura}` : ''}` : pdfFile ? `Factura ${form.numero_factura || ''}` : 'Nueva venta'} size="lg">
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
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Canal de origen</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CANAL_LABEL) as Canal[]).map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, canal: c })}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    form.canal === c
                      ? `border-current ${CANAL_STYLE[c]}`
                      : 'border-border text-text-secondary hover:bg-card-hover'
                  }`}>
                  {CANAL_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Método de pago</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(METODO_PAGO_LABEL) as MetodoPago[]).map((m) => (
                <button key={m} type="button" onClick={() => setForm({ ...form, metodo_pago: form.metodo_pago === m ? '' : m })}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    form.metodo_pago === m
                      ? 'bg-accent border-accent text-white'
                      : 'border-border text-text-secondary hover:bg-card-hover'
                  }`}>
                  {METODO_PAGO_LABEL[m]}
                </button>
              ))}
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
            <input type="text" inputMode="decimal" value={form.tipo_cambio}
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
                <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                  <p className="text-xs font-semibold text-text-secondary mb-2">Cómo se calcula la ganancia</p>
                  {[
                    { label: 'Total factura',   value:  formMontoArs,                  color: 'text-text-primary', prefix: '' },
                    { label: `IVA (${form.iva_pct || 0}%)`, value: -(Number(form.iva_monto) || formIva), color: 'text-yellow-500', prefix: '−' },
                    { label: 'Costo SKUs',      value: -parseN(form.costo),            color: 'text-red-400',      prefix: '−' },
                    ...(formComision > 0 ? [{ label: 'Comisión', value: -formComision, color: 'text-orange-400', prefix: '−' }] : []),
                  ].map(({ label, value, color, prefix }) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{label}</span>
                      <span className={`font-medium ${color}`}>{prefix}{formatCurrency(Math.abs(value))}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1.5 border-t border-border">
                    <span className="text-xs font-semibold text-text-secondary">= Ganancia</span>
                    <span className={`text-base font-bold ${formGanancia >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatCurrency(formGanancia)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Items — editables + agregar manual */}
          <div>
            <p className="text-xs font-semibold text-text-secondary mb-2">
              Productos {facturaItems.length > 0 && `(${facturaItems.length})`}
            </p>

            {/* Fila para agregar nuevo item */}
            <div className="flex gap-2 mb-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-text-muted mb-1">SKU / Código</label>
                <input
                  type="text"
                  placeholder="Ej: MA101"
                  value={nuevoItem.sku}
                  onChange={e => setNuevoItem(n => ({ ...n, sku: e.target.value.toUpperCase() }))}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                  list="productos-list"
                  className="text-xs"
                />
                <datalist id="productos-list">
                  {productos.map(p => (
                    <option key={p.sku} value={p.sku}>{p.nombre || p.sku}</option>
                  ))}
                </datalist>
              </div>
              <div className="w-16">
                <label className="block text-xs text-text-muted mb-1">Cant.</label>
                <input type="number" min="1" step="1" value={nuevoItem.cantidad}
                  onChange={e => setNuevoItem(n => ({ ...n, cantidad: e.target.value }))}
                  className="text-xs text-center" />
              </div>
              <div className="w-28">
                <label className="block text-xs text-text-muted mb-1">Precio venta</label>
                <input type="text" inputMode="decimal" placeholder="0" value={nuevoItem.precio}
                  onChange={e => setNuevoItem(n => ({ ...n, precio: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                  className="text-xs text-right" />
              </div>
              <button type="button" onClick={handleAddItem}
                className="px-3 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0">
                + Agregar
              </button>
            </div>

            {/* Tabla de items */}
            {facturaItems.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-card-hover sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-text-muted">SKU</th>
                      <th className="text-center px-2 py-2 text-text-muted">Cant</th>
                      <th className="text-right px-2 py-2 text-text-muted">Venta total</th>
                      <th className="text-right px-2 py-2 text-text-muted">Costo unit ARS</th>
                      <th className="text-right px-3 py-2 text-text-muted">Ganancia</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturaItems.map((item, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-1.5 font-mono text-text-primary">{item.sku}</td>
                        <td className="px-2 py-1">
                          <input type="number" min="1" step="1" value={item.cantidad}
                            onChange={e => updateItem(i, 'cantidad', e.target.value)}
                            className="w-14 text-center text-xs px-1 py-1 rounded border border-border bg-card text-text-primary focus:border-accent focus:outline-none" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="text" inputMode="decimal" value={item.total}
                            onChange={e => updateItem(i, 'total', e.target.value)}
                            className="w-28 text-right text-xs px-1 py-1 rounded border border-border bg-card text-text-primary focus:border-accent focus:outline-none" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="text" inputMode="decimal" value={item.costo_ars || 0}
                            onChange={e => updateItem(i, 'costo_ars', e.target.value)}
                            className="w-28 text-right text-xs px-1 py-1 rounded border border-border bg-card text-red-400 focus:border-accent focus:outline-none" />
                        </td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${(item.ganancia || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {formatCurrency(item.ganancia || 0)}
                        </td>
                        <td className="px-2 py-1">
                          <button type="button" onClick={() => handleRemoveItem(i)}
                            className="text-red-400 hover:text-red-300 transition-colors text-xs">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pdfFile && (
            <div className="flex items-center gap-2 p-2 bg-card-hover rounded-lg border border-border text-xs text-text-secondary">
              <FileText className="w-4 h-4 text-accent" />
              <span>{pdfFile.name}</span>
            </div>
          )}

          {/* Comisión — compacto, solo visible si se activa */}
          <div>
            <button type="button" onClick={() => { setShowComision(v => !v); if (showComision) setForm(f => ({ ...f, comision_tipo: '', comision_valor: '' })) }}
              className={`flex items-center gap-2 text-xs font-medium transition-colors ${showComision ? 'text-yellow-500' : 'text-text-muted hover:text-text-primary'}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showComision ? 'bg-yellow-500 border-yellow-500 text-white' : 'border-border'}`}>
                {showComision && <span className="text-[10px] leading-none">✓</span>}
              </span>
              Hay comisión en esta venta
            </button>
            {showComision && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  <button type="button" onClick={() => setForm(f => ({ ...f, comision_tipo: 'nominal' }))}
                    className={`px-3 py-1.5 transition-colors ${form.comision_tipo === 'nominal' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}>
                    $ Monto fijo
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, comision_tipo: 'porcentaje' }))}
                    className={`px-3 py-1.5 border-l border-border transition-colors ${form.comision_tipo === 'porcentaje' ? 'bg-accent text-white' : 'text-text-secondary hover:bg-card-hover'}`}>
                    % sobre neto
                  </button>
                </div>
                {form.comision_tipo && (
                  <div className="flex items-center gap-1 flex-1 min-w-32">
                    <input type="text" inputMode="decimal" value={form.comision_valor}
                      onChange={e => setForm(f => ({ ...f, comision_valor: e.target.value }))}
                      placeholder={form.comision_tipo === 'porcentaje' ? 'ej: 5' : 'ej: 15000'}
                      className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-card text-text-primary focus:border-accent focus:outline-none" />
                    <span className="text-xs text-text-muted">{form.comision_tipo === 'porcentaje' ? '%' : 'ARS'}</span>
                    {formComision > 0 && <span className="text-xs text-yellow-500 font-medium">= {formatCurrency(formComision)}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

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
