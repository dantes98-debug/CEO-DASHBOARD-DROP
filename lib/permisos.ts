export type Seccion =
  | 'resumen' | 'ventas' | 'productos' | 'clientes' | 'gastos'
  | 'compras' | 'cajas' | 'inversiones' | 'margenes' | 'stock' | 'comisiones'
  | 'reuniones' | 'objetivos' | 'envios' | 'cotizador' | 'ecommerce' | 'pl' | 'cashflow'
  | 'adeudados'

export const TODAS_SECCIONES: Seccion[] = [
  'resumen', 'ventas', 'productos', 'clientes', 'gastos',
  'compras', 'cajas', 'inversiones', 'margenes', 'stock', 'comisiones',
  'reuniones', 'objetivos', 'envios', 'cotizador', 'ecommerce', 'pl', 'cashflow',
  'adeudados',
]

export const LABELS_SECCION: Record<Seccion, string> = {
  resumen: 'Resumen',
  ventas: 'Ventas',
  productos: 'Productos',
  clientes: 'Clientes',
  gastos: 'Gastos',
  compras: 'Compras',
  cajas: 'Cajas',
  inversiones: 'Campañas & Inv.',
  margenes: 'Márgenes',
  stock: 'Stock',
  comisiones: 'Comisiones',
  reuniones: 'Reuniones',
  objetivos: 'Objetivos',
  envios: 'Envíos',
  cotizador: 'Cotizador',
  ecommerce: 'Ecommerce',
  pl: 'P&L',
  cashflow: 'Flujo de Caja',
  adeudados: 'Adeudados',
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
