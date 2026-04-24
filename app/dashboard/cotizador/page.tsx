'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { ClipboardList, Plus, X, Trash2, RefreshCw, Upload, FileSpreadsheet } from 'lucide-react'

interface Producto {
  sku: string
  codigo: string
  articulo: string
  costo_usd: number
}

interface ItemCotizacion {
  sku: string
  descripcion: string
  cantidad: number
  precioVenta: number   // ARS
  precioUSD: number     // USD original (0 si fue cargado manualmente en ARS)
  costoUSD: number
  costoARS: number
}

function parseN(s: string | number): number {
  const str = String(s ?? '').trim()
  if (!str) return 0
  if (str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(str) || 0
}

const IVA = 0.21

export default function CotizadorPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [tc, setTc] = useState(1000)
  const [tcInput, setTcInput] = useState('')
  const [items, setItems] = useState<ItemCotizacion[]>([])
  const [nuevo, setNuevo] = useState({ sku: '', cantidad: '1', precioVenta: '' })
  const [conIva, setConIva] = useState(false)
  const [loading, setLoading] = useState(true)
  // Mapa SKU → precio de venta cargado desde Excel
  const [listaPrecios, setListaPrecios] = useState<Record<string, number>>({})
  const [importando, setImportando] = useState(false)
  const [importInfo, setImportInfo] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const [prodRes, configRes] = await Promise.all([
        supabase.from('productos').select('sku, codigo, articulo, costo_usd').not('sku', 'is', null),
        supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
      ])
      setProductos(prodRes.data || [])
      const savedTc = Number(configRes.data?.valor || 1000)
      setTc(savedTc)
      setTcInput(String(savedTc))
      setLoading(false)
    }
    fetchData()
  }, [])

  // Recalcular costoARS de todos los items cuando cambia el TC
  const handleTcChange = (val: string) => {
    setTcInput(val)
    const newTc = parseN(val)
    if (newTc > 0) {
      setTc(newTc)
      setItems(prev => prev.map(item => ({
        ...item,
        costoARS: item.costoUSD * newTc,
        // Si el precio vino del Excel en USD, reconvertir
        precioVenta: item.precioUSD > 0 ? item.precioUSD * newTc : item.precioVenta,
      })))
    }
  }

  const handleImportExcel = async (file: File) => {
    setImportando(true)
    setImportInfo(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws)

      // Detectar columnas de SKU y precio (acepta varios nombres posibles)
      const mapa: Record<string, number> = {}
      let encontrados = 0

      const extraerSku = (raw: string) => {
        const r = raw.trim()
        return (r.includes(' - ') ? r.split(' - ')[0] : r).trim().toUpperCase()
      }

      // Leer como array de arrays para encontrar columnas por contenido
      const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
      console.log('[Cotizador] rawRows (primeras 5):', rawRows.slice(0, 5))

      // Detectar fila de headers y columnas de artículo y precio
      const artKeywords   = ['articulo', 'sku', 'codigo', 'código', 'cod', 'code', 'article', 'item', 'descripcion', 'descripción', 'product']
      const precioKeywords = ['precio', 'price', 'pventa', 'valor', 'lista', 'importe', 'costo']
      let artCol = -1, precioCol = -1, headerRowIdx = -1

      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        const row = rawRows[i]
        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] ?? '').toLowerCase().trim()
          if (artKeywords.some(k => val.includes(k))) { artCol = j; headerRowIdx = i }
          if (precioKeywords.some(k => val.includes(k))) { precioCol = j; headerRowIdx = i }
        }
        if (artCol >= 0 && precioCol >= 0) break
      }

      console.log('[Cotizador] headers detectados → artCol:', artCol, 'precioCol:', precioCol, 'headerRow:', headerRowIdx)

      if (artCol >= 0 && precioCol >= 0) {
        let skuPendiente = ''
        for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i]
          const artVal    = artCol < row.length    ? String(row[artCol]    ?? '').trim() : ''
          const precioVal = precioCol < row.length ? String(row[precioCol] ?? '').trim() : ''

          if (artVal) skuPendiente = extraerSku(artVal)
          if (precioVal && skuPendiente) {
            const precio = parseN(precioVal)
            if (precio > 0) { mapa[skuPendiente] = precio; encontrados++; skuPendiente = '' }
          }
        }
      }

      console.log('[Cotizador] resultado:', encontrados, 'precios →', mapa)

      setListaPrecios(mapa)
      setImportInfo(`${encontrados} precios cargados (USD × TC)`)

      // Actualizar items ya agregados que tengan ese SKU
      setItems(prev => prev.map(item => {
        const precioUSD = mapa[item.sku]
        if (!precioUSD) return item
        return { ...item, precioUSD, precioVenta: precioUSD * tc }
      }))
    } catch {
      setImportInfo('Error al leer el Excel')
    }
    setImportando(false)
  }

  const handleAgregar = () => {
    const sku = nuevo.sku.trim().toUpperCase()
    if (!sku) return
    const prod = productos.find(
      p => p.sku?.toUpperCase() === sku || p.codigo?.toUpperCase() === sku
    )
    const cant = Math.max(1, parseInt(nuevo.cantidad) || 1)
    // Precio: campo manual (ARS) → lista Excel (USD × TC) → 0
    const precioManualARS = parseN(nuevo.precioVenta)
    const precioUSD = precioManualARS === 0 ? (listaPrecios[sku] || 0) : 0
    const precioVenta = precioManualARS || (precioUSD * tc)
    const costoUSD = prod?.costo_usd || 0
    const costoARS = costoUSD * tc

    setItems(prev => [...prev, {
      sku,
      descripcion: prod?.articulo || sku,
      cantidad: cant,
      precioVenta,
      precioUSD,
      costoUSD,
      costoARS,
    }])
    setNuevo({ sku: '', cantidad: '1', precioVenta: '' })
  }

  const handleRemove = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleUpdate = (idx: number, field: 'cantidad' | 'precioVenta' | 'costoARS', raw: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (field === 'cantidad') return { ...item, cantidad: Math.max(1, parseInt(raw) || 1) }
      // Si edita precioVenta manualmente, desvincularlo del USD para que TC no lo sobreescriba
      if (field === 'precioVenta') return { ...item, precioVenta: parseN(raw), precioUSD: 0 }
      return { ...item, [field]: parseN(raw) }
    }))
  }

  const calcItem = (item: ItemCotizacion) => {
    const precioNeto = conIva ? item.precioVenta / (1 + IVA) : item.precioVenta
    const totalNeto = precioNeto * item.cantidad
    const totalConIva = totalNeto * (1 + IVA)
    const costo = item.costoARS * item.cantidad
    const ganancia = totalNeto - costo
    const margen = totalNeto > 0 ? (ganancia / totalNeto) * 100 : 0
    return { precioNeto, totalNeto, totalConIva, costo, ganancia, margen }
  }

  const totales = items.reduce((acc, item) => {
    const c = calcItem(item)
    return {
      neto: acc.neto + c.totalNeto,
      conIvaTotal: acc.conIvaTotal + c.totalConIva,
      costo: acc.costo + c.costo,
      ganancia: acc.ganancia + c.ganancia,
    }
  }, { neto: 0, conIvaTotal: 0, costo: 0, ganancia: 0 })

  const margenTotal = totales.neto > 0 ? (totales.ganancia / totales.neto) * 100 : 0

  return (
    <div>
      <PageHeader
        title="Cotizador"
        description="Armá cotizaciones con tus SKUs y precios de venta"
        icon={ClipboardList}
        action={
          items.length > 0 ? (
            <button
              onClick={() => setItems([])}
              className="flex items-center gap-2 border border-border hover:bg-red-500/10 hover:border-red-400 hover:text-red-400 text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Limpiar todo
            </button>
          ) : undefined
        }
      />

      {/* Controles superiores */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <span className="text-xs text-text-muted">TC (USD→ARS):</span>
          <input
            type="text"
            inputMode="decimal"
            value={tcInput}
            onChange={e => handleTcChange(e.target.value)}
            className="w-24 text-xs text-right bg-transparent border-none outline-none text-text-primary font-semibold p-0"
          />
          <RefreshCw className="w-3 h-3 text-muted" />
        </div>
        <button
          onClick={() => setConIva(v => !v)}
          className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
            conIva
              ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
              : 'border-border text-text-secondary hover:bg-card-hover'
          }`}
        >
          {conIva ? 'Precios con IVA incluido' : 'Precios sin IVA'}
        </button>
      </div>

      {/* Importar lista de precios desde Excel */}
      <div className="bg-card rounded-xl border border-border p-5 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-accent flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Lista de precios (Excel)</p>
              <p className="text-xs text-text-muted">
                El archivo debe tener columnas <span className="font-mono text-text-secondary">SKU</span> y{' '}
                <span className="font-mono text-text-secondary">precio_venta</span> (o "Precio", "Price"…)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {importInfo && (
              <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                importInfo.includes('Error')
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-green-500/10 text-green-400'
              }`}>
                {importInfo}
              </span>
            )}
            {Object.keys(listaPrecios).length > 0 && (
              <button
                onClick={() => { setListaPrecios({}); setImportInfo(null) }}
                className="text-xs text-text-muted hover:text-red-400 transition-colors"
              >
                Borrar lista
              </button>
            )}
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
              importando
                ? 'opacity-50 cursor-wait border-border text-text-muted'
                : 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
            }`}>
              <Upload className="w-4 h-4" />
              {importando ? 'Leyendo...' : 'Cargar Excel'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={importando}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImportExcel(f); e.target.value = '' }}
              />
            </label>
          </div>
        </div>

        {/* Preview de la lista cargada */}
        {Object.keys(listaPrecios).length > 0 && (
          <div className="mt-4 max-h-32 overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {Object.entries(listaPrecios).slice(0, 40).map(([sku, precioUSD]) => (
                <div key={sku} className="flex items-center gap-1.5 bg-card-hover border border-border rounded-lg px-2 py-1 text-xs">
                  <span className="font-mono font-semibold text-text-primary">{sku}</span>
                  <span className="text-text-muted">USD {precioUSD.toLocaleString('es-AR')}</span>
                  <span className="text-text-muted">→</span>
                  <span className="text-green-400 font-medium">{formatCurrency(precioUSD * tc)}</span>
                </div>
              ))}
              {Object.keys(listaPrecios).length > 40 && (
                <span className="text-xs text-text-muted self-center">+{Object.keys(listaPrecios).length - 40} más…</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Formulario para agregar */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6">
        <p className="text-xs font-semibold text-text-secondary mb-4">Agregar producto</p>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-44">
            <label className="block text-xs text-text-muted mb-1.5">SKU / Código</label>
            <input
              type="text"
              placeholder="Ej: MA101"
              value={nuevo.sku}
              onChange={e => setNuevo(n => ({ ...n, sku: e.target.value.toUpperCase() }))}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAgregar())}
              list="cotiz-skus"
              autoComplete="off"
            />
            <datalist id="cotiz-skus">
              {productos.map(p => (
                <option key={p.sku} value={p.sku}>
                  {p.articulo || p.sku}
                </option>
              ))}
            </datalist>
          </div>

          <div className="w-20">
            <label className="block text-xs text-text-muted mb-1.5">Cantidad</label>
            <input
              type="number"
              min="1"
              step="1"
              value={nuevo.cantidad}
              onChange={e => setNuevo(n => ({ ...n, cantidad: e.target.value }))}
              className="text-center"
            />
          </div>

          <div className="w-40">
            <label className="block text-xs text-text-muted mb-1.5">
              Precio venta ({conIva ? 'c/IVA' : 's/IVA'})
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={nuevo.precioVenta}
              onChange={e => setNuevo(n => ({ ...n, precioVenta: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAgregar())}
              className="text-right"
            />
          </div>

          {/* Preview del costo si el SKU está en productos */}
          {(() => {
            const sku = nuevo.sku.trim().toUpperCase()
            const prod = sku ? productos.find(p => p.sku?.toUpperCase() === sku || p.codigo?.toUpperCase() === sku) : null
            if (!prod) return null
            const costoARS = prod.costo_usd * tc
            const precio = parseN(nuevo.precioVenta)
            const precioNeto = conIva ? precio / (1 + IVA) : precio
            const margen = precioNeto > 0 ? ((precioNeto - costoARS) / precioNeto) * 100 : null
            return (
              <div className="text-xs text-text-muted bg-card-hover rounded-lg px-3 py-2 border border-border">
                <p className="truncate max-w-48 text-text-secondary font-medium mb-0.5">{prod.articulo}</p>
                <p>Costo: <span className="text-red-400 font-medium">{formatCurrency(costoARS)}</span></p>
                {margen !== null && (
                  <p>Margen: <span className={`font-medium ${margen >= 30 ? 'text-green-400' : margen >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>{margen.toFixed(1)}%</span></p>
                )}
              </div>
            )
          })()}

          <button
            type="button"
            onClick={handleAgregar}
            disabled={!nuevo.sku.trim()}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      {/* Tabla de items */}
      {items.length > 0 && (
        <>
          <div className="bg-card rounded-xl border border-border overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card-hover">
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">SKU</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Descripción</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-text-muted uppercase">Cant</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-text-muted uppercase">
                      P. Venta {conIva ? 'c/IVA' : 's/IVA'}
                    </th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-text-muted uppercase">Total neto</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-text-muted uppercase">Costo unit</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-text-muted uppercase">Margen</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Ganancia</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const c = calcItem(item)
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold text-text-primary">{item.sku}</td>
                        <td className="px-4 py-2.5 text-xs text-text-secondary max-w-xs truncate">{item.descripcion}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="number" min="1" step="1"
                            value={item.cantidad}
                            onChange={e => handleUpdate(i, 'cantidad', e.target.value)}
                            className="w-14 text-center text-xs px-1 py-1 rounded border border-border bg-card text-text-primary focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text" inputMode="decimal"
                            value={item.precioVenta}
                            onChange={e => handleUpdate(i, 'precioVenta', e.target.value)}
                            className="w-32 text-right text-xs px-1 py-1 rounded border border-border bg-card text-text-primary focus:border-accent focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-text-primary">
                          {formatCurrency(c.totalNeto)}
                          {conIva && <p className="text-xs font-normal text-text-muted">{formatCurrency(c.totalConIva)} c/IVA</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-red-400">{formatCurrency(item.costoARS)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            c.margen >= 30
                              ? 'bg-green-500/10 text-green-400'
                              : c.margen >= 15
                                ? 'bg-yellow-500/10 text-yellow-400'
                                : 'bg-red-500/10 text-red-400'
                          }`}>
                            {c.margen.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`px-4 py-2.5 text-right text-sm font-semibold ${c.ganancia >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(c.ganancia)}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <button onClick={() => handleRemove(i)} className="text-text-muted hover:text-red-400 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Total s/IVA</p>
              <p className="text-2xl font-bold text-text-primary">{formatCurrency(totales.neto)}</p>
              {conIva && <p className="text-xs text-text-muted mt-1">{formatCurrency(totales.conIvaTotal)} c/IVA</p>}
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Costo total</p>
              <p className="text-2xl font-bold text-red-400">{formatCurrency(totales.costo)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Ganancia total</p>
              <p className={`text-2xl font-bold ${totales.ganancia >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(totales.ganancia)}
              </p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Margen promedio</p>
              <p className={`text-2xl font-bold ${margenTotal >= 30 ? 'text-green-400' : margenTotal >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                {margenTotal.toFixed(1)}%
              </p>
            </div>
          </div>
        </>
      )}

      {items.length === 0 && !loading && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <ClipboardList className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted text-sm">Agregá productos arriba para armar tu cotización</p>
        </div>
      )}
    </div>
  )
}
