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

function redirigirA(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
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

  if (pathname.startsWith('/dashboard') && !user) {
    return redirigirA(request, '/login')
  }

  if (pathname === '/login' && user) {
    return redirigirA(request, '/dashboard')
  }

  // Verificar permisos de sección para usuarios logueados en /dashboard/*
  if (pathname.startsWith('/dashboard') && user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, permisos, activo')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.activo) {
      await supabase.auth.signOut()
      return redirigirA(request, '/login?error=sin_acceso')
    }

    // Los admins pasan siempre
    if (profile.role === 'admin') return supabaseResponse

    // Rutas solo para admin
    if (pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/')) {
      return redirigirA(request, '/dashboard')
    }

    // Verificar permiso de la sección
    const seccion = getSeccion(pathname)
    if (seccion && !profile.permisos?.[seccion]) {
      const orden = ['ventas', 'envios', 'productos', 'clientes', 'gastos', 'cajas', 'inversiones', 'reuniones', 'objetivos', 'cotizador']
      const primera = orden.find(s => profile.permisos?.[s])
      return redirigirA(request, primera ? `/dashboard/${primera}` : '/login')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
