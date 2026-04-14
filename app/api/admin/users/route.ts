import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdmin } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function isAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  return data?.role === 'admin'
}

// GET: list all users
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const admin = getAdminClient()
  const { data: { users }, error } = await admin.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const supabase = createClient()
  const { data: profiles } = await supabase.from('user_profiles').select('*')

  const merged = users.map((u) => {
    const profile = profiles?.find((p) => p.id === u.id)
    return {
      id: u.id,
      email: u.email,
      nombre: profile?.nombre || '',
      role: profile?.role || 'user',
      activo: profile?.activo ?? true,
      permisos: profile?.permisos || {},
      tiene_perfil: !!profile,
    }
  })

  return NextResponse.json({ users: merged })
}

// POST: create new user
export async function POST(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { email, password, nombre, role, permisos } = await request.json()
  if (!email || !password) return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 })

  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !user) return NextResponse.json({ error: error?.message || 'Error al crear usuario' }, { status: 500 })

  // Create profile
  const supabase = createClient()
  await supabase.from('user_profiles').insert({
    id: user.id,
    nombre: nombre || email.split('@')[0],
    role: role || 'user',
    activo: true,
    permisos: permisos || {},
  })

  return NextResponse.json({ ok: true, id: user.id })
}

// PATCH: update user profile
export async function PATCH(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id, nombre, role, activo, permisos } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const supabase = createClient()
  const { error } = await supabase.from('user_profiles')
    .update({ nombre, role, activo, permisos })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: delete user
export async function DELETE(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await request.json()
  const admin = getAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
