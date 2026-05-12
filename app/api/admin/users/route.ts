import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  nombre:   z.string().min(1).max(100).optional(),
  role:     z.enum(['admin', 'user']).default('user'),
  permisos: z.record(z.string(), z.boolean()).optional().default({}),
})

const UpdateUserSchema = z.object({
  id:      z.string().uuid('ID inválido'),
  nombre:  z.string().min(1).max(100).optional(),
  role:    z.enum(['admin', 'user']).optional(),
  activo:  z.boolean().optional(),
  permisos: z.record(z.string(), z.boolean()).optional(),
})

const DeleteUserSchema = z.object({
  id: z.string().uuid('ID inválido'),
})

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function isAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, userId: null }
  // Use service role to bypass RLS
  const service = getServiceClient()
  const { data } = await service.from('user_profiles').select('role, activo').eq('id', user.id).single()
  return { ok: data?.role === 'admin' && data?.activo === true, userId: user.id }
}

// GET: list all users
export async function GET() {
  const { ok } = await isAdmin()
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const service = getServiceClient()
  const { data: { users }, error } = await service.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profiles } = await service.from('user_profiles').select('*')

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
  const { ok } = await isAdmin()
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { email, password, nombre, role, permisos } = parsed.data

  const service = getServiceClient()
  const { data: { user }, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !user) return NextResponse.json({ error: error?.message || 'Error al crear usuario' }, { status: 500 })

  await service.from('user_profiles').insert({
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
  const { ok } = await isAdmin()
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id, nombre, role, activo, permisos } = parsed.data

  const service = getServiceClient()
  const { error } = await service.from('user_profiles')
    .update({ nombre, role, activo, permisos })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: delete user
export async function DELETE(request: Request) {
  const { ok } = await isAdmin()
  if (!ok) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const parsed = DeleteUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { id } = parsed.data
  const service = getServiceClient()
  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
