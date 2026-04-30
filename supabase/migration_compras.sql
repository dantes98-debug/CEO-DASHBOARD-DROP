-- Proveedores
create table if not exists proveedores (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  contacto text,
  email text,
  telefono text,
  notas text,
  created_at timestamptz default now()
);

-- Compras
create table if not exists compras (
  id uuid default gen_random_uuid() primary key,
  fecha date not null,
  proveedor_id uuid references proveedores(id) on delete set null,
  producto_id uuid references productos(id) on delete set null,
  descripcion text not null,
  cantidad numeric not null default 1,
  precio_unit numeric not null,
  moneda text not null default 'ars' check (moneda in ('ars', 'usd')),
  tipo_cambio numeric not null default 1,
  iva_pct numeric not null default 21,
  neto numeric not null,
  iva_monto numeric not null,
  monto_total numeric not null,
  monto_ars numeric not null,
  estado_pago text not null default 'pendiente' check (estado_pago in ('pagado', 'pendiente', 'parcial')),
  monto_pagado numeric not null default 0,
  notas text,
  created_at timestamptz default now()
);

-- RLS
alter table proveedores enable row level security;
alter table compras enable row level security;

create policy "authenticated_all" on proveedores for all to authenticated using (true) with check (true);
create policy "authenticated_all" on compras for all to authenticated using (true) with check (true);
