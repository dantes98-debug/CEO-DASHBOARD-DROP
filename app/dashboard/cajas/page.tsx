'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Landmark, Plus, ArrowUpCircle, ArrowDownCircle, Calculator, TrendingUp, CreditCard, BarChart2 } from 'lucide-react'
import { toast } from 'sonner'

// ─── Mercado Pago fee table (sin interés para el comprador) ──────────────────
// Fuente: mercadopago.com.ar/costs-section — actualizar si cambian
const MP_TASAS: Record<number, number> = {
  1:  2.99,
  3:  5.99,
  6:  9.99,
  12: 14.99,
  18: 17.99,
  24: 19.99,
}
const MP_IVA = 0.21   // IVA sobre la comisión
const MP_CUOTAS = [1, 3, 6, 12, 18, 24]

interface Caja {
  id: string
  nombre: string
  saldo_actual: number
  created_at: string
}

interface Movimiento {
  id: string
  caja_id: string
  tipo: 'ingreso' | 'egreso'
  monto: number
  descripcion: string | null
  fecha: string
  cajas?: { nombre: string } | null
  created_at: string
}

export default function CajasPage() {
  const [cajas, setCajas] = useState<Caja[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [modalCajaOpen, setModalCajaOpen] = useState(false)
  const [modalMovOpen, setModalMovOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cajaForm, setCajaForm] = useState({ nombre: '', saldo_actual: '' })
  const [movForm, setMovForm] = useState({
    caja_id: '',
    tipo: 'ingreso' as 'ingreso' | 'egreso',
    monto: '',
    descripcion: '',
    fecha: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [cajasRes, movRes] = await Promise.all([
      supabase.from('cajas').select('*').order('nombre'),
      supabase.from('movimientos_caja').select('*, cajas(nombre)').order('fecha', { ascending: false }).limit(100),
    ])
    setCajas(cajasRes.data || [])
    setMovimientos(movRes.data || [])
    setLoading(false)
  }

  const handleCajaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { error: errCaja } = await supabase.from('cajas').insert({
      nombre: cajaForm.nombre,
      saldo_actual: Number(cajaForm.saldo_actual),
    })
    if (errCaja) { toast.error('Error al crear la caja'); setSaving(false); return }
    await fetchData()
    setModalCajaOpen(false)
    setCajaForm({ nombre: '', saldo_actual: '' })
    setSaving(false)
    toast.success('Caja creada correctamente')
  }

  const handleMovSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()

    // Insert movement
    const { error: errMov } = await supabase.from('movimientos_caja').insert({
      caja_id: movForm.caja_id,
      tipo: movForm.tipo,
      monto: Number(movForm.monto),
      descripcion: movForm.descripcion || null,
      fecha: movForm.fecha,
    })
    if (errMov) { toast.error('Error al registrar el movimiento'); setSaving(false); return }

    // Update caja balance
    const caja = cajas.find(c => c.id === movForm.caja_id)
    if (caja) {
      const delta = movForm.tipo === 'ingreso' ? Number(movForm.monto) : -Number(movForm.monto)
      await supabase.from('cajas').update({ saldo_actual: caja.saldo_actual + delta }).eq('id', caja.id)
    }

    await fetchData()
    setModalMovOpen(false)
    setMovForm({ caja_id: '', tipo: 'ingreso', monto: '', descripcion: '', fecha: new Date().toISOString().split('T')[0] })
    setSaving(false)
    toast.success('Movimiento registrado')
  }

  const handleDeleteMov = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    const supabase = createClient()
    await supabase.from('movimientos_caja').delete().eq('id', id)
    await fetchData()
    toast.success('Movimiento eliminado')
  }

  const saldoTotal = cajas.reduce((sum, c) => sum + Number(c.saldo_actual), 0)

  // ─── Calculadoras ────────────────────────────────────────────────────────────
  const [calcTab, setCalcTab] = useState<'roi' | 'mp' | 'beneficio'>('roi')

  // ROI & Margen
  const [roi, setRoi] = useState({ costoUSD: '', tc: '', otrosGastos: '', precioVenta: '' })
  const costoARS = (Number(roi.costoUSD) || 0) * (Number(roi.tc) || 0)
  const costoTotal = costoARS + (Number(roi.otrosGastos) || 0)
  const precioV = Number(roi.precioVenta) || 0
  const margenBruto = precioV > 0 ? ((precioV - costoARS) / precioV) * 100 : null
  const margenNeto  = precioV > 0 ? ((precioV - costoTotal) / precioV) * 100 : null
  const roiPct      = costoTotal > 0 ? ((precioV - costoTotal) / costoTotal) * 100 : null

  // Mercado Pago
  const [mp, setMp] = useState({ monto: '', cuotas: 1 })
  const mpMonto = Number(mp.monto) || 0
  const mpTasa = MP_TASAS[mp.cuotas] ?? 0
  const mpComision = mpMonto * (mpTasa / 100)
  const mpIva = mpComision * MP_IVA
  const mpTotalComision = mpComision + mpIva
  const mpRecibis = mpMonto - mpTotalComision
  const mpCuotaComprador = mp.cuotas > 1 ? mpMonto / mp.cuotas : null

  // Beneficio
  const [ben, setBen] = useState({ facturacion: '', cmv: '', gastos: '' })
  const benFact = Number(ben.facturacion) || 0
  const benCMV  = Number(ben.cmv) || 0
  const benGastos = Number(ben.gastos) || 0
  const utilidadBruta = benFact - benCMV
  const utilidadNeta  = utilidadBruta - benGastos
  const margenBeneficio = benFact > 0 ? (utilidadNeta / benFact) * 100 : null

  const movColumns = [
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v: unknown) => formatDate(v as string),
    },
    {
      key: 'cajas',
      label: 'Caja',
      render: (_: unknown, row: Movimiento) => row.cajas?.nombre || <span className="text-muted">—</span>,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (v: unknown) => (
        <span className={`flex items-center gap-1.5 text-xs font-medium ${v === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
          {v === 'ingreso' ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
          {v === 'ingreso' ? 'Ingreso' : 'Egreso'}
        </span>
      ),
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      render: (v: unknown) => v || <span className="text-muted">—</span>,
    },
    {
      key: 'monto',
      label: 'Monto',
      render: (v: unknown, row: Movimiento) => (
        <span className={`font-semibold ${row.tipo === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
          {row.tipo === 'egreso' ? '-' : '+'}{formatCurrency(Number(v))}
        </span>
      ),
    },
    {
      key: 'id',
      label: 'Acciones',
      render: (_: unknown, row: Movimiento) => (
        <button onClick={(e) => { e.stopPropagation(); handleDeleteMov(row.id) }} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          Eliminar
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Cajas"
        description="Saldos y movimientos de efectivo"
        icon={Landmark}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setModalCajaOpen(true)}
              className="flex items-center gap-2 border border-border hover:bg-card-hover text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva caja
            </button>
            <button
              onClick={() => setModalMovOpen(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Movimiento
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard title="Saldo total" value={formatCurrency(saldoTotal)} icon={Landmark} color="cyan" loading={loading} />
        {!loading && cajas.slice(0, 2).map((c) => (
          <MetricCard key={c.id} title={c.nombre} value={formatCurrency(c.saldo_actual)} icon={Landmark} color="blue" />
        ))}
      </div>

      {/* Cajas summary */}
      {cajas.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 mb-8">
          <h3 className="text-base font-semibold text-text-primary mb-4">Resumen de cajas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cajas.map((c) => (
              <div key={c.id} className="bg-card-hover rounded-lg p-4 border border-border">
                <p className="text-xs text-muted mb-1">{c.nombre}</p>
                <p className={`text-lg font-bold ${c.saldo_actual >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(c.saldo_actual)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-base font-semibold text-text-primary mb-4">Movimientos recientes</h3>
      <DataTable
        columns={movColumns as never}
        data={movimientos as never}
        loading={loading}
        emptyMessage="No hay movimientos registrados"
      />

      {/* ══════════════════ CALCULADORAS ══════════════════ */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-5">
          <Calculator className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Calculadoras</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {([
            { key: 'roi',       label: 'ROI & Margen',    icon: TrendingUp  },
            { key: 'mp',        label: 'Mercado Pago',    icon: CreditCard  },
            { key: 'beneficio', label: 'Beneficio',       icon: BarChart2   },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setCalcTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                calcTab === key
                  ? 'bg-accent text-white'
                  : 'border border-border text-text-secondary hover:bg-card-hover hover:text-text-primary'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── ROI & Margen ── */}
        {calcTab === 'roi' && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" /> ROI & Margen de producto
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Costo USD</label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={roi.costoUSD}
                  onChange={e => setRoi({ ...roi, costoUSD: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Tipo de cambio (ARS/USD)</label>
                <input type="number" min="0" placeholder="1000" value={roi.tc}
                  onChange={e => setRoi({ ...roi, tc: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Costo ARS (calculado)</label>
                <input type="text" readOnly value={costoARS > 0 ? formatCurrency(costoARS) : ''} placeholder="—"
                  className="bg-card-hover cursor-default" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Otros gastos ARS (flete, comisiones…)</label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={roi.otrosGastos}
                  onChange={e => setRoi({ ...roi, otrosGastos: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Precio de venta ARS</label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={roi.precioVenta}
                  onChange={e => setRoi({ ...roi, precioVenta: e.target.value })} />
              </div>
            </div>
            {precioV > 0 && costoARS > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
                <div className="bg-card-hover rounded-lg p-4 text-center">
                  <p className="text-xs text-muted mb-1">Margen Bruto</p>
                  <p className={`text-2xl font-bold ${(margenBruto ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {margenBruto !== null ? `${margenBruto.toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted mt-1">sin gastos extras</p>
                </div>
                <div className="bg-card-hover rounded-lg p-4 text-center">
                  <p className="text-xs text-muted mb-1">Margen Neto</p>
                  <p className={`text-2xl font-bold ${(margenNeto ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {margenNeto !== null ? `${margenNeto.toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted mt-1">con todos los costos</p>
                </div>
                <div className="bg-card-hover rounded-lg p-4 text-center">
                  <p className="text-xs text-muted mb-1">ROI</p>
                  <p className={`text-2xl font-bold ${(roiPct ?? 0) >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                    {roiPct !== null ? `${roiPct.toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-xs text-muted mt-1">retorno sobre inversión</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Mercado Pago ── */}
        {calcTab === 'mp' && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-accent" /> Calculadora Mercado Pago
            </h3>
            <p className="text-xs text-muted mb-5">Tasas sin interés para el comprador (MSI) + IVA 21% sobre comisión</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Monto del producto (ARS)</label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={mp.monto}
                  onChange={e => setMp({ ...mp, monto: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Cuotas</label>
                <div className="flex flex-wrap gap-2">
                  {MP_CUOTAS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMp({ ...mp, cuotas: c })}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        mp.cuotas === c
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-text-secondary hover:bg-card-hover'
                      }`}
                    >
                      {c === 1 ? '1 (contado)' : `${c}x`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {mpMonto > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border mb-4">
                  <div className="bg-card-hover rounded-lg p-4 text-center">
                    <p className="text-xs text-muted mb-1">Tasa MP</p>
                    <p className="text-xl font-bold text-text-primary">{mpTasa}%</p>
                  </div>
                  <div className="bg-card-hover rounded-lg p-4 text-center">
                    <p className="text-xs text-muted mb-1">Comisión + IVA</p>
                    <p className="text-xl font-bold text-red-400">−{formatCurrency(mpTotalComision)}</p>
                    <p className="text-xs text-muted mt-0.5">({(mpTasa * 1.21).toFixed(2)}% efectivo)</p>
                  </div>
                  <div className="bg-card-hover rounded-lg p-4 text-center">
                    <p className="text-xs text-muted mb-1">Recibís vos</p>
                    <p className="text-xl font-bold text-green-400">{formatCurrency(mpRecibis)}</p>
                  </div>
                  {mpCuotaComprador !== null && (
                    <div className="bg-card-hover rounded-lg p-4 text-center">
                      <p className="text-xs text-muted mb-1">Cuota del comprador</p>
                      <p className="text-xl font-bold text-cyan-400">{formatCurrency(mpCuotaComprador)}</p>
                      <p className="text-xs text-muted mt-0.5">× {mp.cuotas}</p>
                    </div>
                  )}
                </div>
                {/* Tabla comparativa */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium">Cuotas</th>
                        <th className="text-right py-2 pr-4 font-medium">Tasa</th>
                        <th className="text-right py-2 pr-4 font-medium">Comisión total</th>
                        <th className="text-right py-2 font-medium">Recibís</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MP_CUOTAS.map(c => {
                        const tasa = MP_TASAS[c]
                        const com  = mpMonto * (tasa / 100) * (1 + MP_IVA)
                        const rec  = mpMonto - com
                        return (
                          <tr key={c} className={`border-b border-border/50 ${c === mp.cuotas ? 'bg-accent/5' : ''}`}>
                            <td className={`py-2 pr-4 font-medium ${c === mp.cuotas ? 'text-accent' : 'text-text-primary'}`}>
                              {c === 1 ? '1 cuota' : `${c} cuotas`}
                            </td>
                            <td className="text-right py-2 pr-4 text-text-secondary">{tasa}%</td>
                            <td className="text-right py-2 pr-4 text-red-400">−{formatCurrency(com)}</td>
                            <td className="text-right py-2 text-green-400 font-medium">{formatCurrency(rec)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Beneficio ── */}
        {calcTab === 'beneficio' && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-5 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-accent" /> Calculadora de beneficio
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Facturación</label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={ben.facturacion}
                  onChange={e => setBen({ ...ben, facturacion: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">CMV (Costo de Mercadería Vendida)</label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={ben.cmv}
                  onChange={e => setBen({ ...ben, cmv: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Gastos operativos</label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={ben.gastos}
                  onChange={e => setBen({ ...ben, gastos: e.target.value })} />
              </div>
            </div>
            {benFact > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border mb-5">
                  <div className="bg-card-hover rounded-lg p-4 text-center">
                    <p className="text-xs text-muted mb-1">Utilidad Bruta</p>
                    <p className={`text-2xl font-bold ${utilidadBruta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(utilidadBruta)}
                    </p>
                    <p className="text-xs text-muted mt-1">Facturación − CMV</p>
                  </div>
                  <div className="bg-card-hover rounded-lg p-4 text-center">
                    <p className="text-xs text-muted mb-1">Utilidad Neta</p>
                    <p className={`text-2xl font-bold ${utilidadNeta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(utilidadNeta)}
                    </p>
                    <p className="text-xs text-muted mt-1">Bruta − Gastos</p>
                  </div>
                  <div className="bg-card-hover rounded-lg p-4 text-center">
                    <p className="text-xs text-muted mb-1">Margen neto</p>
                    <p className={`text-2xl font-bold ${(margenBeneficio ?? 0) >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                      {margenBeneficio !== null ? `${margenBeneficio.toFixed(1)}%` : '—'}
                    </p>
                    <p className="text-xs text-muted mt-1">sobre facturación</p>
                  </div>
                </div>
                {/* Waterfall visual */}
                <div className="space-y-2">
                  {[
                    { label: 'Facturación',     value: benFact,       color: 'bg-cyan-500',  w: 100 },
                    { label: 'CMV',             value: -benCMV,       color: 'bg-red-500',   w: benFact > 0 ? (benCMV / benFact) * 100 : 0 },
                    { label: 'Gastos',          value: -benGastos,    color: 'bg-orange-500',w: benFact > 0 ? (benGastos / benFact) * 100 : 0 },
                    { label: 'Utilidad Neta',   value: utilidadNeta,  color: utilidadNeta >= 0 ? 'bg-green-500' : 'bg-red-500', w: benFact > 0 ? Math.abs(utilidadNeta / benFact) * 100 : 0 },
                  ].map(({ label, value, color, w }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-muted w-28 text-right flex-shrink-0">{label}</span>
                      <div className="flex-1 bg-card-hover rounded-full h-2">
                        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(w, 100)}%` }} />
                      </div>
                      <span className={`text-xs font-medium w-28 flex-shrink-0 ${value < 0 ? 'text-red-400' : 'text-text-primary'}`}>
                        {value < 0 ? '−' : ''}{formatCurrency(Math.abs(value))}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={modalCajaOpen} onClose={() => setModalCajaOpen(false)} title="Nueva caja">
        <form onSubmit={handleCajaSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre de la caja</label>
            <input type="text" value={cajaForm.nombre} onChange={(e) => setCajaForm({ ...cajaForm, nombre: e.target.value })} placeholder="Ej: Caja principal, Caja USD" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Saldo inicial</label>
            <input type="number" step="0.01" value={cajaForm.saldo_actual} onChange={(e) => setCajaForm({ ...cajaForm, saldo_actual: e.target.value })} placeholder="0.00" required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalCajaOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Crear'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modalMovOpen} onClose={() => setModalMovOpen(false)} title="Nuevo movimiento">
        <form onSubmit={handleMovSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Fecha</label>
            <input type="date" value={movForm.fecha} onChange={(e) => setMovForm({ ...movForm, fecha: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Caja</label>
            <select value={movForm.caja_id} onChange={(e) => setMovForm({ ...movForm, caja_id: e.target.value })} required>
              <option value="">Seleccionar caja</option>
              {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({formatCurrency(c.saldo_actual)})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
            <div className="grid grid-cols-2 gap-3">
              {(['ingreso', 'egreso'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMovForm({ ...movForm, tipo: t })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    movForm.tipo === t
                      ? t === 'ingreso' ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-border text-text-secondary hover:bg-card-hover'
                  }`}
                >
                  {t === 'ingreso' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                  {t === 'ingreso' ? 'Ingreso' : 'Egreso'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Monto</label>
            <input type="number" min="0" step="0.01" value={movForm.monto} onChange={(e) => setMovForm({ ...movForm, monto: e.target.value })} placeholder="0.00" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Descripción</label>
            <input type="text" value={movForm.descripcion} onChange={(e) => setMovForm({ ...movForm, descripcion: e.target.value })} placeholder="Descripción del movimiento" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalMovOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
