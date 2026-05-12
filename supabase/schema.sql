-- Architecture firms (derivadores) - must be created before clientes
create table estudios (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  contacto text,
  comision_pct numeric default 5,
  created_at timestamptz default now()
);

-- Clients
create table clientes (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  email text,
  telefono text,
  estudio_id uuid references estudios(id),
  created_at timestamptz default now()
);

-- Sales
create table ventas (
  id uuid default gen_random_uuid() primary key,
  fecha date not null,
  cliente_id uuid references clientes(id),
  monto numeric not null,
  descripcion text,
  archivo_url text,
  created_at timestamptz default now()
);

-- Products
create table productos (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  costo numeric not null,
  precio_venta numeric not null,
  created_at timestamptz default now()
);

-- Expenses
create table gastos (
  id uuid default gen_random_uuid() primary key,
  fecha date not null,
  categoria text not null,
  descripcion text,
  monto numeric not null,
  created_at timestamptz default now()
);

-- Commissions
create table comisiones (
  id uuid default gen_random_uuid() primary key,
  estudio_id uuid references estudios(id),
  venta_id uuid references ventas(id),
  monto numeric not null,
  pagada boolean default false,
  fecha date not null,
  created_at timestamptz default now()
);

-- Stock
create table stock (
  id uuid default gen_random_uuid() primary key,
  producto text not null,
  tipo text check (tipo in ('propio', 'reventa')) not null,
  cantidad numeric not null,
  precio_lista numeric not null,
  proveedor text,
  created_at timestamptz default now()
);

-- Cash registers
create table cajas (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  saldo_actual numeric default 0,
  created_at timestamptz default now()
);

create table movimientos_caja (
  id uuid default gen_random_uuid() primary key,
  caja_id uuid references cajas(id),
  tipo text check (tipo in ('ingreso', 'egreso')) not null,
  monto numeric not null,
  descripcion text,
  fecha date not null,
  created_at timestamptz default now()
);

-- Investments
create table inversiones (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  monto_inicial numeric not null,
  valor_actual numeric not null,
  fecha_inicio date not null,
  tipo text,
  notas text,
  created_at timestamptz default now()
);

-- Meetings
create table reuniones (
  id uuid default gen_random_uuid() primary key,
  fecha date not null,
  titulo text not null,
  socio text not null,
  tipo text,
  notas text,
  created_at timestamptz default now()
);

-- Objectives
create table objetivos (
  id uuid default gen_random_uuid() primary key,
  socio text not null,
  titulo text not null,
  descripcion text,
  meta numeric not null,
  actual numeric default 0,
  unidad text,
  periodo text,
  created_at timestamptz default now()
);

-- Row Level Security (enable for all tables)
alter table estudios enable row level security;
alter table clientes enable row level security;
alter table ventas enable row level security;
alter table productos enable row level security;
alter table gastos enable row level security;
alter table comisiones enable row level security;
alter table stock enable row level security;
alter table cajas enable row level security;
alter table movimientos_caja enable row level security;
alter table inversiones enable row level security;
alter table reuniones enable row level security;
alter table objetivos enable row level security;

-- Helper functions
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin' and activo = true)
$$;

create or replace function public.is_active_user()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and activo = true)
$$;

-- Tier 1: admin only (datos financieros sensibles)
create policy "admin_only" on inversiones for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_only" on cajas for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_only" on movimientos_caja for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_only" on config for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tier 2: usuarios activos (acceso general)
create policy "active_users" on ventas for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on compras for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on gastos for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on clientes for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on estudios for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on productos for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on proveedores for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on comisiones for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on kpi_objetivos for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on reuniones for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on objetivos for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "active_users" on importaciones for all to authenticated using (public.is_active_user()) with check (public.is_active_user());

-- Audit log (solo admins pueden leer)
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  tabla       text        not null,
  operacion   text        not null check (operacion in ('INSERT','UPDATE','DELETE')),
  registro_id text,
  usuario_id  uuid        references auth.users(id) on delete set null,
  datos_antes jsonb,
  datos_despues jsonb,
  created_at  timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy "admin_only" on public.audit_log for select to authenticated using (public.is_admin());
