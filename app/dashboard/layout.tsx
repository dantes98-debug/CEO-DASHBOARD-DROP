import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getProfile } from '@/lib/get-profile'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const profile = await getProfile()

  // Si el usuario no tiene perfil o está inactivo, cerrar sesión
  if (!profile || !profile.activo) {
    await supabase.auth.signOut()
    redirect('/login?error=sin_acceso')
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar profile={profile} />
      <main className="flex-1 lg:ml-64 transition-all duration-300">
        <div className="p-6 lg:p-8 pt-16 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
