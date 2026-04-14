export type Seccion =
  | 'ventas' | 'margenes' | 'clientes' | 'gastos'
  | 'comisiones' | 'stock' | 'cajas' | 'inversiones'
  | 'reuniones' | 'objetivos'

export const TODAS_SECCIONES: Seccion[] = [
  'ventas', 'margenes', 'clientes', 'gastos',
  'comisiones', 'stock', 'cajas', 'inversiones',
  'reuniones', 'objetivos',
]

export const LABELS_SECCION: Record<Seccion, string> = {
  ventas: 'Ventas',
  margenes: 'Márgenes',
  clientes: 'Clientes',
  gastos: 'Gastos',
  comisiones: 'Comisiones',
  stock: 'Stock',
  cajas: 'Cajas',
  inversiones: 'Inversiones',
  reuniones: 'Reuniones',
  objetivos: 'Objetivos',
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
