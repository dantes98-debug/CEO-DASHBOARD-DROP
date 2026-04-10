'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  TrendingUp,
  Percent,
  Users,
  Receipt,
  HandCoins,
  Package,
  Landmark,
  LineChart,
  CalendarDays,
  Target,
  LogOut,
  BarChart3,
  ChevronLeft,
  Menu,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/ventas', label: 'Ventas', icon: TrendingUp },
  { href: '/dashboard/margenes', label: 'Márgenes', icon: Percent },
  { href: '/dashboard/clientes', label: 'Clientes', icon: Users },
  { href: '/dashboard/gastos', label: 'Gastos', icon: Receipt },
  { href: '/dashboard/comisiones', label: 'Comisiones', icon: HandCoins },
  { href: '/dashboard/stock', label: 'Stock', icon: Package },
  { href: '/dashboard/cajas', label: 'Cajas', icon: Landmark },
  { href: '/dashboard/inversiones', label: 'Inversiones', icon: LineChart },
  { href: '/dashboard/reuniones', label: 'Reuniones', icon: CalendarDays },
  { href: '/dashboard/objetivos', label: 'Objetivos', icon: Target },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-3 p-4 border-b border-border",
        collapsed ? "justify-center" : "justify-between"
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">CEO Dashboard</p>
              <p className="text-xs text-muted truncate">Panel ejecutivo</p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1 rounded text-muted hover:text-text-primary hover:bg-card-hover transition-colors flex-shrink-0"
        >
          <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium",
                active
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary hover:bg-card-hover",
                collapsed && "justify-center"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0 w-5 h-5" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-border">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium text-text-secondary hover:text-red-400 hover:bg-red-500/10 w-full",
            collapsed && "justify-center"
          )}
          title={collapsed ? "Cerrar sesión" : undefined}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-card rounded-lg border border-border text-text-secondary"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        "lg:hidden fixed left-0 top-0 bottom-0 z-50 bg-card border-r border-border transition-transform duration-300",
        "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-card border-r border-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}>
        <SidebarContent />
      </aside>
    </>
  )
}
