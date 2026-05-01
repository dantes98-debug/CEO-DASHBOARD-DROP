'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import RowMenu from '@/components/RowMenu'
import ConfirmDialog from '@/components/ConfirmDialog'
import Private from '@/components/Private'
import { formatCurrency, formatDate, getMonthName } from '@/lib/utils'
import {
  ShoppingCart, Plus, ChevronLeft, ChevronRight,
  Building2, Package, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Proveedor {
  id: string
  nombre: string
  contacto: string | null
  email: string | null
  telefono: string | null
  notas: string | null
  created_at: string
}

interface Compra {
  id: string
  fecha: string
  proveedor_id: string | null
  producto_id: string | null
  descripcion: string
  cantidad: number
  precio_unit: number
  moneda: 'ars' | 'usd'
  tipo_cambio: number
  iva_pct: number
  neto: number
  iva_monto: number
  monto_total: number
  monto_ars: number
  estado_pago: 'pagado' | 'pendiente' | 'parcial'
  monto_pagado: number
  notas: string | null
  created_at: string
  proveedores: { nombre: string } | null
  productos: { nombre: string } | null
}

interface StockItem {
  id: string
  linea: string | null
  codigo: string | null
  sku: string | null
  articulo: string
  cantidad_villa_martelli: number
  cantidad_nordelta: number
  cantidad_total: number
  costo: number
  total_costo: number
  cantidad_reserva: number | null
  producto_id: string | null
  tipo: string
  productos: { nombre: string; costo_usd: number; costo: number } | null
}

interface ProductoDB {
  id: string
  nombre: string
  costo: number
  costo_usd: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADOS = [
  { key: 'pendiente', label: 'Pendiente', color: '#f59e0b' },
  { key: 'parcial',   label: 'Parcial',   color: '#3b82f6' },
  { key: 'pagado',    label: 'Pagado',    color: '#22c55e' },
] as const

type EstadoPago = typeof ESTADOS[number]['key']

const IVA_OPTS = [
  { v: '0',    l: '0%' },
  { v: '10.5', l: '10.5%' },
  { v: '21',   l: '21%' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPadMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return getPadMonth(d)
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${getMonthName(m)} ${y}`
}

function recalcCompra(cant: number, pu: number, moneda: string, tc: number, iva: number) {
  const neto = cant * pu
  const ivaMonto = Math.round(neto * iva / 100)
  const montoTotal = neto + ivaMonto
  const montoArs = moneda === 'usd' ? Math.round(montoTotal * tc) : montoTotal
  return { neto, ivaMonto, montoTotal, montoArs }
}

function EstadoBadge({ estado }: { estado: EstadoPago }) {
  const e = ESTADOS.find(x => x.key === estado)!
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: e.color + '22', color: e.color }}
    >
      {e.label}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ComprasPage() {
  const [tab, setTab] = useState<'compras' | 'proveedores' | 'stock'>('compras')
  const [compras, setCompras] = useState<Compra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [stock, setStock] = useState<StockItem[]>([])
  const [productos, setProductos] = useState<ProductoDB[]>([])
  const [tcActual, setTcActual] = useState(1000)
  const [loading, setLoading] = useState(true)
  const [mesFiltro, setMesFiltro] = useState(getPadMonth(new Date()))

  // Compra modal state
  const [compraModal, setCompraModal] = useState(false)
  const [editCompra, setEditCompra] = useState<Compra | null>(null)
  const [deleteCompra, setDeleteCompra] = useState<Compra | null>(null)
  const [deletingCompra, setDeletingCompra] = useState(false)
  const [savingCompra, setSavingCompra] = useState(false)

  const initCompraForm = () => ({
    fecha: new Date().toISOString().split('T')[0],
    proveedor_id: '',
    producto_id: '',
    descripcion: '',
    cantidad: '1',
    precio_unit: '',
    moneda: 'ars' as 'ars' | 'usd',
    tipo_cambio: String(tcActual),
    iva_pct: '21',
    estado_pago: 'pendiente' as EstadoPago,
    monto_pagado: '',
    notas: '',
  })
  const [compraForm, setCompraForm] = useState(initCompraForm)

  // Proveedor modal state
  const [provModal, setProvModal] = useState(false)
  const [editProv, setEditProv] = useState<Proveedor | null>(null)
  const [deleteProv, setDeleteProv] = useState<Proveedor | null>(null)
  const [deletingProv, setDeletingProv] = useState(false)
  const [savingProv, setSavingProv] = useState(false)
  const initProvForm = () => ({ nombre: '', contacto: '', email: '', telefono: '', notas: '' })
  const [provForm, setProvForm] = useState(initProvForm)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [comprasRes, provsRes, stockRes, prodsRes, configRes] = await Promise.all([
      supabase.from('compras').select('*, proveedores(nombre), productos(nombre)').order('fecha', { ascending: false }),
      supabase.from('proveedores').select('*').order('nombre'),
      supabase.from('stock').select('*, productos(nombre, costo_usd, costo)').order('articulo'),
      supabase.from('productos').select('id, nombre, costo, costo_usd'),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
    ])
    setCompras((comprasRes.data || []) as Compra[])
    setProveedores((provsRes.data || []) as Proveedor[])
    setStock((stockRes.data || []) as StockItem[])
    setProductos((prodsRes.data || []) as ProductoDB[])
    const tc = Number(configRes.data?.valor || 1000)
    setTcActual(tc)
    setLoading(false)
  }

  // ─── Metrics ────────────────────────────────────────────────────────────────

  const pendienteTotal = compras.reduce((s, c) => {
    if (c.estado_pago === 'pagado') return s
    return s + (Number(c.monto_ars) - Number(c.monto_pagado))
  }, 0)

  const mesStart = `${mesFiltro}-01`
  const mesEnd   = `${mesFiltro}-31`
  const comprasMes = compras.filter(c => c.fecha >= mesStart && c.fecha <= mesEnd)
  const totalMes = comprasMes.reduce((s, c) => s + Number(c.monto_ars), 0)

  const valorStock = stock.reduce((s, item) => {
    const prod = item.productos
    const costoTotal = prod?.costo_usd && prod.costo_usd > 0
      ? prod.costo_usd * tcActual * Number(item.cantidad_total || 0)
      : Number(item.total_costo || 0)
    return s + costoTotal
  }, 0)

  // ─── Compra handlers ────────────────────────────────────────────────────────

  const openNewCompra = () => {
    setEditCompra(null)
    setCompraForm({ ...initCompraForm(), tipo_cambio: String(tcActual) })
    setCompraModal(true)
  }

  const openEditCompra = (c: Compra) => {
    setEditCompra(c)
    setCompraForm({
      fecha: c.fecha,
      proveedor_id: c.proveedor_id || '',
      producto_id: c.producto_id || '',
      descripcion: c.descripcion,
      cantidad: String(c.cantidad),
      precio_unit: String(c.precio_unit),
      moneda: c.moneda,
      tipo_cambio: String(c.tipo_cambio),
      iva_pct: String(c.iva_pct),
      estado_pago: c.estado_pago,
      monto_pagado: c.estado_pago === 'parcial' ? String(c.monto_pagado) : '',
      notas: c.notas || '',
    })
    setCompraModal(true)
  }

  const handleSubmitCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCompra(true)
    const supabase = createClient()
    const cant  = Number(compraForm.cantidad)   || 1
    const pu    = Number(compraForm.precio_unit) || 0
    const tc    = Number(compraForm.tipo_cambio) || tcActual
    const iva   = Number(compraForm.iva_pct)     || 0
    const { neto, ivaMonto, montoTotal, montoArs } = recalcCompra(cant, pu, compraForm.moneda, tc, iva)
    const montoPagado =
      compraForm.estado_pago === 'pagado'    ? montoArs :
      compraForm.estado_pago === 'pendiente' ? 0 :
      Number(compraForm.monto_pagado) || 0

    const payload = {
      fecha: compraForm.fecha,
      proveedor_id: compraForm.proveedor_id || null,
      producto_id:  compraForm.producto_id  || null,
      descripcion:  compraForm.descripcion,
      cantidad:     cant,
      precio_unit:  pu,
      moneda:       compraForm.moneda,
      tipo_cambio:  tc,
      iva_pct:      iva,
      neto,
      iva_monto:    ivaMonto,
      monto_total:  montoTotal,
      monto_ars:    montoArs,
      estado_pago:  compraForm.estado_pago,
      monto_pagado: montoPagado,
      notas: compraForm.notas || null,
    }

    const { error } = editCompra
      ? await supabase.from('compras').update(payload).eq('id', editCompra.id)
      : await supabase.from('compras').insert(payload)
    if (error) { toast.error('Error al guardar'); setSavingCompra(false); return }
    await fetchData()
    setCompraModal(false)
    setSavingCompra(false)
    toast.success(editCompra ? 'Compra actualizada' : 'Compra registrada')
  }

  const handleDeleteCompra = async () => {
    if (!deleteCompra) return
    setDeletingCompra(true)
    const supabase = createClient()
    await supabase.from('compras').delete().eq('id', deleteCompra.id)
    await fetchData()
    toast.success('Compra eliminada')
    setDeleteCompra(null)
    setDeletingCompra(false)
  }

  // ─── Proveedor handlers ─────────────────────────────────────────────────────

  const openNewProv = () => {
    setEditProv(null)
    setProvForm(initProvForm())
    setProvModal(true)
  }

  const openEditProv = (p: Proveedor) => {
    setEditProv(p)
    setProvForm({
      nombre:    p.nombre,
      contacto:  p.contacto  || '',
      email:     p.email     || '',
      telefono:  p.telefono  || '',
      notas:     p.notas     || '',
    })
    setProvModal(true)
  }

  const handleSubmitProv = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProv(true)
    const supabase = createClient()
    const payload = {
      nombre:   provForm.nombre,
      contacto: provForm.contacto  || null,
      email:    provForm.email     || null,
      telefono: provForm.telefono  || null,
      notas:    provForm.notas     || null,
    }
    const { error } = editProv
      ? await supabase.from('proveedores').update(payload).eq('id', editProv.id)
      : await supabase.from('proveedores').insert(payload)
    if (error) { toast.error('Error al guardar'); setSavingProv(false); return }
    await fetchData()
    setProvModal(false)
    setSavingProv(false)
    toast.success(editProv ? 'Proveedor actualizado' : 'Proveedor agregado')
  }

  const handleDeleteProv = async () => {
    if (!deleteProv) return
    setDeletingProv(true)
    const supabase = createClient()
    await supabase.from('proveedores').delete().eq('id', deleteProv.id)
    await fetchData()
    toast.success('Proveedor eliminado')
    setDeleteProv(null)
    setDeletingProv(false)
  }

  const handleToggleTipo = async (item: StockItem) => {
    const supabase = createClient()
    const newTipo = item.tipo === 'propio' ? 'motic' : 'propio'
    const { error } = await supabase.from('stock').update({ tipo: newTipo }).eq('id', item.id)
    if (error) { toast.error('Error al actualizar tipo'); return }
    setStock(prev => prev.map(s => s.id === item.id ? { ...s, tipo: newTipo } : s))
    toast.success(`Stock marcado como ${newTipo === 'propio' ? 'Propio Drop' : 'MOTIC'}`)
  }

  // ─── Live preview ────────────────────────────────────────────────────────────

  const formTotales = (() => {
    const cant = Number(compraForm.cantidad)    || 0
    const pu   = Number(compraForm.precio_unit) || 0
    const tc   = Number(compraForm.tipo_cambio) || tcActual
    const iva  = Number(compraForm.iva_pct)     || 0
    if (!cant || !pu) return null
    return recalcCompra(cant, pu, compraForm.moneda, tc, iva)
  })()

  // ─── Columns ─────────────────────────────────────────────────────────────────

  const compraColumns = [
    {
      key: 'fecha', label: 'Fecha',
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: 'proveedor_id', label: 'Proveedor',
      render: (_: unknown, row: Compra) =>
        row.proveedores?.nombre ?? <span className="text-muted text-xs">—</span>,
    },
    {
      key: 'descripcion', label: 'Descripción',
      render: (v: unknown) => (
        <span className="max-w-[200px] truncate block text-sm">{v as string}</span>
      ),
    },
    { key: 'cantidad', label: 'Cant.' },
    {
      key: 'monto_ars', label: 'Total ARS',
      render: (v: unknown, row: Compra) => (
        <div>
          <span className="font-semibold text-red-400">
            <Private>{formatCurrency(Number(v))}</Private>
          </span>
          {row.moneda === 'usd' && (
            <p className="text-xs text-muted mt-0.5">
              USD {formatCurrency(row.monto_total)} · TC {row.tipo_cambio.toLocaleString()}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'estado_pago', label: 'Estado',
      render: (v: unknown, row: Compra) => (
        <div>
          <EstadoBadge estado={v as EstadoPago} />
          {v === 'parcial' && (
            <p className="text-xs text-muted mt-0.5">
              Pagado: <Private>{formatCurrency(Number(row.monto_pagado))}</Private>
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'id', label: '',
      render: (_: unknown, row: Compra) => (
        <RowMenu actions={[
          { label: 'Editar',    onClick: () => openEditCompra(row) },
          { label: 'Eliminar',  onClick: () => setDeleteCompra(row), variant: 'danger' },
        ]} />
      ),
    },
  ]

  const provColumns = [
    {
      key: 'nombre', label: 'Nombre',
      render: (v: unknown) => <span className="font-medium text-text-primary">{v as string}</span>,
    },
    {
      key: 'contacto', label: 'Contacto',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'email', label: 'Email',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'telefono', label: 'Teléfono',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'id', label: '',
      render: (_: unknown, row: Proveedor) => (
        <RowMenu actions={[
          { label: 'Editar',   onClick: () => openEditProv(row) },
          { label: 'Eliminar', onClick: () => setDeleteProv(row), variant: 'danger' },
        ]} />
      ),
    },
  ]

  const stockColumns = [
    {
      key: 'articulo', label: 'Artículo',
      render: (v: unknown) => <span className="font-medium text-text-primary">{v as string}</span>,
    },
    {
      key: 'sku', label: 'SKU',
      render: (v: unknown) => v
        ? <span className="font-mono text-xs text-text-secondary">{v as string}</span>
        : <span className="text-muted">—</span>,
    },
    {
      key: 'tipo', label: 'Tipo',
      render: (v: unknown, row: StockItem) => (
        <button
          onClick={() => handleToggleTipo(row)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            v === 'propio'
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
          }`}
          title="Click para cambiar"
        >
          {v === 'propio' ? 'Propio' : 'MOTIC'}
        </button>
      ),
    },
    {
      key: 'cantidad_villa_martelli', label: 'Villa M.',
      render: (v: unknown) => <span className="font-semibold">{v as number}</span>,
    },
    {
      key: 'cantidad_nordelta', label: 'Nordelta',
      render: (v: unknown) => <span className="font-semibold">{v as number}</span>,
    },
    {
      key: 'cantidad_total', label: 'Total',
      render: (v: unknown) => <span className="font-bold text-text-primary">{v as number}</span>,
    },
    {
      key: 'costo', label: 'Costo unit.',
      render: (_: unknown, row: StockItem) => {
        const costoUnit = row.productos?.costo_usd && row.productos.costo_usd > 0
          ? row.productos.costo_usd * tcActual
          : Number(row.costo || 0)
        return <Private>{formatCurrency(costoUnit)}</Private>
      },
    },
    {
      key: '_valor', label: 'Valor stock',
      render: (_: unknown, row: StockItem) => {
        const prod = row.productos
        const val = prod?.costo_usd && prod.costo_usd > 0
          ? prod.costo_usd * tcActual * Number(row.cantidad_total || 0)
          : Number(row.total_costo || 0)
        return val > 0
          ? <span className="font-semibold text-purple-400"><Private>{formatCurrency(val)}</Private></span>
          : <span className="text-muted text-xs">—</span>
      },
    },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Compras"
        description="Gestión de compras a proveedores e inventario"
        icon={ShoppingCart}
        action={
          tab === 'compras' ? (
            <button
              onClick={openNewCompra}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Nueva compra
            </button>
          ) : tab === 'proveedores' ? (
            <button
              onClick={openNewProv}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Nuevo proveedor
            </button>
          ) : undefined
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard
          title="Pendiente de pago"
          value={formatCurrency(pendienteTotal)}
          icon={AlertCircle}
          color="red"
          loading={loading}
        />
        <MetricCard
          title={`Comprado en ${monthLabel(mesFiltro)}`}
          value={formatCurrency(totalMes)}
          icon={ShoppingCart}
          color="blue"
          loading={loading}
        />
        <MetricCard
          title="Valor en stock (est.)"
          value={formatCurrency(valorStock)}
          subtitle={`TC $${tcActual.toLocaleString()}`}
          icon={Package}
          color="purple"
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'compras',     label: 'Compras',     icon: ShoppingCart },
          { key: 'proveedores', label: 'Proveedores', icon: Building2 },
          { key: 'stock',       label: 'Stock',       icon: Package },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              tab === t.key
                ? 'bg-accent border-accent text-white'
                : 'border-border text-text-secondary hover:text-text-primary hover:bg-card-hover'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Compras tab ── */}
      {tab === 'compras' && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              onClick={() => setMesFiltro(m => addMonths(m, -1))}
              className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-text-secondary" />
            </button>
            <span className="text-base font-semibold text-text-primary min-w-[120px] text-center">
              {monthLabel(mesFiltro)}
            </span>
            <button
              onClick={() => setMesFiltro(m => addMonths(m, 1))}
              className="p-1.5 rounded-lg border border-border hover:bg-card-hover transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-text-secondary" />
            </button>
            {mesFiltro !== getPadMonth(new Date()) && (
              <button
                onClick={() => setMesFiltro(getPadMonth(new Date()))}
                className="text-xs text-accent hover:underline"
              >
                Mes actual
              </button>
            )}
          </div>
          <DataTable
            columns={compraColumns as never}
            data={comprasMes as never}
            loading={loading}
            emptyMessage="No hay compras registradas este mes"
          />
        </>
      )}

      {/* ── Proveedores tab ── */}
      {tab === 'proveedores' && (
        <DataTable
          columns={provColumns as never}
          data={proveedores as never}
          loading={loading}
          emptyMessage="No hay proveedores cargados"
        />
      )}

      {/* ── Stock tab ── */}
      {tab === 'stock' && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm text-text-muted">
              Costo estimado usando precio de costo de productos. TC activo:{' '}
              <span className="font-medium text-text-primary">${tcActual.toLocaleString()}</span>
            </p>
            <p className="text-sm font-medium text-text-primary">
              Total en stock:{' '}
              <span className="text-purple-400 font-bold">
                <Private>{formatCurrency(valorStock)}</Private>
              </span>
            </p>
          </div>
          <DataTable
            columns={stockColumns as never}
            data={stock as never}
            loading={loading}
            emptyMessage="No hay stock registrado"
          />
        </>
      )}

      {/* ── Confirm deletes ── */}
      <ConfirmDialog
        open={!!deleteCompra}
        title="¿Eliminar esta compra?"
        description={
          deleteCompra && (
            <>
              Se eliminará <strong>{deleteCompra.descripcion}</strong> por{' '}
              <strong>{formatCurrency(Number(deleteCompra.monto_ars))}</strong>. No se puede deshacer.
            </>
          )
        }
        onConfirm={handleDeleteCompra}
        onCancel={() => setDeleteCompra(null)}
        loading={deletingCompra}
      />
      <ConfirmDialog
        open={!!deleteProv}
        title="¿Eliminar este proveedor?"
        description={
          deleteProv && (
            <>Se eliminará el proveedor <strong>{deleteProv.nombre}</strong>.</>
          )
        }
        onConfirm={handleDeleteProv}
        onCancel={() => setDeleteProv(null)}
        loading={deletingProv}
      />

      {/* ── Compra modal ── */}
      <Modal
        isOpen={compraModal}
        onClose={() => { setCompraModal(false); setEditCompra(null) }}
        title={editCompra ? 'Editar compra' : 'Nueva compra'}
        size="lg"
      >
        <form onSubmit={handleSubmitCompra} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
              <input
                type="date"
                value={compraForm.fecha}
                onChange={e => setCompraForm(f => ({ ...f, fecha: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Proveedor</label>
              <select
                value={compraForm.proveedor_id}
                onChange={e => setCompraForm(f => ({ ...f, proveedor_id: e.target.value }))}
              >
                <option value="">Sin proveedor</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Producto (opcional)
            </label>
            <select
              value={compraForm.producto_id}
              onChange={e => {
                const pid = e.target.value
                const prod = productos.find(p => p.id === pid)
                setCompraForm(f => ({
                  ...f,
                  producto_id: pid,
                  descripcion: prod ? prod.nombre : f.descripcion,
                }))
              }}
            >
              <option value="">Descripción libre</option>
              {productos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción</label>
            <input
              type="text"
              value={compraForm.descripcion}
              onChange={e => setCompraForm(f => ({ ...f, descripcion: e.target.value }))}
              placeholder="Detalle de la compra..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Cantidad</label>
              <input
                type="number"
                min="0"
                step="any"
                value={compraForm.cantidad}
                onChange={e => setCompraForm(f => ({ ...f, cantidad: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Precio unit. (sin IVA)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={compraForm.precio_unit}
                onChange={e => setCompraForm(f => ({ ...f, precio_unit: e.target.value }))}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Moneda</label>
              <div className="flex gap-2">
                {(['ars', 'usd'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCompraForm(f => ({ ...f, moneda: m }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      compraForm.moneda === m
                        ? 'bg-accent border-accent text-white'
                        : 'border-border text-text-secondary hover:bg-card-hover'
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {compraForm.moneda === 'usd' ? 'Tipo de cambio' : 'TC referencia'}
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={compraForm.tipo_cambio}
                onChange={e => setCompraForm(f => ({ ...f, tipo_cambio: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">IVA %</label>
              <select
                value={compraForm.iva_pct}
                onChange={e => setCompraForm(f => ({ ...f, iva_pct: e.target.value }))}
              >
                {IVA_OPTS.map(o => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Live preview */}
          {formTotales && (
            <div className="bg-card-hover rounded-xl p-4 border border-border space-y-1.5 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal s/IVA</span>
                <span className="font-medium text-text-primary">
                  {formatCurrency(formTotales.neto)} {compraForm.moneda.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>IVA {compraForm.iva_pct}%</span>
                <span>{formatCurrency(formTotales.ivaMonto)} {compraForm.moneda.toUpperCase()}</span>
              </div>
              <div className="flex justify-between font-semibold text-text-primary border-t border-border pt-1.5">
                <span>Total {compraForm.moneda.toUpperCase()}</span>
                <span>{formatCurrency(formTotales.montoTotal)}</span>
              </div>
              {compraForm.moneda === 'usd' && (
                <div className="flex justify-between text-accent font-semibold">
                  <span>Total ARS</span>
                  <span>{formatCurrency(formTotales.montoArs)}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Estado de pago
              </label>
              <select
                value={compraForm.estado_pago}
                onChange={e => setCompraForm(f => ({ ...f, estado_pago: e.target.value as EstadoPago }))}
              >
                {ESTADOS.map(e => (
                  <option key={e.key} value={e.key}>{e.label}</option>
                ))}
              </select>
            </div>
            {compraForm.estado_pago === 'parcial' && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Monto pagado (ARS)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={compraForm.monto_pagado}
                  onChange={e => setCompraForm(f => ({ ...f, monto_pagado: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={compraForm.notas}
              onChange={e => setCompraForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setCompraModal(false); setEditCompra(null) }}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingCompra}
              className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50"
            >
              {savingCompra ? 'Guardando...' : editCompra ? 'Guardar cambios' : 'Registrar compra'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Proveedor modal ── */}
      <Modal
        isOpen={provModal}
        onClose={() => { setProvModal(false); setEditProv(null) }}
        title={editProv ? 'Editar proveedor' : 'Nuevo proveedor'}
      >
        <form onSubmit={handleSubmitProv} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre *</label>
            <input
              type="text"
              value={provForm.nombre}
              onChange={e => setProvForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre del proveedor"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Contacto</label>
            <input
              type="text"
              value={provForm.contacto}
              onChange={e => setProvForm(f => ({ ...f, contacto: e.target.value }))}
              placeholder="Nombre del contacto"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={provForm.email}
                onChange={e => setProvForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Teléfono</label>
              <input
                type="tel"
                value={provForm.telefono}
                onChange={e => setProvForm(f => ({ ...f, telefono: e.target.value }))}
                placeholder="+54 11 1234-5678"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Notas</label>
            <input
              type="text"
              value={provForm.notas}
              onChange={e => setProvForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Condiciones de pago, observaciones..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setProvModal(false); setEditProv(null) }}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingProv}
              className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50"
            >
              {savingProv ? 'Guardando...' : editProv ? 'Guardar cambios' : 'Agregar proveedor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
