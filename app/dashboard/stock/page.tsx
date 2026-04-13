'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import MetricCard from '@/components/MetricCard'
import { formatCurrency } from '@/lib/utils'
import { Package, Upload, Search } from 'lucide-react'

interface StockItem {
  id: string
  linea: string
  codigo: string
  sku: string
  articulo: string
  cantidad_villa_martelli: number
  cantidad_nordelta: number
  cantidad_total: number
  costo: number
  total_costo: number
}

type Deposito = 'todos' | 'nordelta' | 'villa_martelli'

const DEPOSITO_LABEL: Record<Deposito, string> = {
  todos: 'Todos',
  nordelta: 'Nordelta',
  villa_martelli: 'Villa Martelli',
}

function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const n = Number(String(val).replace(/\s/g, ''))
  return isNaN(n) ? 0 : n
}

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [deposito, setDeposito] = useState<Deposito>('todos')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('stock').select('*').order('linea').order('articulo')
    setItems(data || [])
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
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws)

      if (rows.length === 0) {
        setImportMsg({ type: 'error', text: 'El archivo está vacío.' })
        setImportando(false)
        return
      }

      const normalize = (k: string) => k.trim().toUpperCase().replace(/\s+/g, ' ')
      const keys = Object.keys(rows[0])
      const col = (name: string) => keys.find(k => normalize(k) === name)

      const lineaKey = col('LINEA')
      const codigoKey = col('CODIGO')
      const articuloKey = col('ARTICULO')
      const consumoKey = col('CONSUMO INTERNO')
      const intermedioKey = col('INTERMEDIO')
      const reservaKey = col('RESERVA')
      const nordeltaKey = col('NORDELTA')
      const dropKey = col('DROP')
      const dropCamiloKey = col('DROP-CAMILO')
      const costoKey = col('COSTO')
      const totalCostoKey = col('TOTAL COSTO')

      if (!codigoKey || !articuloKey) {
        setImportMsg({ type: 'error', text: `Columnas detectadas: ${keys.join(', ')}. Faltan CODIGO y ARTICULO.` })
        setImportando(false)
        return
      }

      const inserts = rows
        .filter(r => r[codigoKey!] && r[articuloKey!])
        .map(r => {
          const articuloRaw = String(r[articuloKey!]).trim()
          const sku = articuloRaw.includes(' - ') ? articuloRaw.split(' - ')[0].trim().toUpperCase() : articuloRaw.toUpperCase()

          const vm = parseNum(consumoKey ? r[consumoKey] : 0)
                    + parseNum(intermedioKey ? r[intermedioKey] : 0)
                    + parseNum(reservaKey ? r[reservaKey] : 0)
                    + parseNum(dropKey ? r[dropKey] : 0)
                    + parseNum(dropCamiloKey ? r[dropCamiloKey] : 0)

          const nrd = parseNum(nordeltaKey ? r[nordeltaKey] : 0)

          return {
            linea: lineaKey ? String(r[lineaKey]).trim() : '',
            codigo: String(r[codigoKey!]).trim(),
            sku,
            articulo: articuloRaw,
            cantidad_villa_martelli: vm,
            cantidad_nordelta: nrd,
            cantidad_total: vm + nrd,
            costo: costoKey ? parseNum(r[costoKey]) : 0,
            total_costo: totalCostoKey ? parseNum(r[totalCostoKey]) : 0,
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
      setImportMsg({ type: 'ok', text: `${inserts.length} productos cargados correctamente.` })
    } catch (err) {
      setImportMsg({ type: 'error', text: `Error al leer el archivo: ${String(err)}` })
    }

    setImportando(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const filtrado = items.filter(i => {
    const q = busqueda.toLowerCase()
    const matchBusqueda = !q || i.sku?.toLowerCase().includes(q) || i.articulo?.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q) || i.linea?.toLowerCase().includes(q)
    const matchDeposito = deposito === 'todos' ||
      (deposito === 'nordelta' && i.cantidad_nordelta > 0) ||
      (deposito === 'villa_martelli' && i.cantidad_villa_martelli > 0)
    return matchBusqueda && matchDeposito
  })

  const totalNordelta = items.reduce((s, i) => s + i.cantidad_nordelta, 0)
  const totalVillaMartelli = items.reduce((s, i) => s + i.cantidad_villa_martelli, 0)
  const totalGlobal = items.reduce((s, i) => s + i.cantidad_total, 0)
  const totalCosto = items.reduce((s, i) => s + (i.total_costo || 0), 0)

  const cantidadDeposito = (item: StockItem) =>
    deposito === 'nordelta' ? item.cantidad_nordelta
    : deposito === 'villa_martelli' ? item.cantidad_villa_martelli
    : item.cantidad_total

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Total global" value={`${totalGlobal.toLocaleString('es-AR')} uds`} icon={Package} color="blue" loading={loading} />
        <MetricCard title="Nordelta" value={`${totalNordelta.toLocaleString('es-AR')} uds`} icon={Package} color="green" loading={loading} />
        <MetricCard title="Villa Martelli" value={`${totalVillaMartelli.toLocaleString('es-AR')} uds`} icon={Package} color="purple" loading={loading} />
        <MetricCard title="Valor total costo" value={formatCurrency(totalCosto)} icon={Package} color="yellow" loading={loading} />
      </div>

      {importMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${importMsg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {importMsg.text}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-2">
          {(['todos', 'nordelta', 'villa_martelli'] as Deposito[]).map(d => (
            <button key={d} onClick={() => setDeposito(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${deposito === d ? 'bg-accent text-white' : 'bg-card border border-border text-text-secondary hover:text-text-primary'}`}>
              {DEPOSITO_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="Buscar por SKU, código o nombre..." value={busqueda}
            onChange={e => setBusqueda(e.target.value)} className="w-full pl-9" />
        </div>
      </div>

      {/* Tabla */}
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
                      <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Nordelta</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Villa Martelli</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Total</th>
                    </>
                  ) : (
                    <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Cantidad</th>
                  )}
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Costo unit.</th>
                </tr>
              </thead>
              <tbody>
                {filtrado.map(item => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                    <td className="px-4 py-3 text-xs text-text-muted">{item.linea || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-primary">{item.sku}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs max-w-64 truncate">{item.articulo}</td>
                    {deposito === 'todos' ? (
                      <>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold text-sm ${item.cantidad_nordelta > 0 ? 'text-green-600' : 'text-text-muted'}`}>
                            {item.cantidad_nordelta}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold text-sm ${item.cantidad_villa_martelli > 0 ? 'text-blue-600' : 'text-text-muted'}`}>
                            {item.cantidad_villa_martelli}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-sm text-text-primary">
                          {item.cantidad_total}
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-3 text-right font-semibold text-sm text-text-primary">
                        {cantidadDeposito(item)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-xs text-text-secondary">
                      {item.costo > 0 ? formatCurrency(item.costo) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
