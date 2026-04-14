'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { Shield, Plus, Pencil, Trash2, X, Check, User } from 'lucide-react'
import Modal from '@/components/Modal'
import { TODAS_SECCIONES, LABELS_SECCION, type Seccion } from '@/lib/permisos'

interface UsuarioRow {
  id: string
  email: string
  nombre: string
  role: 'admin' | 'user'
  activo: boolean
  permisos: Record<Seccion, boolean>
  tiene_perfil: boolean
}

const defaultPermisos = (): Record<Seccion, boolean> =>
  Object.fromEntries(TODAS_SECCIONES.map((s) => [s, true])) as Record<Seccion, boolean>

export default function AdminPage() {
  const [users, setUsers] = useState<UsuarioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<UsuarioRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // New user form
  const [form, setForm] = useState({
    email: '',
    password: '',
    nombre: '',
    role: 'user' as 'admin' | 'user',
    permisos: defaultPermisos(),
  })

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const openNew = () => {
    setEditUser(null)
    setForm({ email: '', password: '', nombre: '', role: 'user', permisos: defaultPermisos() })
    setModalOpen(true)
  }

  const openEdit = (u: UsuarioRow) => {
    setEditUser(u)
    setForm({
      email: u.email,
      password: '',
      nombre: u.nombre,
      role: u.role,
      permisos: { ...defaultPermisos(), ...u.permisos },
    })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)

    if (editUser) {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editUser.id, nombre: form.nombre, role: form.role, activo: editUser.activo, permisos: form.permisos }),
      })
      const data = await res.json()
      if (data.ok) { setMsg({ type: 'ok', text: 'Usuario actualizado' }); setModalOpen(false); fetchUsers() }
      else setMsg({ type: 'error', text: data.error || 'Error' })
    } else {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.ok) { setMsg({ type: 'ok', text: 'Usuario creado' }); setModalOpen(false); fetchUsers() }
      else setMsg({ type: 'error', text: data.error || 'Error' })
    }
    setSaving(false)
  }

  const handleToggleActivo = async (u: UsuarioRow) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, nombre: u.nombre, role: u.role, activo: !u.activo, permisos: u.permisos }),
    })
    fetchUsers()
  }

  const handleDelete = async (u: UsuarioRow) => {
    if (!confirm(`¿Eliminar a ${u.email}? Esta acción no se puede deshacer.`)) return
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id }),
    })
    fetchUsers()
  }

  const togglePermiso = (s: Seccion) => {
    setForm((f) => ({ ...f, permisos: { ...f.permisos, [s]: !f.permisos[s] } }))
  }

  return (
    <div>
      <PageHeader
        title="Gestión de usuarios"
        description="Administrá accesos y permisos del dashboard"
        icon={Shield}
        action={
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo usuario
          </button>
        }
      />

      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {msg.type === 'ok' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted text-sm">Cargando usuarios...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-muted font-medium">Usuario</th>
                <th className="text-left py-3 px-4 text-muted font-medium">Rol</th>
                <th className="text-left py-3 px-4 text-muted font-medium">Estado</th>
                <th className="text-left py-3 px-4 text-muted font-medium hidden md:table-cell">Permisos</th>
                <th className="text-right py-3 px-4 text-muted font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{u.nombre || '—'}</p>
                        <p className="text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {u.role === 'admin' ? (
                      <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">Admin</span>
                    ) : (
                      <span className="text-xs bg-card-hover text-muted px-2 py-0.5 rounded-full">Usuario</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleToggleActivo(u)} className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${u.activo ? 'bg-green-500/10 text-green-400 hover:bg-red-500/10 hover:text-red-400' : 'bg-red-500/10 text-red-400 hover:bg-green-500/10 hover:text-green-400'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    {u.role === 'admin' ? (
                      <span className="text-xs text-muted">Acceso total</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {TODAS_SECCIONES.filter((s) => u.permisos?.[s]).map((s) => (
                          <span key={s} className="text-xs bg-background text-muted px-1.5 py-0.5 rounded">{LABELS_SECCION[s]}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-card-hover transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(u)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editUser ? 'Editar usuario' : 'Nuevo usuario'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          {msg && modalOpen && (
            <div className={`p-3 rounded-lg text-sm ${msg.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{msg.text}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre</label>
              <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Juan" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Rol</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}>
                <option value="user">Usuario</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {!editUser && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="usuario@empresa.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Contraseña</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" required minLength={6} />
              </div>
            </>
          )}

          {form.role === 'user' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Secciones habilitadas</label>
              <div className="grid grid-cols-2 gap-2">
                {TODAS_SECCIONES.map((s) => (
                  <label key={s} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${form.permisos[s] ? 'border-accent/50 bg-accent/5' : 'border-border bg-background'}`}>
                    <input
                      type="checkbox"
                      checked={form.permisos[s]}
                      onChange={() => togglePermiso(s)}
                      className="hidden"
                    />
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${form.permisos[s] ? 'bg-accent' : 'bg-card-hover border border-border'}`}>
                      {form.permisos[s] && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-text-secondary">{LABELS_SECCION[s]}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setForm((f) => ({ ...f, permisos: defaultPermisos() }))} className="text-xs text-accent hover:underline">Seleccionar todo</button>
                <span className="text-muted text-xs">·</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, permisos: Object.fromEntries(TODAS_SECCIONES.map((s) => [s, false])) as Record<Seccion, boolean> }))} className="text-xs text-muted hover:text-text-primary hover:underline">Quitar todo</button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-card-hover transition-colors text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
