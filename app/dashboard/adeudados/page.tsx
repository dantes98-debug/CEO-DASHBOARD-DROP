'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import Private from '@/components/Private'
import { formatDate } from '@/lib/utils'
import { AlertCircle, Package, Users, Clock, Search, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'

interface Item {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  entregado?: boolean
}

interface VentaRaw {
  id: string
  fecha: string
  razon_social: string | null
  numero_factura: string | null
  estado: string
  items: Item[]
  envio_id: string | null
  envio_estado: string | null
  esperando_stock: boolean | null
}

interface ItemAdeudado {
  venta_id: string
  item_index: number
  fecha: string
  razon_social: string
  numero_factura: string | null
  sku: string
  descripcion: string
  cantidad: number
  dias_pendiente: number
  envio_id: string | null
  envio_estado: string | null
  esperando_stock: boolean
}

type AgrupadorKey = 'cliente' | 'producto'

export default function AdeudadosPage() {
  const [ventas, setVentas] = useState<VentaRaw[]>([])
  const [loading, setLoading] = useState(true)
  const [entregando, setEntregando] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [agrupador, setAgrupador] = useState<AgrupadorKey>('cliente')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const fetchData = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('ventas')
      .select('id, fecha, razon_social, numero_factura, estado, items, envios(id, estado, esperando_stock)')
      .or('canal.neq.ecommerce,confirmada.eq.true')
      .order('fecha', { ascending: true })

    const mapped: VentaRaw[] = (data || []).map((v: any) => ({
      id: v.id,
      fecha: v.fecha,
      razon_social: v.razon_social,
      numero_factura: v.numero_factura,
      estado: v.estado,
      items: Array.isArray(v.items) ? v.items : [],
      envio_id: v.envios?.[0]?.id ?? null,
      envio_estado: v.envios?.[0]?.estado ?? null,
      esperando_stock: v.envios?.[0]?.esperando_stock ?? false,
    }))

    setVentas(mapped)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleEntregarItem = async (venta: VentaRaw, itemIndex: number) => {
    const key = `${venta.id}-${itemIndex}`
    setEntregando(key)
    const supabase = createClient()

    const nuevosItems = venta.items.map((item, i) =>
      i === itemIndex ? { ...item, entregado: true } : item
    )
    const todosEntregados = nuevosItems.every(i => i.entregado === true)

    await supabase.from('ventas').update({
      items: nuevosItems,
      ...(todosEntregados ? { estado: 'entregado' } : {}),
    }).eq('id', venta.id)

    setVentas(prev => prev.map(v =>
      v.id !== venta.id ? v : { ...v, items: nuevosItems, estado: todosEntregados ? 'entregado' : v.estado }
    ))
    setEntregando(null)
  }

  const hoy = useMemo(() => new Date(), [])

  // Solo items no entregados
  const items: ItemAdeudado[] = useMemo(() => {
    const lista: ItemAdeudado[] = []
    for (const v of ventas) {
      const fecha = new Date(v.fecha)
      const dias = Math.floor((hoy.getTime() - fecha.getTime()) / 86400000)
      v.items.forEach((item, idx) => {
        if (item.entregado === true) return
        lista.push({
          venta_id: v.id,
          item_index: idx,
          fecha: v.fecha,
          razon_social: v.razon_social || 'Sin nombre',
          numero_factura: v.numero_factura,
          sku: item.sku || '',
          descripcion: item.descripcion || '',
          cantidad: item.cantidad || 1,
          dias_pendiente: dias,
          envio_id: v.envio_id,
          envio_estado: v.envio_estado,
          esperando_stock: v.esperando_stock || false,
        })
      })
    }
    return lista
  }, [ventas, hoy])

  const itemsFiltrados = useMemo(() => {
    if (!busqueda.trim()) return items
    const q = busqueda.toLowerCase()
    return items.filter(i =>
      i.razon_social.toLowerCase().includes(q) ||
      i.descripcion.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q)
    )
  }, [items, busqueda])

  const grupos = useMemo(() => {
    const map = new Map<string, ItemAdeudado[]>()
    for (const item of itemsFiltrados) {
      const key = agrupador === 'cliente' ? item.razon_social : `${item.sku} — ${item.descripcion}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries()).sort((a, b) => {
      const maxA = Math.max(...a[1].map(i => i.dias_pendiente))
      const maxB = Math.max(...b[1].map(i => i.dias_pendiente))
      return maxB - maxA
    })
  }, [itemsFiltrados, agrupador])

  const totalItems = items.length
  const totalClientes = new Set(items.map(i => i.razon_social)).size
  const masAntiguo = items.length > 0 ? Math.max(...items.map(i => i.dias_pendiente)) : 0
  const sinEnvio = new Set(items.filter(i => !i.envio_id).map(i => i.venta_id)).size

  const toggleGrupo = (key: string) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const expandirTodos = () => setExpandidos(new Set(grupos.map(([k]) => k)))
  const colapsarTodos = () => setExpandidos(new Set())

  const ventaMap = useMemo(() => {
    const m = new Map<string, VentaRaw>()
    for (const v of ventas) m.set(v.id, v)
    return m
  }, [ventas])

  function badgeEnvio(item: ItemAdeudado) {
    if (!item.envio_id) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">Sin envío</span>
    if (item.esperando_stock) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">Esp. stock</span>
    const estados: Record<string, string> = { pendiente: 'Pendiente', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' }
    const colors: Record<string, string> = { pendiente: 'bg-yellow-500/15 text-yellow-400', en_camino: 'bg-blue-500/15 text-blue-400', entregado: 'bg-green-500/15 text-green-400', cancelado: 'bg-zinc-500/15 text-zinc-400' }
    const estado = item.envio_estado || 'pendiente'
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[estado] || 'bg-zinc-500/15 text-zinc-400'}`}>{estados[estado] || estado}</span>
  }

  function colorDias(dias: number) {
    if (dias >= 60) return 'text-red-400 font-bold'
    if (dias >= 30) return 'text-orange-400 font-semibold'
    if (dias >= 14) return 'text-yellow-400'
    return 'text-text-muted'
  }

  return (
    <div>
      <PageHeader title="Adeudados" description="Productos pendientes de entrega por cliente" icon={AlertCircle} />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Package className="w-3 h-3" /> Items adeudados</p>
          <p className="text-2xl font-bold text-text-primary">{totalItems}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Clientes</p>
          <p className="text-2xl font-bold text-text-primary">{totalClientes}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Más antiguo</p>
          <p className={`text-2xl font-bold ${colorDias(masAntiguo)}`}>{masAntiguo}d</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1">Sin envío creado</p>
          <p className="text-2xl font-bold text-red-400">{sinEnvio}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, producto, SKU..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-card border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          <button onClick={() => setAgrupador('cliente')} className={`px-3 py-1 text-xs rounded-md transition-colors ${agrupador === 'cliente' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}>Por cliente</button>
          <button onClick={() => setAgrupador('producto')} className={`px-3 py-1 text-xs rounded-md transition-colors ${agrupador === 'producto' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'}`}>Por producto</button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={expandirTodos} className="text-xs text-text-muted hover:text-text-primary transition-colors">Expandir todo</button>
          <span className="text-border">|</span>
          <button onClick={colapsarTodos} className="text-xs text-text-muted hover:text-text-primary transition-colors">Colapsar todo</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-text-muted text-sm">Cargando...</div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-sm">
          {busqueda ? 'Sin resultados' : 'No hay productos adeudados — todo entregado ✓'}
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map(([key, grupoItems]) => {
            const isOpen = expandidos.has(key)
            const maxDias = Math.max(...grupoItems.map(i => i.dias_pendiente))
            const totalCant = grupoItems.reduce((s, i) => s + i.cantidad, 0)
            const sinEnvioGrupo = grupoItems.filter(i => !i.envio_id).length

            return (
              <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => toggleGrupo(key)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{key}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {grupoItems.length} producto{grupoItems.length !== 1 ? 's' : ''} · {totalCant} unidad{totalCant !== 1 ? 'es' : ''}
                      {sinEnvioGrupo > 0 && <span className="ml-2 text-red-400">· {sinEnvioGrupo} sin envío</span>}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${colorDias(maxDias)}`}>{maxDias}d</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-card-hover">
                          {agrupador === 'cliente' ? (
                            <>
                              <th className="text-left py-2 px-4 text-xs text-text-muted font-medium">Producto</th>
                              <th className="text-left py-2 px-4 text-xs text-text-muted font-medium">SKU</th>
                            </>
                          ) : (
                            <th className="text-left py-2 px-4 text-xs text-text-muted font-medium">Cliente</th>
                          )}
                          <th className="text-center py-2 px-4 text-xs text-text-muted font-medium">Cant.</th>
                          <th className="text-left py-2 px-4 text-xs text-text-muted font-medium">Venta</th>
                          <th className="text-right py-2 px-4 text-xs text-text-muted font-medium">Días</th>
                          <th className="text-right py-2 px-4 text-xs text-text-muted font-medium">Envío</th>
                          <th className="text-right py-2 px-4 text-xs text-text-muted font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupoItems.map((item, idx) => {
                          const eKey = `${item.venta_id}-${item.item_index}`
                          const venta = ventaMap.get(item.venta_id)
                          return (
                            <tr key={idx} className="border-b border-border/30 hover:bg-card-hover transition-colors">
                              {agrupador === 'cliente' ? (
                                <>
                                  <td className="py-2.5 px-4 text-xs text-text-secondary">{item.descripcion}</td>
                                  <td className="py-2.5 px-4 text-xs text-text-muted font-mono">{item.sku}</td>
                                </>
                              ) : (
                                <td className="py-2.5 px-4 text-xs text-text-secondary font-medium">{item.razon_social}</td>
                              )}
                              <td className="py-2.5 px-4 text-xs text-center text-text-primary font-semibold">{item.cantidad}</td>
                              <td className="py-2.5 px-4 text-xs text-text-muted">
                                {formatDate(item.fecha)}
                                {item.numero_factura && <span className="ml-1 text-text-muted/60">· {item.numero_factura}</span>}
                              </td>
                              <td className={`py-2.5 px-4 text-xs text-right ${colorDias(item.dias_pendiente)}`}>{item.dias_pendiente}d</td>
                              <td className="py-2.5 px-4 text-xs text-right">{badgeEnvio(item)}</td>
                              <td className="py-2.5 px-4 text-xs text-right">
                                {venta && (
                                  <button
                                    onClick={() => handleEntregarItem(venta, item.item_index)}
                                    disabled={entregando === eKey}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors text-[11px] font-semibold whitespace-nowrap"
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    {entregando === eKey ? '...' : 'Entregar'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
