import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const RUTA_SECCION: Record<string, string> = {
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

function getSeccion(pathname: string): string | null {
  if (pathname === '/dashboard') return 'resumen'
  for (const [route, seccion] of Object.entries(RUTA_SECCION)) {
    if (route !== '/dashboard' && (pathname === route || pathname.startsWith(route + '/'))) {
      return seccion
    }
  }
  return null
}

function redirect(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Sin sesión → al login
  if (pathname.startsWith('/dashboard') && !user) {
    return redirect(request, '/login')
  }

  // Ya logueado → al dashboard
  if (pathname === '/login' && user) {
    return redirect(request, '/dashboard')
  }

  // Verificar permisos en rutas del dashboard
  if (pathname.startsWith('/dashboard') && user) {
    // Rutas sin control de permisos (admin solo para admins se maneja abajo)
    const sinControl = ['/dashboard/mensajes']
    if (sinControl.some(r => pathname === r || pathname.startsWith(r + '/'))) {
      return supabaseResponse
    }

    let profile: { role: string; permisos: Record<string, boolean>; activo: boolean } | null = null
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('role, permisos, activo')
        .eq('id', user.id)
        .single()
      profile = data
    } catch {
      // Si falla la query, dejamos pasar (fail open)
      return supabaseResponse
    }

    // Sin perfil o inactivo → login
    if (!profile || !profile.activo) {
      return redirect(request, '/login')
    }

    // Admin pasa siempre
    if (profile.role === 'admin') return supabaseResponse

    // Ruta solo admin
    if (pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/')) {
      return redirect(request, '/dashboard/mensajes')
    }

    // Verificar permiso de sección
    const seccion = getSeccion(pathname)
    if (seccion && !profile.permisos?.[seccion]) {
      // Buscar primera sección disponible
      const orden = ['ventas', 'envios', 'productos', 'clientes', 'gastos', 'cajas', 'inversiones', 'reuniones', 'objetivos', 'cotizador']
      const primera = orden.find(s => profile!.permisos?.[s])
      // Siempre hay una ruta válida (mensajes no requiere permiso), nunca loop
      return redirect(request, primera ? `/dashboard/${primera}` : '/dashboard/mensajes')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
