'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { createClient } from '@/lib/supabase'
import { Search, LayoutDashboard, TrendingUp, Percent, Users, Receipt, HandCoins, Package, Landmark, LineChart, Truck, CalendarDays, Target, Shield, ClipboardList, X } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  { href: '/dashboard/ventas', label: 'Ventas', icon: TrendingUp },
  { href: '/dashboard/margenes', label: 'Márgenes', icon: Percent },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
  { href: '/dashboard/gastos', label: 'Gastos', icon: Receipt },
  { href: '/dashboard/comisiones', label: 'Comisiones', icon: HandCoins },
  { href: '/dashboard/stock', label: 'Stock', icon: Package },
  { href: '/dashboard/cajas', label: 'Cajas', icon: Landmark },
  { href: '/dashboard/inversiones', label: 'Marketing', icon: LineChart },
  { href: '/dashboard/envios', label: 'Envíos', icon: Truck },
  { href: '/dashboard/reuniones', label: 'Reuniones', icon: CalendarDays },
  { href: '/dashboard/objetivos', label: 'Objetivos', icon: Target },
  { href: '/dashboard/cotizador', label: 'Cotizador', icon: ClipboardList },
  { href: '/dashboard/admin', label: 'Usuarios', icon: Shield },
]

interface SearchResult {
  type: 'cliente' | 'venta' | 'producto'
  id: string
  title: string
  subtitle?: string
  href: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export default function GlobalSearch({ open, onOpenChange }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  // Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  // Reset on close
  useEffect(() => {
    if (!open) { setQuery(''); setResults([]) }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const supabase = createClient()
    const term = q.trim()

    const [clientesRes, ventasRes, productosRes] = await Promise.all([
      supabase.from('clientes').select('id, nombre').ilike('nombre', `%${term}%`).limit(5),
      supabase.from('ventas').select('id, numero_factura, razon_social, monto, moneda, fecha').or(`numero_factura.ilike.%${term}%,razon_social.ilike.%${term}%`).order('fecha', { ascending: false }).limit(5),
      supabase.from('productos').select('sku, nombre, codigo').or(`sku.ilike.%${term}%,nombre.ilike.%${term}%,codigo.ilike.%${term}%`).limit(5),
    ])

    const found: SearchResult[] = []

    for (const c of clientesRes.data || []) {
      found.push({ type: 'cliente', id: c.id, title: c.nombre, subtitle: 'Cliente', href: '/dashboard/clientes' })
    }
    for (const v of ventasRes.data || []) {
      found.push({
        type: 'venta',
        id: v.id,
        title: v.numero_factura || v.razon_social || 'Venta sin número',
        subtitle: `${v.moneda?.toUpperCase()} ${Number(v.monto).toLocaleString('es-AR')} · ${v.fecha}`,
        href: '/dashboard/ventas',
      })
    }
    for (const p of productosRes.data || []) {
      found.push({ type: 'producto', id: p.sku, title: p.nombre || p.sku, subtitle: `SKU: ${p.sku}`, href: '/dashboard/productos' })
    }

    setResults(found)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250)
    return () => clearTimeout(timer)
  }, [query, search])

  const handleSelect = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const filteredNav = query
    ? NAV_ITEMS.filter(n => n.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ITEMS

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4" onClick={() => onOpenChange(false)}>
      <div
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="bg-transparent">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted flex-shrink-0" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar clientes, ventas, productos..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-muted outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-muted hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted border border-border rounded">ESC</kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted">
              {loading ? 'Buscando...' : 'Sin resultados'}
            </Command.Empty>

            {/* Navegación */}
            {filteredNav.length > 0 && (
              <Command.Group heading={<span className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Ir a...</span>}>
                {filteredNav.map(item => {
                  const Icon = item.icon
                  return (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => handleSelect(item.href)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-card-hover cursor-pointer data-[selected=true]:bg-card-hover data-[selected=true]:text-text-primary transition-colors"
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            )}

            {/* Resultados de búsqueda */}
            {results.length > 0 && (
              <>
                {results.filter(r => r.type === 'cliente').length > 0 && (
                  <Command.Group heading={<span className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Clientes</span>}>
                    {results.filter(r => r.type === 'cliente').map(r => (
                      <Command.Item
                        key={r.id}
                        value={r.id}
                        onSelect={() => handleSelect(r.href)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-card-hover data-[selected=true]:bg-card-hover transition-colors"
                      >
                        <Users className="w-4 h-4 text-muted flex-shrink-0" />
                        <span className="text-text-primary">{r.title}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {results.filter(r => r.type === 'venta').length > 0 && (
                  <Command.Group heading={<span className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Ventas</span>}>
                    {results.filter(r => r.type === 'venta').map(r => (
                      <Command.Item
                        key={r.id}
                        value={r.id}
                        onSelect={() => handleSelect(r.href)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-card-hover data-[selected=true]:bg-card-hover transition-colors"
                      >
                        <TrendingUp className="w-4 h-4 text-muted flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-text-primary truncate">{r.title}</p>
                          {r.subtitle && <p className="text-text-muted text-xs truncate">{r.subtitle}</p>}
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {results.filter(r => r.type === 'producto').length > 0 && (
                  <Command.Group heading={<span className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Productos</span>}>
                    {results.filter(r => r.type === 'producto').map(r => (
                      <Command.Item
                        key={r.id}
                        value={r.id}
                        onSelect={() => handleSelect(r.href)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-card-hover data-[selected=true]:bg-card-hover transition-colors"
                      >
                        <Package className="w-4 h-4 text-muted flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-text-primary truncate">{r.title}</p>
                          {r.subtitle && <p className="text-text-muted text-xs truncate">{r.subtitle}</p>}
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
