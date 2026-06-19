'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { tienePermiso, type UserProfile, type Seccion } from '@/lib/permisos'
import {
  LayoutDashboard, TrendingUp, Users, Receipt, HandCoins, Landmark,
  LineChart, CalendarDays, Target, LogOut, ChevronLeft, Menu, Shield,
  Truck, ClipboardList, Search, Boxes, MessageSquare, ShoppingCart,
  Eye, EyeOff, Store, Percent, Package, FileText, GitBranch, AlertCircle, Ship, ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import GlobalSearch from '@/components/GlobalSearch'
import AlertasBell from '@/components/AlertasBell'
import MensajesBadge from '@/components/MensajesBadge'
import PushButton from '@/components/PushButton'
import { usePrivacy } from '@/lib/privacy-context'

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
  seccion?: Seccion
  adminOnly?: boolean
}

type NavGroup = {
  label: string | null
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Finanzas',
    items: [
      { href: '/dashboard',         label: 'Resumen',    icon: LayoutDashboard, exact: true, seccion: 'resumen' },
      { href: '/dashboard/pl',      label: 'P&L',        icon: FileText,        seccion: 'pl' },
      { href: '/dashboard/ventas',  label: 'Ventas',     icon: TrendingUp,      seccion: 'ventas' },
      { href: '/dashboard/gastos',  label: 'Gastos',     icon: Receipt,         seccion: 'gastos' },
      { href: '/dashboard/cajas',   label: 'Cajas',      icon: Landmark,        seccion: 'cajas' },
      { href: '/dashboard/cashflow',label: 'Flujo Caja', icon: GitBranch,       seccion: 'cashflow' },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { href: '/dashboard/compras',       label: 'Compras',       icon: ShoppingCart, seccion: 'compras' },
      { href: '/dashboard/envios',        label: 'Envíos',        icon: Truck,        seccion: 'envios' },
      { href: '/dashboard/adeudados',     label: 'Adeudados',     icon: AlertCircle,  seccion: 'adeudados' },
      { href: '/dashboard/importaciones', label: 'Importaciones', icon: Ship,         seccion: 'importaciones' },
      { href: '/dashboard/garantias',     label: 'Garantías',     icon: ShieldCheck,  seccion: 'garantias' },
      { href: '/dashboard/stock',         label: 'Stock',         icon: Package,      seccion: 'stock' },
      { href: '/dashboard/ecommerce',     label: 'Ecommerce',     icon: Store,        seccion: 'ecommerce' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/dashboard/clientes',   label: 'Clientes',   icon: Users,        seccion: 'clientes' },
      { href: '/dashboard/crm',        label: 'CRM',        icon: LineChart,     seccion: 'crm' },
      { href: '/dashboard/comisiones', label: 'Comisiones', icon: HandCoins,    seccion: 'comisiones' },
      { href: '/dashboard/cotizador',  label: 'Cotizador',  icon: ClipboardList,seccion: 'cotizador' },
    ],
  },
  {
    label: 'Productos',
    items: [
      { href: '/dashboard/productos', label: 'Catálogo',  icon: Boxes,   seccion: 'productos' },
      { href: '/dashboard/margenes',  label: 'Márgenes',  icon: Percent, seccion: 'margenes' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/dashboard/inversiones', label: 'Campañas', icon: LineChart, seccion: 'inversiones' },
    ],
  },
  {
    label: 'Estrategia',
    items: [
      { href: '/dashboard/objetivos', label: 'Objetivos',  icon: Target,       seccion: 'objetivos' },
      { href: '/dashboard/reuniones', label: 'Calendario', icon: CalendarDays, seccion: 'reuniones' },
      { href: '/dashboard/mensajes',  label: 'Mensajes',   icon: MessageSquare },
    ],
  },
  {
    label: null,
    items: [
      { href: '/dashboard/admin', label: 'Usuarios', icon: Shield, adminOnly: true },
    ],
  },
]

export default function Sidebar({ profile }: { profile: UserProfile }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { privacy, toggle: togglePrivacy } = usePrivacy()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const isItemVisible = (item: NavItem) => {
    if (item.adminOnly) return profile.role === 'admin'
    if (!item.seccion) return true
    return tienePermiso(profile, item.seccion)
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header / Logo */}
      <div className={cn(
        'flex items-center gap-3 p-4 border-b border-border',
        collapsed ? 'justify-center' : 'justify-between'
      )}>
        <div className="flex items-center gap-2 min-w-0">
          {collapsed ? (
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <Image src="/logo-drop.png" alt="Drop" width={24} height={24} className="object-contain" />
            </div>
          ) : (
            <Image
              src="/logo-drop.png"
              alt="Drop Griferías"
              width={120}
              height={36}
              className="object-contain h-8 w-auto invert brightness-200"
            />
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <AlertasBell />
          <PushButton collapsed={false} />
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1 rounded text-muted hover:text-text-primary hover:bg-card-hover transition-colors"
          >
            <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={() => setSearchOpen(true)}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted hover:text-text-primary hover:bg-card-hover transition-colors',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Buscar (Ctrl+K)' : undefined}
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Buscar...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] border border-border rounded font-mono">⌃K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav con grupos */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {navGroups.map((group, gi) => {
          const visibleItems = group.items.filter(isItemVisible)
          if (visibleItems.length === 0) return null
          return (
            <div key={gi} className="mb-1">
              {group.label && !collapsed && (
                <p className="text-[10px] uppercase tracking-widest text-text-muted px-3 pt-3 pb-1">
                  {group.label}
                </p>
              )}
              {group.label && collapsed && gi > 0 && (
                <div className="my-1 border-t border-border/50" />
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href, item.exact)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium',
                        active
                          ? 'bg-accent text-white'
                          : 'text-text-secondary hover:text-text-primary hover:bg-card-hover',
                        collapsed && 'justify-center'
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {item.href === '/dashboard/mensajes' && <MensajesBadge />}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User info + Logout */}
      <div className="p-3 border-t border-border space-y-1">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-text-primary truncate">{profile.nombre}</p>
            <p className="text-xs text-muted truncate">{profile.role === 'admin' ? 'Administrador' : 'Usuario'}</p>
          </div>
        )}
        <button
          onClick={togglePrivacy}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium w-full',
            privacy ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover',
            collapsed && 'justify-center'
          )}
          title={collapsed ? (privacy ? 'Mostrar valores' : 'Ocultar valores') : undefined}
        >
          {privacy ? <EyeOff className="w-4 h-4 flex-shrink-0" /> : <Eye className="w-4 h-4 flex-shrink-0" />}
          {!collapsed && <span>{privacy ? 'Mostrar valores' : 'Ocultar valores'}</span>}
        </button>
        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium text-text-secondary hover:text-red-400 hover:bg-red-500/10 w-full',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Cerrar sesión' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card rounded-lg border border-border text-text-secondary shadow-sm"
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        'lg:hidden fixed left-0 top-0 bottom-0 z-50 bg-card border-r border-border transition-transform duration-300 w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>

      <aside className={cn(
        'hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-card border-r border-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}>
        <SidebarContent />
      </aside>
    </>
  )
}
