import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/get-profile'
import Sidebar from '@/components/Sidebar'
import { PrivacyProvider } from '@/lib/privacy-context'
import { tienePermiso, type Seccion } from '@/lib/permisos'

const RUTA_SECCION: Record<string, Seccion> = {
  '/dashboard':             'resumen',
  '/dashboard/ventas':      'ventas',
  '/dashboard/productos':   'productos',
  '/dashboard/clientes':    'clientes',
  '/dashboard/gastos':      'gastos',
  '/dashboard/cajas':       'cajas',
  '/dashboard/inversiones': 'inversiones',
  '/dashboard/envios':      'envios',
  '/dashboard/reuniones':   'reuniones',
  '/dashboard/objetivos':   'objetivos',
  '/dashboard/cotizador':   'cotizador',
}

function getSeccion(pathname: string): Seccion | null {
  if (pathname === '/dashboard') return 'resumen'
  for (const [route, seccion] of Object.entries(RUTA_SECCION)) {
    if (route !== '/dashboard' && (pathname === route || pathname.startsWith(route + '/'))) {
      return seccion
    }
  }
  return null
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const profile = await getProfile()

  if (!profile || !profile.activo) {
    await supabase.auth.signOut()
    redirect('/login?error=sin_acceso')
  }

  // Verificar permisos por ruta (solo usuarios no-admin)
  if (profile.role !== 'admin') {
    const pathname = headers().get('x-pathname') ?? ''

    // Rutas solo para admin
    if (pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/')) {
      redirect('/dashboard/mensajes')
    }

    // Verificar permiso de sección
    const seccion = getSeccion(pathname)
    if (seccion && !tienePermiso(profile, seccion)) {
      const orden: Seccion[] = ['ventas', 'envios', 'productos', 'clientes', 'gastos', 'cajas', 'inversiones', 'reuniones', 'objetivos', 'cotizador']
      const primera = orden.find(s => tienePermiso(profile, s))
      redirect(primera ? `/dashboard/${primera}` : '/dashboard/mensajes')
    }
  }

  return (
    <PrivacyProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar profile={profile} />
        <main className="flex-1 lg:ml-64 transition-all duration-300">
          <div className="p-6 lg:p-8 pt-16 lg:pt-8">{children}</div>
        </main>
      </div>
    </PrivacyProvider>
  )
}
