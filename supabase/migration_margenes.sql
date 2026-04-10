-- Migrate productos table: add SKU and costo_usd, keep precio_venta
alter table productos add column if not exists sku text;
alter table productos add column if not exists costo_usd numeric default 0;

-- Make sku unique for upsert
create unique index if not exists productos_sku_unique on productos(sku) where sku is not null;

-- Config table for global settings (e.g. tipo de cambio)
create table if not exists config (
  clave text primary key,
  valor text not null,
  updated_at timestamptz default now()
);

alter table config enable row level security;
create policy "authenticated_all" on config for all to authenticated using (true) with check (true);

-- Seed default tipo de cambio
insert into config (clave, valor) values ('tipo_cambio', '1000') on conflict (clave) do nothing;
