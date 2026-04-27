export type Seccion =
  | 'ventas' | 'productos' | 'clientes' | 'gastos'
  | 'cajas' | 'inversiones'
  | 'reuniones' | 'objetivos' | 'envios'

export const TODAS_SECCIONES: Seccion[] = [
  'ventas', 'productos', 'clientes', 'gastos',
  'cajas', 'inversiones',
  'reuniones', 'objetivos', 'envios',
]

export const LABELS_SECCION: Record<Seccion, string> = {
  ventas: 'Ventas',
  productos: 'Productos',
  clientes: 'Clientes',
  gastos: 'Gastos',
  cajas: 'Cajas',
  inversiones: 'Marketing',
  reuniones: 'Reuniones',
  objetivos: 'Objetivos',
  envios: 'Envíos',
}

export interface UserProfile {
  id: string
  nombre: string
  role: 'admin' | 'user'
  activo: boolean
  permisos: Record<Seccion, boolean>
}

export function tienePermiso(profile: UserProfile | null, seccion: Seccion): boolean {
  if (!profile) return false
  if (!profile.activo) return false
  if (profile.role === 'admin') return true
  return profile.permisos?.[seccion] === true
}
