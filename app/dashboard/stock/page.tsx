'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { Package, Upload, Search, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react'

interface StockItem {
  id: string
  linea: string
  codigo: string
  sku: string
  articulo: string
  cantidad_villa_martelli: number
  cantidad_nordelta: number
  cantidad_reserva: number
  cantidad_total: number
  costo: number
  total_costo: number
  // calculados al cruzar con productos
  costo_usd?: number
  costo_ars?: number
}

type Deposito = 'todos' | 'nordelta' | 'villa_martelli' | 'reserva'
type SortDir = 'asc' | 'desc' | null

const DEPOSITO_LABEL: Record<Deposito, string> = {
  todos: 'Todos',
  nordelta: 'Nordelta',
  villa_martelli: 'Villa Martelli',
  reserva: 'Reserva',
}

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const n = Number(String(val).replace(/\s/g, ''))
  return isNaN(n) ? 0 : n
}

// Busca una columna cuyo nombre normalizado CONTIENE alguna de las palabras clave
function findCol(keys: string[], ...keywords: string[]): string | undefined {
  const norm = (k: string) => k.trim().toUpperCase()
  return keys.find(k => keywords.some(kw => norm(k).includes(kw.toUpperCase())))
}

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [deposito, setDeposito] = useState<Deposito>('todos')
  const [minCant, setMinCant] = useState('')
  const [maxCant, setMaxCant] = useState('')
  const [lineaFilter, setLineaFilter] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const getLinea = (item: StockItem): string => {
    // "AN102 - ANTIK - LAVATORIO ALTO" → "ANTIK" (segunda parte)
    const parts = item.articulo?.split(' - ')
    return (parts && parts.length >= 2) ? parts[1].trim() : ''
  }

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const [stockRes, prodRes, configRes] = await Promise.all([
      supabase.from('stock').select('*').order('linea').order('articulo'),
      supabase.from('productos').select('sku, codigo, costo_usd'),
      supabase.from('config').select('valor').eq('clave', 'tipo_cambio').single(),
    ])
    const tc = Number(configRes.data?.valor || 1000)
    const prods = prodRes.data || []

    const enriched = (stockRes.data || []).map(item => {
      const key = item.sku?.toLowerCase()
      const prod = prods.find(p =>
        p.sku?.toLowerCase() === key || p.codigo?.toLowerCase() === key
      )
      const costo_usd = prod?.costo_usd || 0
      const costo_ars = costo_usd * tc
      return { ...item, costo_usd, costo_ars }
    })

    setItems(enriched)
    setLoading(false)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    setImportMsg(null)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]

      // Leer como array crudo para encontrar la fila de headers dinámicamente
      const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Buscar la fila que contiene "CODIGO" o "ARTICULO" (puede no ser la primera)
      const norm = (v: unknown) => String(v ?? '').trim().toUpperCase()
      const headerRowIdx = rawRows.findIndex(row =>
        (row as unknown[]).some(cell => norm(cell).includes('CODIGO') || norm(cell).includes('ARTICULO'))
      )

      if (headerRowIdx === -1) {
        setImportMsg({ type: 'error', text: 'No se encontró fila de encabezados con CODIGO/ARTICULO.' })
        setImportando(false)
        return
      }

      const headers = (rawRows[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim())
      const dataRows = rawRows.slice(headerRowIdx + 1)

      // Mapeo flexible: índice de columna por palabra clave
      const colIdx = (keyword: string, exclude?: string) =>
        headers.findIndex(h => {
          const u = h.toUpperCase()
          return u.includes(keyword.toUpperCase()) && (!exclude || !u.includes(exclude.toUpperCase()))
        })

      const iLinea     = colIdx('LINEA')
      const iCodigo    = colIdx('CODIGO')
      const iArticulo  = colIdx('ARTICULO')
      const iConsumo   = colIdx('CONSUMO')
      const iIntermedio = colIdx('INTERMEDIO')
      const iReserva   = colIdx('RESERVA')
      const iNordelta  = colIdx('NORDELTA')
      const iDrop      = colIdx('DROP', 'CAMILO')
      const iDropCamilo = colIdx('CAMILO')
      const iCosto     = colIdx('COSTO', 'TOTAL')
      const iTotalCosto = colIdx('TOTAL COSTO')

      if (iCodigo === -1 || iArticulo === -1) {
        setImportMsg({ type: 'error', text: `No se encontraron CODIGO/ARTICULO. Headers detectados: ${headers.join(' | ')}` })
        setImportando(false)
        return
      }

      const get = (row: unknown[], idx: number) => idx >= 0 ? row[idx] : 0

      const inserts = dataRows
        .filter(row => {
          const codigo = norm(get(row as unknown[], iCodigo))
          return codigo && /\d/.test(codigo)
        })
        .map(row => {
          const r = row as unknown[]
          const articuloRaw = String(get(r, iArticulo) ?? '').trim()
          const sku = articuloRaw.includes(' - ')
            ? articuloRaw.split(' - ')[0].trim().toUpperCase()
            : articuloRaw.toUpperCase()

          const vm = parseNum(get(r, iConsumo))
                   + parseNum(get(r, iIntermedio))
                   + parseNum(get(r, iDrop))
                   + parseNum(get(r, iDropCamilo))
          const nrd = parseNum(get(r, iNordelta))
          const rsv = parseNum(get(r, iReserva))
          const costo = parseNum(get(r, iCosto))

          return {
            linea:    iLinea >= 0 ? String(get(r, iLinea)).trim() : '',
            codigo:   String(get(r, iCodigo)).trim(),
            sku,
            articulo: articuloRaw,
            cantidad_villa_martelli: vm,
            cantidad_nordelta: nrd,
            cantidad_reserva: rsv,
            cantidad_total: vm + nrd + rsv,
            costo,
            total_costo: iTotalCosto >= 0 ? parseNum(get(r, iTotalCosto)) : costo * (vm + nrd + rsv),
          }
        })

      if (inserts.length === 0) {
        setImportMsg({ type: 'error', text: 'No se encontraron filas válidas.' })
        setImportando(false)
        return
      }

      const supabase = createClient()
      const { error: delError } = await supabase.from('stock').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (delError) { setImportMsg({ type: 'error', text: `Error al limpiar: ${delError.message}` }); setImportando(false); return }

      const { error } = await supabase.from('stock').insert(inserts)
      if (error) { setImportMsg({ type: 'error', text: `Error Supabase: ${error.message}` }); setImportando(false); return }

      await fetchData()

      const cols = [
        iConsumo >= 0 && `Consumo(${headers[iConsumo]})→VM`,
        iIntermedio >= 0 && `Intermedio(${headers[iIntermedio]})→VM`,
        iDrop >= 0 && `Drop(${headers[iDrop]})→VM`,
        iDropCamilo >= 0 && `DropCamilo(${headers[iDropCamilo]})→VM`,
        iNordelta >= 0 && `Nordelta(${headers[iNordelta]})`,
        iReserva >= 0 && `Reserva(${headers[iReserva]})`,
        iCosto >= 0 && `Costo(${headers[iCosto]})`,
      ].filter(Boolean).join(', ')
      setImportMsg({ type: 'ok', text: `${inserts.length} productos cargados. Cols: ${cols}` })
    } catch (err) {
      setImportMsg({ type: 'error', text: `Error al leer el archivo: ${String(err)}` })
    }

    setImportando(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const getCant = (i: StockItem) =>
    deposito === 'nordelta' ? i.cantidad_nordelta
    : deposito === 'villa_martelli' ? i.cantidad_villa_martelli
    : deposito === 'reserva' ? i.cantidad_reserva
    : i.cantidad_nordelta + i.cantidad_villa_martelli

  const lineas = Array.from(new Set(items.map(getLinea).filter(Boolean))).sort()

  const filtrado = items
    .filter(i => {
      const q = busqueda.toLowerCase()
      const matchQ = !q || i.sku?.toLowerCase().includes(q) || i.articulo?.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q) || i.linea?.toLowerCase().includes(q)
      const matchD = deposito === 'todos'
        || (deposito === 'nordelta' && i.cantidad_nordelta > 0)
        || (deposito === 'villa_martelli' && i.cantidad_villa_martelli > 0)
        || (deposito === 'reserva' && i.cantidad_reserva > 0)
      const cant = getCant(i)
      const matchMin = minCant === '' || cant >= Number(minCant)
      const matchMax = maxCant === '' || cant <= Number(maxCant)
      const matchLinea = !lineaFilter || getLinea(i) === lineaFilter
      return matchQ && matchD && matchMin && matchMax && matchLinea
    })
    .sort((a, b) => {
      if (!sortDir) return 0
      const diff = getCant(a) - getCant(b)
      return sortDir === 'asc' ? diff : -diff
    })

  const totalNordelta = items.reduce((s, i) => s + i.cantidad_nordelta, 0)
  const totalVM = items.reduce((s, i) => s + i.cantidad_villa_martelli, 0)
  const totalReserva = items.reduce((s, i) => s + i.cantidad_reserva, 0)
  const totalGlobal = items.reduce((s, i) => s + i.cantidad_nordelta + i.cantidad_villa_martelli, 0)
  const costoNordelta = items.reduce((s, i) => s + (i.costo_usd || 0) * i.cantidad_nordelta, 0)
  const costoVM = items.reduce((s, i) => s + (i.costo_usd || 0) * i.cantidad_villa_martelli, 0)
  const costoReserva = items.reduce((s, i) => s + (i.costo_usd || 0) * i.cantidad_reserva, 0)
  const costoTotal = costoNordelta + costoVM
  const fmtUsd = (v: number) => `USD ${v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Inventario por depósito"
        icon={Package}
        action={
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            <button onClick={() => fileRef.current?.click()} disabled={importando}
              className="flex items-center gap-2 bg-card hover:bg-card-hover border border-border text-text-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              <Upload className="w-4 h-4" />
              {importando ? 'Importando...' : 'Importar Excel'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <MetricCard title="Disponible total" value={`${totalGlobal.toLocaleString('es-AR')} uds`} icon={Package} color="blue" loading={loading} />
        <MetricCard title="Nordelta" value={`${totalNordelta.toLocaleString('es-AR')} uds`} icon={Package} color="green" loading={loading} />
        <MetricCard title="Villa Martelli" value={`${totalVM.toLocaleString('es-AR')} uds`} icon={Package} color="purple" loading={loading} />
        <MetricCard title="Reserva (no disponible)" value={`${totalReserva.toLocaleString('es-AR')} uds`} icon={Package} color="yellow" loading={loading} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-text-muted mb-1">Costo total disponible</p>
          <p className="text-sm font-semibold text-text-primary">{fmtUsd(costoTotal)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-text-muted mb-1">Costo Nordelta</p>
          <p className="text-sm font-semibold text-green-600">{fmtUsd(costoNordelta)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-text-muted mb-1">Costo Villa Martelli</p>
          <p className="text-sm font-semibold text-blue-600">{fmtUsd(costoVM)}</p>
        </div>
      </div>

      {importMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${importMsg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {importMsg.text}
        </div>
      )}

      <div className="flex flex-col gap-3 mb-4">
        {/* Fila 1: depósito + búsqueda + cant */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-2 flex-wrap">
            {(['todos', 'nordelta', 'villa_martelli', 'reserva'] as Deposito[]).map(d => (
              <button key={d} onClick={() => setDeposito(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${deposito === d ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}>
                {DEPOSITO_LABEL[d]}
                {d === 'reserva' && <span className="ml-1 text-yellow-500">⚠</span>}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" placeholder="Buscar por SKU, código o nombre..." value={busqueda}
              onChange={e => setBusqueda(e.target.value)} className="w-full pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted whitespace-nowrap">Cant:</span>
            <input type="number" min="0" placeholder="Mín" value={minCant}
              onChange={e => setMinCant(e.target.value)} className="w-20 text-sm" />
            <span className="text-xs text-text-muted">—</span>
            <input type="number" min="0" placeholder="Máx" value={maxCant}
              onChange={e => setMaxCant(e.target.value)} className="w-20 text-sm" />
            {(minCant !== '' || maxCant !== '') && (
              <button onClick={() => { setMinCant(''); setMaxCant('') }}
                className="text-xs text-muted hover:text-text-primary transition-colors">✕</button>
            )}
          </div>
        </div>

        {/* Fila 2: filtro por línea + limpiar todo */}
        {lineas.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted whitespace-nowrap">Línea:</span>
            <select
              value={lineaFilter}
              onChange={e => setLineaFilter(e.target.value)}
              className="w-48 text-sm"
            >
              <option value="">Todas las líneas</option>
              {lineas.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            {(busqueda !== '' || deposito !== 'todos' || minCant !== '' || maxCant !== '' || lineaFilter !== '') && (
              <button
                onClick={() => { setBusqueda(''); setDeposito('todos'); setMinCant(''); setMaxCant(''); setLineaFilter('') }}
                className="flex items-center gap-1 text-xs text-text-muted border border-border rounded-md px-3 py-1.5 hover:bg-card-hover hover:text-text-primary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {deposito === 'reserva' && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm border bg-yellow-50 border-yellow-200 text-yellow-700">
          Estos productos están reservados y no están disponibles para la venta.
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-text-primary">
            {DEPOSITO_LABEL[deposito]}
            <span className="ml-2 text-xs font-normal text-text-muted">({filtrado.length} productos)</span>
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-text-muted">Cargando...</div>
        ) : filtrado.length === 0 ? (
          <div className="p-8 text-center text-text-muted">No hay productos. Importá el Excel para cargar el stock.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover">
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Línea</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Artículo</th>
                  {deposito === 'todos' ? (
                    <>
                      <th className="text-right px-4 py-3 text-xs font-medium text-green-600 uppercase">Nordelta</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-blue-600 uppercase">Villa Martelli</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-yellow-600 uppercase">Reserva</th>
                      <th
                        className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none hover:text-text-primary transition-colors"
                        onClick={() => setSortDir(s => s === 'asc' ? 'desc' : s === 'desc' ? null : 'asc')}
                      >
                        <span className="inline-flex items-center gap-1">
                          Total disp.
                          {sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-accent" /> : sortDir === 'desc' ? <ArrowDown className="w-3 h-3 text-accent" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                        </span>
                      </th>
                    </>
                  ) : (
                    <th
                      className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none hover:text-text-primary transition-colors"
                      onClick={() => setSortDir(s => s === 'asc' ? 'desc' : s === 'desc' ? null : 'asc')}
                    >
                      <span className="inline-flex items-center gap-1 justify-end w-full">
                        Cantidad
                        {sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-accent" /> : sortDir === 'desc' ? <ArrowDown className="w-3 h-3 text-accent" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </span>
                    </th>
                  )}
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Costo USD</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Valor USD</th>
                </tr>
              </thead>
              <tbody>
                {filtrado.map(item => {
                  const cantMostrar = getCant(item)
                  const valorUsd = (item.costo_usd || 0) * cantMostrar
                  return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-xs text-text-muted">{getLinea(item) || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-primary">{item.sku}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs max-w-64 truncate">{item.articulo}</td>
                    {deposito === 'todos' ? (
                      <>
                        <td className="px-4 py-3 text-right font-semibold text-sm text-green-600">{item.cantidad_nordelta || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-sm text-blue-600">{item.cantidad_villa_martelli || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-sm text-yellow-600">{item.cantidad_reserva || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-sm text-text-primary">{item.cantidad_nordelta + item.cantidad_villa_martelli}</td>
                      </>
                    ) : (
                      <td className="px-4 py-3 text-right font-semibold text-sm text-text-primary">{cantMostrar}</td>
                    )}
                    <td className="px-4 py-3 text-right text-xs text-text-secondary">
                      {item.costo_usd ? `USD ${item.costo_usd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-text-primary">
                      {valorUsd > 0 ? `USD ${valorUsd.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
