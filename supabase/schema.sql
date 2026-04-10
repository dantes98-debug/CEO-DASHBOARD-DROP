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

-- Policies: authenticated users can do everything
create policy "authenticated_all" on estudios for all to authenticated using (true) with check (true);
create policy "authenticated_all" on clientes for all to authenticated using (true) with check (true);
create policy "authenticated_all" on ventas for all to authenticated using (true) with check (true);
create policy "authenticated_all" on productos for all to authenticated using (true) with check (true);
create policy "authenticated_all" on gastos for all to authenticated using (true) with check (true);
create policy "authenticated_all" on comisiones for all to authenticated using (true) with check (true);
create policy "authenticated_all" on stock for all to authenticated using (true) with check (true);
create policy "authenticated_all" on cajas for all to authenticated using (true) with check (true);
create policy "authenticated_all" on movimientos_caja for all to authenticated using (true) with check (true);
create policy "authenticated_all" on inversiones for all to authenticated using (true) with check (true);
create policy "authenticated_all" on reuniones for all to authenticated using (true) with check (true);
create policy "authenticated_all" on objetivos for all to authenticated using (true) with check (true);
