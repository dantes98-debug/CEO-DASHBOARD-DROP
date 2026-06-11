# Plan de mejoras — CEO Dashboard Drop

> Ejecutar en orden. Cada bloque es independiente y testeable.
> Stack: Next.js 14 App Router, Supabase, Tailwind, TypeScript.

---

## BLOQUE 1 — Páginas ocultas: agregar al sidebar y permisos (30 min)

Existen tres páginas completas que no aparecen en la navegación:
- `/dashboard/margenes` → gestión de márgenes por producto
- `/dashboard/stock` → inventario por depósito (Nordelta, Villa Martelli, Reserva)
- `/dashboard/comisiones` → comisiones a estudios de arquitectura

### 1.1 — `lib/permisos.ts`

Agregar `'margenes' | 'stock' | 'comisiones'` al tipo `Seccion` y a los arrays/objetos correspondientes:

```ts
export type Seccion =
  | 'resumen' | 'ventas' | 'productos' | 'clientes' | 'gastos'
  | 'compras' | 'cajas' | 'inversiones' | 'margenes' | 'stock' | 'comisiones'
  | 'reuniones' | 'objetivos' | 'envios' | 'cotizador' | 'ecommerce'

export const TODAS_SECCIONES: Seccion[] = [
  'resumen', 'ventas', 'productos', 'clientes', 'gastos',
  'compras', 'cajas', 'inversiones', 'margenes', 'stock', 'comisiones',
  'reuniones', 'objetivos', 'envios', 'cotizador', 'ecommerce',
]

export const LABELS_SECCION: Record<Seccion, string> = {
  // ... existentes ...
  margenes: 'Márgenes',
  stock: 'Stock',
  comisiones: 'Comisiones',
}
```

### 1.2 — `app/dashboard/layout.tsx`

Agregar las tres rutas al mapa `RUTA_SECCION`:

```ts
'/dashboard/margenes':   'margenes',
'/dashboard/stock':      'stock',
'/dashboard/comisiones': 'comisiones',
```

### 1.3 — `components/Sidebar.tsx`

Agregar al array `navItems` (importar los iconos necesarios de lucide-react: `Percent`, `Package`, `HandCoins`):

```ts
{ href: '/dashboard/margenes',   label: 'Márgenes',   icon: Percent,   seccion: 'margenes' },
{ href: '/dashboard/stock',      label: 'Stock',       icon: Package,   seccion: 'stock' },
{ href: '/dashboard/comisiones', label: 'Comisiones',  icon: HandCoins, seccion: 'comisiones' },
```

Posición sugerida: Márgenes después de Productos, Stock después de Márgenes, Comisiones después de Ventas.

---

## BLOQUE 2 — Sidebar con grupos visuales (45 min)

El sidebar actual es una lista flat de 14 ítems sin estructura. Agruparla con separadores/headers mejora la lectura y la velocidad de navegación.

### 2.1 — `components/Sidebar.tsx`

Cambiar `navItems` de array plano a array con grupos:

```ts
const navGroups = [
  {
    label: 'Finanzas',
    items: [
      { href: '/dashboard',           label: 'Resumen',     icon: LayoutDashboard, exact: true, seccion: 'resumen' },
      { href: '/dashboard/ventas',    label: 'Ventas',      icon: TrendingUp,      seccion: 'ventas' },
      { href: '/dashboard/gastos',    label: 'Gastos',      icon: Receipt,         seccion: 'gastos' },
      { href: '/dashboard/cajas',     label: 'Cajas',       icon: Landmark,        seccion: 'cajas' },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { href: '/dashboard/compras',   label: 'Compras',     icon: ShoppingCart,    seccion: 'compras' },
      { href: '/dashboard/envios',    label: 'Envíos',      icon: Truck,           seccion: 'envios' },
      { href: '/dashboard/stock',     label: 'Stock',       icon: Package,         seccion: 'stock' },
      { href: '/dashboard/ecommerce', label: 'Ecommerce',   icon: Store,           seccion: 'ecommerce' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/dashboard/clientes',    label: 'Clientes',    icon: Users,        seccion: 'clientes' },
      { href: '/dashboard/comisiones',  label: 'Comisiones',  icon: HandCoins,    seccion: 'comisiones' },
      { href: '/dashboard/cotizador',   label: 'Cotizador',   icon: ClipboardList,seccion: 'cotizador' },
    ],
  },
  {
    label: 'Productos',
    items: [
      { href: '/dashboard/productos', label: 'Catálogo',    icon: Boxes,         seccion: 'productos' },
      { href: '/dashboard/margenes',  label: 'Márgenes',    icon: Percent,       seccion: 'margenes' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/dashboard/inversiones', label: 'Campañas',    icon: LineChart,   seccion: 'inversiones' },
    ],
  },
  {
    label: 'Estrategia',
    items: [
      { href: '/dashboard/objetivos',  label: 'Objetivos',   icon: Target,       seccion: 'objetivos' },
      { href: '/dashboard/reuniones',  label: 'Calendario',  icon: CalendarDays, seccion: 'reuniones' },
      { href: '/dashboard/mensajes',   label: 'Mensajes',    icon: MessageSquare },
    ],
  },
  {
    label: null, // sin header
    items: [
      { href: '/dashboard/admin', label: 'Usuarios', icon: Shield, adminOnly: true },
    ],
  },
]
```

En el render, iterar `navGroups`, mostrar el `label` del grupo como header pequeño (`text-[10px] uppercase tracking-widest text-text-muted px-3 pt-3 pb-1`) y luego los ítems. Mantener toda la lógica de `tienePermiso` y `adminOnly` existente.

---

## BLOQUE 3 — Renombrar "Marketing" → "Campañas & Inversiones" y reorganizar la página (1 hora)

La página `/dashboard/inversiones` tiene 4 tabs: Inversiones, Marketing, Importaciones, Estudios.
Son conceptos distintos que merecen más claridad. En este bloque no los separamos en rutas distintas (eso es riesgo mayor), sino que mejoramos la navegación interna y el label.

### 3.1 — `lib/permisos.ts`

Cambiar el label de `inversiones`:
```ts
inversiones: 'Campañas & Inv.',
```

### 3.2 — `components/Sidebar.tsx`

En el grupo Marketing, el label del ítem ya dice "Campañas" (definido en bloque 2).

### 3.3 — `app/dashboard/inversiones/page.tsx`

- Cambiar el título del `PageHeader` de "Inversiones / Marketing" a algo más descriptivo.
- Hacer los tabs más prominentes — actualmente se pierden. Usar un tab bar con íconos:
  - Inversiones → `TrendingUp`
  - Marketing/Pauta → `Megaphone`
  - Importaciones → `Ship`
  - Estudios → `BookOpen`
- El tab activo debería reflejarse en la URL via `?tab=marketing` para que compartir el link lleve al tab correcto. Usar `useSearchParams` para leer y `router.push` para escribir.

---

## BLOQUE 4 — Nueva página: P&L / Estado de Resultados (2-3 horas)

**Esta es la mejora de mayor impacto.** Los datos ya están en Supabase; falta la vista.

### 4.1 — Crear `app/dashboard/pl/page.tsx`

Vista de Estado de Resultados mensual con cascada:

```
Facturación bruta
− IVA facturado
= Facturación neta
− Costo de mercadería vendida
= Margen bruto          [% margen bruto]
− Sueldos
− Gastos fijos
− Gastos variables
− Publicidad / Ads
= EBITDA
− Comisiones a estudios
= Ganancia neta         [% margen neto]
```

**Fuentes de datos:**
- `ventas`: `monto_ars`, `iva_monto`, `costo`, canal
- `gastos`: por `tipo` ('fijo', 'variable', 'sueldo', 'publicidad')
- `comisiones`: `monto` donde `pagada = true`

**UI:**
- Selector de mes/año (reusar `MonthPicker`)
- Tabla de cascada con formato de cuenta de resultados
- Columna adicional con % sobre facturación bruta para cada línea
- Comparativo vs mes anterior (delta absoluto y porcentual)
- Gráfico de barras apiladas: Costos / Gastos / Comisiones / Ganancia → suma = Facturación
- Modo "Año completo": tabla con 12 columnas (una por mes) y fila de totales

**KPIs destacados arriba:**
- Facturación del mes
- Ganancia neta
- Margen neto %
- vs mes anterior

### 4.2 — Agregar a sidebar, permisos y layout

En `lib/permisos.ts`: agregar `'pl'` al tipo Seccion.
En `app/dashboard/layout.tsx`: agregar `'/dashboard/pl': 'pl'`.
En `components/Sidebar.tsx`: agregar en grupo Finanzas, entre Resumen y Ventas:
```ts
{ href: '/dashboard/pl', label: 'P&L', icon: FileText, seccion: 'pl' }
```

---

## BLOQUE 5 — Ecommerce en el Resumen general (1 hora)

El Resumen muestra facturación total pero no desglosa canal online vs presencial.

### 5.1 — `app/dashboard/page.tsx`

En la query de ventas ya se trae `canal`. Agregar al cálculo:

```ts
const ventasEcommerce = ventas.filter(v => v.canal === 'ecommerce')
const ventasPresencial = ventas.filter(v => v.canal !== 'ecommerce')
const facturacionOnline = ventasEcommerce.reduce((s, v) => s + v.monto_ars, 0)
const facturacionPresencial = ventasPresencial.reduce((s, v) => s + v.monto_ars, 0)
const pctOnline = facturacionTotal > 0 ? (facturacionOnline / facturacionTotal) * 100 : 0
```

Agregar una sección visual nueva en el Resumen (debajo de los KPIs anuales):

```
Canal de ventas — [año]
Online [barra] XX%   $XXX.XXX
Presencial [barra] XX%   $XXX.XXX
```

Implementar con dos barras horizontales proporcionales usando divs con `width: X%`, estilo consistente con el resto del dashboard.

### 5.2 — Mismo desglose en el gráfico mensual

El `chartData` actual tiene `facturacion` total. Agregar `facturacion_online` y `facturacion_presencial` como dos barras en el `BarChart` (stacked o side-by-side).

---

## BLOQUE 6 — Flujo de caja proyectado (2 horas)

Nueva página en `/dashboard/cashflow` que muestre los próximos 90 días.

### 6.1 — Crear `app/dashboard/cashflow/page.tsx`

**Lógica:**

Entradas esperadas (próximos 90 días):
- Ventas con `cobrada = false` → agrupar por `fecha` estimada de cobro
- Valor actual de cajas (saldo actual como punto de partida)

Salidas comprometidas:
- Compras con estado pendiente de pago
- Gastos fijos del mes siguiente (tomar gastos fijos recurrentes del mes actual como proxy)

**UI:**
- Timeline de 90 días con barra de saldo proyectado por semana
- Tabla: Fecha | Concepto | Entrada | Salida | Saldo acumulado
- Alerta visual si el saldo proyectado cae a negativo en algún punto
- KPIs: Saldo actual / Entradas próximos 30d / Salidas próximas 30d / Saldo proyectado 30d

**Datos necesarios de Supabase:**
```sql
-- Ventas pendientes de cobro
SELECT fecha, monto_ars, descripcion, numero_factura
FROM ventas WHERE cobrada = false AND fecha >= today

-- Compras pendientes
SELECT fecha_estimada, monto_total, proveedor, estado
FROM compras WHERE estado IN ('pendiente', 'en_transito')

-- Saldo actual de cajas
SELECT nombre, saldo FROM cajas
```

### 6.2 — Agregar a permisos y sidebar (mismo patrón que bloque 4)

---

## BLOQUE 7 — Mejoras menores de UX (dispersas, 1-2 horas total)

### 7.1 — Ventas: separar vista CEO de vista operativa

En `/dashboard/ventas/page.tsx` agregar un toggle visible solo para admin:
**"Vista CEO"** → muestra solo gráficos, KPIs y resumen por canal/origen. Sin tabla de transacciones.
**"Vista operativa"** → vista actual completa.

Implementar con `useState<'ceo' | 'operativa'>('ceo')` para admins y forzar 'operativa' para usuarios.

### 7.2 — Alertas automáticas

En `/components/AlertasBell.tsx` (ya existe el componente) agregar lógica de alertas calculadas:
- Ventas del mes actual < 70% del mes anterior → alerta amarilla
- Ninguna venta en los últimos 3 días → alerta naranja
- Saldo de alguna caja < $50.000 → alerta roja
- Compras en tránsito hace más de 45 días → alerta amarilla

Calcular estas alertas en un API route `/api/alertas` que las computa contra Supabase y las cachea 30 minutos. El componente `AlertasBell` ya existe, solo hay que alimentarlo con datos reales en lugar de los hardcodeados que tenga ahora.

### 7.3 — Resumen: añadir comparativo YoY

En el Resumen general, al lado de cada KPI anual mostrar la variación vs el año anterior:
`▲ 23%` en verde o `▼ 8%` en rojo.

Los datos del año anterior ya se pueden calcular filtrando `ventas` y `gastos` por año.

---

## BLOQUE 8 — Supabase: índices de performance (30 min)

Con el crecimiento de datos, estas queries se van a volver lentas:

```sql
-- Ejecutar en Supabase SQL Editor
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_canal ON ventas(canal);
CREATE INDEX IF NOT EXISTS idx_ventas_cobrada ON ventas(cobrada);
CREATE INDEX IF NOT EXISTS idx_ventas_numero_factura ON ventas(numero_factura);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_tipo ON gastos(tipo);
CREATE INDEX IF NOT EXISTS idx_compras_estado ON compras(estado);
```

---

## Orden de ejecución recomendado

| Prioridad | Bloque | Impacto | Esfuerzo |
|-----------|--------|---------|----------|
| 1 | Bloque 1 — Páginas ocultas al sidebar | Alto | Bajo |
| 2 | Bloque 8 — Índices Supabase | Alto | Muy bajo |
| 3 | Bloque 4 — P&L | Muy alto | Medio |
| 4 | Bloque 2 — Sidebar agrupado | Medio | Bajo |
| 5 | Bloque 5 — Ecommerce en Resumen | Alto | Medio |
| 6 | Bloque 7.2 — Alertas automáticas | Alto | Medio |
| 7 | Bloque 3 — Reorganizar Inversiones | Medio | Medio |
| 8 | Bloque 6 — Flujo de caja | Muy alto | Alto |
| 9 | Bloque 7.1 — Vista CEO en Ventas | Medio | Bajo |
| 10 | Bloque 7.3 — YoY en Resumen | Medio | Bajo |

---

## Notas para Claude Code

- Mantener el patrón `'use client'` en todas las páginas (no hay RSC en el dashboard)
- Usar siempre `createClient` de `@/lib/supabase` (cliente browser), no el de server
- Los componentes `PageHeader`, `MetricCard`, `MonthPicker`, `Private`, `Modal`, `RowMenu`, `ConfirmDialog` ya existen y hay que reusar
- Para formateo: `formatCurrency`, `formatDate`, `formatPercent` de `@/lib/utils`
- Para charts: `recharts` (BarChart, LineChart, ComposedChart) — ya está instalado
- No crear archivos CSS separados, todo inline con Tailwind
- Variables CSS de tema: `var(--color-card)`, `var(--color-border)`, `var(--color-text-primary)`, `var(--color-text-muted)`, `var(--color-accent)`, `var(--color-card-hover)`
- Al agregar una sección nueva, siempre tocar los 3 archivos: `lib/permisos.ts` + `app/dashboard/layout.tsx` + `components/Sidebar.tsx`
- No modificar el schema de Supabase sin confirmación explícita (solo leer)
