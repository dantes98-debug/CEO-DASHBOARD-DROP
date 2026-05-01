-- ─── Stock ↔ Ventas integration + stock tipo ────────────────────────────────

-- 1. Add estado column to ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado text DEFAULT 'pendiente'
  CHECK (estado IN ('pendiente', 'entregado', 'cancelado'));

-- 2. Add tipo column to stock (motic = intermediated via MOTIC, propio = Drop's own stock)
ALTER TABLE stock ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'motic'
  CHECK (tipo IN ('motic', 'propio'));

-- 3. Atomic stock update functions (prevent race conditions)

CREATE OR REPLACE FUNCTION reservar_stock(p_sku text, p_cantidad numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE stock
  SET cantidad_reserva = COALESCE(cantidad_reserva, 0) + p_cantidad
  WHERE sku = p_sku;
$$;

CREATE OR REPLACE FUNCTION entregar_stock(p_sku text, p_cantidad numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE stock
  SET
    cantidad_total    = GREATEST(0, cantidad_total - p_cantidad),
    cantidad_reserva  = GREATEST(0, COALESCE(cantidad_reserva, 0) - p_cantidad)
  WHERE sku = p_sku;
$$;

CREATE OR REPLACE FUNCTION liberar_reserva(p_sku text, p_cantidad numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE stock
  SET cantidad_reserva = GREATEST(0, COALESCE(cantidad_reserva, 0) - p_cantidad)
  WHERE sku = p_sku;
$$;

GRANT EXECUTE ON FUNCTION reservar_stock(text, numeric)  TO authenticated;
GRANT EXECUTE ON FUNCTION entregar_stock(text, numeric)  TO authenticated;
GRANT EXECUTE ON FUNCTION liberar_reserva(text, numeric) TO authenticated;
