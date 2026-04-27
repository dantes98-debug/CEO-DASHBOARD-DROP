'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { tienePermiso, type UserProfile, type Seccion } from '@/lib/permisos'
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Receipt,
  HandCoins,
  Landmark,
  LineChart,
  CalendarDays,
  Target,
  LogOut,
  ChevronLeft,
  Menu,
  Shield,
  Truck,
  ClipboardList,
  Search,
  Boxes,
} from 'lucide-react'
import { useState } from 'react'
import GlobalSearch from '@/components/GlobalSearch'

const navItems: { href: string; label: string; icon: React.ElementType; exact?: boolean; seccion?: Seccion; adminOnly?: boolean }[] = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/ventas', label: 'Ventas', icon: TrendingUp, seccion: 'ventas' },
  { href: '/dashboard/productos', label: 'Productos', icon: Boxes, seccion: 'productos' },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users, seccion: 'clientes' },
  { href: '/dashboard/gastos', label: 'Gastos', icon: Receipt, seccion: 'gastos' },
  { href: '/dashboard/cajas', label: 'Cajas', icon: Landmark, seccion: 'cajas' },
  { href: '/dashboard/inversiones', label: 'Marketing', icon: LineChart, seccion: 'inversiones' },
  { href: '/dashboard/envios', label: 'Envíos', icon: Truck, seccion: 'envios' },
  { href: '/dashboard/reuniones', label: 'Reuniones', icon: CalendarDays, seccion: 'reuniones' },
  { href: '/dashboard/objetivos', label: 'Objetivos', icon: Target, seccion: 'objetivos' },
  { href: '/dashboard/cotizador', label: 'Cotizador', icon: ClipboardList },
  { href: '/dashboard/admin', label: 'Usuarios', icon: Shield, adminOnly: true },
]

export default function Sidebar({ profile }: { profile: UserProfile }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly) return profile.role === 'admin'
    if (!item.seccion) return true // resumen siempre visible
    return tienePermiso(profile, item.seccion)
  })

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
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1 rounded text-muted hover:text-text-primary hover:bg-card-hover transition-colors flex-shrink-0"
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
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

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium',
                active
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-card-hover',
                collapsed && 'justify-center'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
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
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium text-text-secondary hover:text-red-400 hover:bg-red-500/10 w-full',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Cerrar sesión' : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card rounded-lg border border-border text-text-secondary shadow-sm"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        'lg:hidden fixed left-0 top-0 bottom-0 z-50 bg-card border-r border-border transition-transform duration-300 w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-card border-r border-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}>
        <SidebarContent />
      </aside>
    </>
  )
}
